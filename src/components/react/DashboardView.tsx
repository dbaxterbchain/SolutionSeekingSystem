import { useEffect, useRef, useState } from 'react';
import { useSession } from '../../lib/useSession';
import { isSupabaseConfigured } from '../../lib/supabase';
import { useEntitlement } from '../../lib/entitlement';
import { accountLink } from '../../lib/accountLink';
import {
  createChatSession,
  getChatSession,
  listChatSessions,
  updateChatSession,
  deleteChatSession,
  type AgentId,
  type ChatMessage,
  type ChatSession,
  type ChatAttachment,
} from '../../lib/chatSessions';
import { getContextMeta, MODE_CONTEXTS } from '../../lib/contexts';
import { track, getGaIds, type Tier } from '../../lib/analytics';
import { PLANS, priceCopy } from '../../data/pricing';
import { getFirstTouch } from '../../lib/attribution';
import { streamChat } from '../../lib/chatStream';
import { listDocuments, uploadAndRegister, type DocumentMeta } from '../../lib/documents';
import {
  fetchAssistants,
  duplicateAssistant,
  deleteAssistant,
  AssistantActionError,
  type Assistant,
  type AssistantsData,
} from '../../lib/assistantsClient';
import { useDialog } from './Dialog';
import MessageBubble from './chat/MessageBubble';
import Composer from './chat/Composer';
import Sidebar from './dashboard/Sidebar';
import AttachControl from './dashboard/AttachControl';
import DocumentsPanel from './dashboard/DocumentsPanel';
import AssistantEditor from './dashboard/AssistantEditor';
import ShareDialog from './dashboard/ShareDialog';
import WhiteLabelPanel from './dashboard/WhiteLabelPanel';
import OrgPanel from './dashboard/OrgPanel';

/** Client-side truncation guard: send at most the last N messages. */
const SENT_HISTORY_LIMIT = 30;

const AGENT_LABEL: Record<AgentId, string> = { guide: 'Guide', mentor: 'Mentor' };

/** What the chat surface is currently pointed at: a standard agent or an assistant. */
type Selection = { kind: 'agent'; agent: AgentId } | { kind: 'assistant'; assistant: Assistant };

/**
 * The subscriber dashboard: the full Guide/Mentor toolset plus specialized
 * assistants, with document attachments, in-place mode switching, and
 * cross-agent history.
 *
 * Gating mirrors the rest of the site: the UI fails OPEN (a failed entitlement
 * lookup still renders the dashboard) because /api/chat is the real gate.
 */
export default function DashboardView() {
  const { session, user, loading: sessionLoading } = useSession();
  const { entitlement, loading: entLoading, failed } = useEntitlement();

  const [selection, setSelection] = useState<Selection>({ kind: 'agent', agent: 'guide' });
  const [contextId, setContextId] = useState<string | null>(null); // mode, for agent selections only
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false); // saved chat's assistant is gone
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [recents, setRecents] = useState<ChatSession[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [documents, setDocuments] = useState<DocumentMeta[] | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([]);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [assistantsData, setAssistantsData] = useState<AssistantsData | null>(null);
  // The active workspace: null = Personal, else an org id. Everything (assistants,
  // documents, history) is scoped to it. Resolved from localStorage on mount.
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [workspaceResolved, setWorkspaceResolved] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Assistant | null>(null);
  const [sharing, setSharing] = useState<Assistant | null>(null);
  const [whiteLabelOpen, setWhiteLabelOpen] = useState(false);
  const [orgPanelOpen, setOrgPanelOpen] = useState(false);
  // Post-Teams-checkout hand-off: 'pending' while we wait for the webhook to
  // create the org, 'ready' once its workspace is live, 'slow' on timeout.
  const [orgSetup, setOrgSetup] = useState<'pending' | 'ready' | 'slow' | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { confirm, dialog } = useDialog();

  const isSubscriber = entitlement?.kind === 'subscriber';
  const canUseDashboard = isSubscriber || failed;

  const assistant = selection.kind === 'assistant' ? selection.assistant : null;
  const agent: AgentId = selection.kind === 'assistant' ? selection.assistant.base_agent : selection.agent;
  const activeContext = assistant ? assistant.context : contextId;
  const agentName = assistant ? assistant.name : AGENT_LABEL[agent];
  const agentModes = MODE_CONTEXTS.filter((m) => m.agents.includes(agent));
  const contextMeta = getContextMeta(activeContext, agent);

  const memberships = assistantsData?.memberships ?? [];
  const mine = assistantsData?.mine ?? [];
  const shared = assistantsData?.shared ?? [];
  // A person can belong to several orgs plus Personal; one workspace is "active" and
  // the server already scoped `mine`/`shared` to it, so no client-side org filter.
  const activeOrg = memberships.find((m) => m.orgId === activeOrgId) ?? null;
  const isManagerOfActive = activeOrg?.role === 'manager';
  const activeRole = activeOrg?.role ?? null;
  const ownsSelected = Boolean(assistant && mine.some((a) => a.id === assistant.id));
  const canManageSelected =
    ownsSelected ||
    Boolean(
      assistant?.org_id &&
        (assistant?.shared || (assistant?.member_share_ids.length ?? 0) > 0) &&
        memberships.some((m) => m.orgId === assistant.org_id && m.role === 'manager')
    );
  // Authoring (creating assistants, the document library) is off only for
  // client-only users; fails OPEN when the entitlement lookup failed, because
  // the server is the real gate (see the note on canUseDashboard).
  const canAuthor = entitlement?.kind === 'subscriber' ? entitlement.authoring !== false : true;
  const canCreateHere = activeOrgId ? activeRole !== 'client' : canAuthor;
  const canUseDocsHere = canCreateHere;
  // A client's uploads (chat attachments) always land in their Personal
  // library; the server refuses org-tagged documents for client seats.
  const docsOrgId = activeOrgId && activeRole === 'client' ? null : activeOrgId;

  const refreshRecents = () => {
    listChatSessions(activeOrgId).then(setRecents).catch(() => setRecents([]));
  };
  const refreshDocuments = () => {
    listDocuments(docsOrgId).then(setDocuments).catch(() => setDocuments([]));
  };
  const refreshAssistants = () => {
    fetchAssistants(activeOrgId)
      .then(setAssistantsData)
      .catch(() => setAssistantsData({ mine: [], shared: [], memberships: [] }));
  };

  // Resolve the stored workspace once, on the client (localStorage isn't available
  // during the prerendered shell). An org that turns out invalid is dropped below.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('sss-active-workspace');
      if (stored && stored !== 'personal') setActiveOrgId(stored);
    } catch {
      // ignore
    }
    setWorkspaceResolved(true);
  }, []);

  // Load everything for the active workspace, and reload whenever it changes.
  useEffect(() => {
    if (!user || !canUseDashboard || !workspaceResolved) return;
    refreshRecents();
    refreshDocuments();
    refreshAssistants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, canUseDashboard, workspaceResolved, activeOrgId]);

  // Drop a stored org the user no longer belongs to (back to Personal).
  useEffect(() => {
    if (activeOrgId && assistantsData && !memberships.some((m) => m.orgId === activeOrgId)) {
      setActiveOrgId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantsData]);

  // Persist the workspace choice ('personal' for the Personal workspace).
  useEffect(() => {
    if (!workspaceResolved) return; // don't clobber the stored value before reading it
    try {
      window.localStorage.setItem('sss-active-workspace', activeOrgId ?? 'personal');
    } catch {
      // ignore
    }
  }, [activeOrgId, workspaceResolved]);

  // Keep a selected assistant in sync after edits, and fall back to its base
  // agent if it was deleted or unshared away from us.
  useEffect(() => {
    if (!assistantsData || selection.kind !== 'assistant') return;
    const fresh = [...assistantsData.mine, ...assistantsData.shared].find(
      (a) => a.id === selection.assistant.id
    );
    if (fresh) setSelection({ kind: 'assistant', assistant: fresh });
    else setSelection({ kind: 'agent', agent: selection.assistant.base_agent });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistantsData]);

  // Resume ?chat=<id> once assistants are loaded (so an assistant chat resolves).
  useEffect(() => {
    if (!user || !canUseDashboard || assistantsData === null) return;
    const id = new URLSearchParams(window.location.search).get('chat');
    if (!id || chatId) return;
    getChatSession(id)
      .then((saved) => saved && openSaved(saved))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, canUseDashboard, assistantsData === null]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages]);

  const setChatUrl = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set('chat', id);
    else url.searchParams.delete('chat');
    window.history.replaceState(null, '', url);
  };

  const persist = async (next: ChatMessage[]) => {
    try {
      if (chatId) {
        await updateChatSession(chatId, { messages: next });
        refreshRecents();
      } else {
        const title = next.find((m) => m.role === 'user')?.content.slice(0, 60) ?? 'Untitled';
        const created = await createChatSession({
          agent,
          title,
          messages: next,
          context: activeContext,
          assistant_id: assistant?.id ?? null,
          org_id: activeOrgId,
        });
        setChatId(created.id);
        setChatUrl(created.id);
        refreshRecents();
      }
    } catch {
      // Persistence is best-effort; the conversation still lives in state.
    }
  };

  const resetConversation = () => {
    setMessages([]);
    setChatId(null);
    setError(null);
    setInput('');
    setPendingAttachments([]);
    setUnavailable(false);
    setChatUrl(null);
    setSidebarOpen(false);
  };

  const startAgent = (nextAgent: AgentId) => {
    if (streaming) return;
    setSelection({ kind: 'agent', agent: nextAgent });
    setContextId(null);
    resetConversation();
  };

  const startAssistant = (a: Assistant) => {
    if (streaming) return;
    setSelection({ kind: 'assistant', assistant: a });
    resetConversation();
  };

  const newConversation = () => {
    if (streaming) return;
    resetConversation();
  };

  // Switch the active workspace: reset to a clean base-agent conversation so nothing
  // from the previous workspace carries over. The load effect refetches the new
  // workspace's assistants, documents, and history.
  const selectWorkspace = (orgId: string | null) => {
    setSidebarOpen(false);
    if (orgId === activeOrgId) return;
    setActiveOrgId(orgId);
    setSelection({ kind: 'agent', agent });
    setContextId(null);
    resetConversation();
  };

  /*
   * Arriving from a Teams checkout (?org_checkout=success): the org is created
   * by the Stripe webhook, which may land a few seconds after the redirect.
   * Poll memberships until the new org appears, then switch into it. Polls
   * /api/assistants (memberships are the signal; useEntitlement has no
   * refetch). The URL is cleaned immediately so a refresh doesn't re-poll.
   */
  useEffect(() => {
    if (typeof window === 'undefined' || !user || !canUseDashboard) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('org_checkout') !== 'success') return;
    params.delete('org_checkout');
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${params.toString() ? `?${params}` : ''}`
    );
    setOrgSetup('pending');

    let cancelled = false;
    let baseline: string[] | null = null;
    let tries = 0;
    const arrived = (orgId: string) => {
      if (cancelled) return;
      setOrgSetup('ready');
      setActiveOrgId(orgId);
      setSelection({ kind: 'agent', agent: 'guide' });
      setContextId(null);
    };
    const tick = async () => {
      if (cancelled) return;
      tries += 1;
      try {
        const data = await fetchAssistants(null);
        const managed = data.memberships.filter((m) => m.role === 'manager');
        if (baseline === null) {
          baseline = data.memberships.map((m) => m.orgId);
          // The webhook can beat the redirect. A single managed org on first
          // look is the one just bought (the common brand-new-buyer case).
          if (managed.length === 1) return arrived(managed[0].orgId);
        } else {
          const fresh = managed.find((m) => !baseline!.includes(m.orgId));
          if (fresh) return arrived(fresh.orgId);
        }
      } catch {
        // transient; keep polling
      }
      if (tries >= 12) {
        if (!cancelled) setOrgSetup('slow');
        return;
      }
      setTimeout(tick, 1500);
    };
    tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, canUseDashboard]);

  const duplicate = async (a: Assistant) => {
    try {
      await duplicateAssistant(a.id);
      refreshAssistants();
    } catch (e) {
      setError((e as Error).message || 'Could not duplicate that assistant. Please try again.');
    }
  };

  /**
   * Confirm and delete an assistant, handling the server's 409 `page_attached`
   * answer (white-label pages cascade away with their assistant) with a second,
   * explicit confirmation. Returns true when it was deleted; false when the
   * user cancelled; throws with a user-facing message when the server refused.
   */
  const removeAssistant = async (a: Assistant): Promise<boolean> => {
    const ok = await confirm({
      title: 'Delete this assistant?',
      message: `"${a.name}" will be permanently removed${a.shared ? ' for everyone in the organization' : ''}. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return false;
    try {
      await deleteAssistant(a.id);
    } catch (e) {
      if (!(e instanceof AssistantActionError) || e.code !== 'page_attached') throw e;
      const slugs = e.slugs ?? [];
      const pages = slugs.map((s) => `/a/${a.org_id}/${s}`).join(', ');
      const okPages = await confirm({
        title: slugs.length === 1 ? 'This assistant powers a live page' : 'This assistant powers live pages',
        message: `Deleting it also deletes ${pages}. Anyone who visits will get a 404. This cannot be undone.`,
        confirmLabel: slugs.length === 1 ? 'Delete assistant and page' : 'Delete assistant and pages',
        tone: 'danger',
      });
      if (!okPages) return false;
      await deleteAssistant(a.id, { confirm: true });
    }
    refreshAssistants();
    return true;
  };

  const openSaved = (saved: ChatSession) => {
    if (streaming) return;
    setChatId(saved.id);
    setMessages(saved.messages);
    setError(null);
    setPendingAttachments([]);
    setUnavailable(false);
    if (saved.assistant_id) {
      const a = [...mine, ...shared].find((x) => x.id === saved.assistant_id);
      if (a) {
        setSelection({ kind: 'assistant', assistant: a });
      } else {
        // The assistant is gone or no longer shared with us: fall back to the
        // plain base agent and say so, rather than silently changing behaviour.
        setSelection({ kind: 'agent', agent: saved.agent });
        setContextId(saved.context ?? null);
        setUnavailable(true);
      }
    } else {
      setSelection({ kind: 'agent', agent: saved.agent });
      setContextId(saved.context ?? null);
    }
    setChatUrl(saved.id);
    setSidebarOpen(false);
  };

  const removeChat = async (c: ChatSession) => {
    const ok = await confirm({
      title: 'Delete this conversation?',
      message: `"${c.title}" will be permanently removed. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteChatSession(c.id);
      if (c.id === chatId) newConversation();
      refreshRecents();
    } catch {
      setError('Could not delete that conversation. Please try again.');
    }
  };

  /**
   * Switch mode in place (no navigation, unlike the public mode pages). Only for
   * standard-agent chats; an assistant defines its own mode.
   */
  const switchMode = async (nextId: string) => {
    const next = nextId || null;
    const current = contextMeta?.kind === 'mode' ? contextMeta.id : null;
    if (streaming || next === current) return;
    if (messages.length > 0) {
      const label = next ? agentModes.find((m) => m.id === next)?.label : null;
      const ok = await confirm({
        title: label ? `Switch to ${label}?` : 'Turn off this mode?',
        message: label
          ? `Modes apply from the start of a conversation, so this begins a fresh one. The current one is saved in Recent conversations.`
          : `This begins a fresh conversation with no mode. The current one is saved in Recent conversations.`,
        confirmLabel: 'Start new conversation',
      });
      if (!ok) return;
    }
    setContextId(next);
    setMessages([]);
    setChatId(null);
    setError(null);
    setPendingAttachments([]);
    setChatUrl(null);
  };

  const send = () => {
    const text = input.trim();
    if (!text || streaming || !session) return;
    const attachments = pendingAttachments;
    setInput('');
    setPendingAttachments([]);
    void deliver([
      ...messages,
      { role: 'user', content: text, ...(attachments.length ? { attachments } : {}) },
    ]);
  };

  const retry = () => {
    if (streaming || messages[messages.length - 1]?.role !== 'user') return;
    void deliver(messages);
  };

  const deliver = async (next: ChatMessage[]) => {
    if (!session) return;
    setError(null);
    setMessages([...next, { role: 'assistant', content: '' }]);
    setStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const tier: Tier = 'subscriber';
    const userMessages = next.filter((m) => m.role === 'user').length;
    if (userMessages === 1) {
      track({ event: 'first_message_sent', agent, tier, mode: activeContext ?? undefined });
    }
    track({ event: 'message_sent', agent, tier, message_index: userMessages });

    try {
      const result = await streamChat({
        accessToken: session.access_token,
        payload: {
          agent,
          messages: next.slice(-SENT_HISTORY_LIMIT),
          ...(assistant
            ? { assistant_id: assistant.id }
            : contextId
              ? { context: contextId }
              : {}),
        },
        signal: ctrl.signal,
        onDelta: (textSoFar) => setMessages([...next, { role: 'assistant', content: textSoFar }]),
      });

      switch (result.kind) {
        case 'done': {
          const finished: ChatMessage[] = [...next, { role: 'assistant', content: result.text }];
          setMessages(finished);
          await persist(finished);
          return;
        }
        case 'assistant_not_found':
          setMessages(next);
          setError('This assistant is no longer available. Start a new chat with the Guide or Mentor.');
          return;
        case 'subscription_required':
          setMessages(next);
          setError('Your subscription is no longer active. Check your account to restore access.');
          return;
        case 'unauthorized':
          setMessages(next);
          setError('Your session expired. Please reload the page and sign in again.');
          return;
        default:
          setMessages(next);
          setError('Something went wrong. Please retry.');
          return;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setMessages((current) => {
          const kept = current.filter((m, i) => !(i === current.length - 1 && m.content === ''));
          void persist(kept);
          return kept;
        });
      } else {
        setMessages(next);
        const message = (err as Error).message;
        setError(
          message === 'Failed to fetch'
            ? 'Connection problem: your message wasn’t sent. Check your internet and retry.'
            : message || 'Something went wrong. Please retry.'
        );
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const startCheckout = async () => {
    if (!session) return;
    setCheckoutBusy(true);
    setError(null);
    track({ event: 'checkout_started', plan: 'monthly', cta_location: 'dashboard_upsell', value: 5, currency: 'USD' });
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          plan: 'monthly',
          ga: getGaIds(),
          attribution: getFirstTouch() ?? undefined,
          returnPath: '/dashboard',
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('Could not start checkout. Please try again.');
    } catch (err) {
      setError((err as Error).message);
      setCheckoutBusy(false);
    }
  };

  // ── Gate states ────────────────────────────────────────────────────────────

  if (!isSupabaseConfigured) {
    return (
      <Card>
        <p className="text-sm text-slate-600">The dashboard is unavailable right now. Please try again later.</p>
      </Card>
    );
  }

  if (sessionLoading || (session && entLoading && !failed)) {
    return (
      <Card>
        <p className="text-center text-sm text-slate-500">Loading your dashboard…</p>
      </Card>
    );
  }

  if (!session || !user || user.is_anonymous) {
    return (
      <Card>
        <span className="text-3xl" aria-hidden="true">🔐</span>
        <h2 className="mt-3 font-heading text-xl font-bold text-ink-800">Sign in to open your dashboard</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          The dashboard is where subscribers keep their assistants, conversations, and documents together.
        </p>
        <a href={accountLink({ next: '/dashboard' })} className="btn-primary mt-5 inline-block">
          Sign in or create an account
        </a>
      </Card>
    );
  }

  if (!canUseDashboard) {
    return (
      <Card>
        <span className="text-3xl" aria-hidden="true">✨</span>
        <h2 className="mt-3 font-heading text-xl font-bold text-ink-800">The dashboard is part of a subscription</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
          Subscribe for unlimited conversations with the Guide and Mentor, every mode, saved history, document
          uploads, and specialized assistants. It is {PLANS.monthly.priceLabel} a month, cancel anytime.
        </p>
        <button type="button" onClick={startCheckout} disabled={checkoutBusy} className="btn-primary mt-5 disabled:opacity-60">
          {checkoutBusy ? 'Opening checkout…' : priceCopy.subscribeCta}
        </button>
        <p className="mt-3 text-xs text-slate-500">
          Or{' '}
          <a href="/pricing" className="font-semibold text-brand-600 hover:text-brand-700">
            see all plans
          </a>
          , including annual.
        </p>
        {error && <p className="mt-3 text-sm text-amber-700">{error}</p>}
        {dialog}
      </Card>
    );
  }

  // ── The dashboard ───────────────────────────────────────────────────────────

  return (
    <div className="grid h-[calc(100dvh-6rem)] gap-6 lg:h-[calc(100vh-8rem)] lg:grid-cols-[280px_1fr]">
      {/* Post-Teams-checkout status, floating so the layout never shifts. */}
      {orgSetup && (
        <div
          className={`fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-card-hover ${
            orgSetup === 'ready'
              ? 'bg-emerald-50 text-emerald-800'
              : orgSetup === 'slow'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-white text-slate-600'
          }`}
          role="status"
        >
          {orgSetup === 'pending' && 'Setting up your organization…'}
          {orgSetup === 'ready' && (
            <>
              Your organization is ready. Add your team below.{' '}
              <button
                type="button"
                className="ml-1 underline"
                onClick={() => {
                  setOrgSetup(null);
                  setOrgPanelOpen(true);
                }}
              >
                Open settings
              </button>
            </>
          )}
          {orgSetup === 'slow' && 'This is taking a little longer than usual. Refresh in a minute.'}
        </div>
      )}
      {/* Scrim behind the mobile drawer. */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ink-800/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* Sidebar: a slide-in drawer on mobile, a static column on desktop. */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[86%] max-w-xs p-3 transition-transform duration-200 ease-out lg:static lg:z-auto lg:min-h-0 lg:w-auto lg:max-w-none lg:p-0 lg:transition-none ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <Sidebar
          onClose={() => setSidebarOpen(false)}
          selection={assistant ? { kind: 'assistant', id: assistant.id } : { kind: 'agent', agent }}
          onSelectAgent={startAgent}
          onSelectAssistant={startAssistant}
          onEditAssistant={(a) => {
            setEditing(a);
            setEditorOpen(true);
          }}
          onDuplicateAssistant={(a) => void duplicate(a)}
          onDeleteAssistant={(a) => {
            void removeAssistant(a).catch((e) =>
              setError((e as Error).message || 'Could not delete that assistant. Please try again.')
            );
          }}
          onNewAssistant={() => {
            setEditing(null);
            setEditorOpen(true);
          }}
          onOpenDocuments={() => setDocumentsOpen(true)}
          onOpenWhiteLabel={() => setWhiteLabelOpen(true)}
          onOpenOrgSettings={() => setOrgPanelOpen(true)}
          canManageOrg={isManagerOfActive}
          canCreate={canCreateHere}
          showDocuments={canUseDocsHere}
          clientView={activeRole === 'client'}
          memberships={memberships}
          activeOrgId={activeOrgId}
          onSelectOrg={selectWorkspace}
          mine={mine}
          shared={shared}
          onOpenSharing={setSharing}
          orgName={activeOrg?.orgName ?? null}
          recents={recents}
          activeChatId={chatId}
          onOpenChat={openSaved}
          onDeleteChat={removeChat}
        />
      </div>

      <div className="flex min-h-0 flex-col rounded-3xl border border-slate-100 bg-white shadow-card">
        {/* Status bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-brand-300 hover:text-ink-800 lg:hidden"
              aria-label="Open menu"
            >
              <span aria-hidden="true">☰</span> Menu
            </button>
            <p className="text-sm font-semibold text-ink-800">{agentName}</p>
            {assistant ? (
              <>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-500">
                  {assistant.base_agent}
                </span>
                {canManageSelected && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(assistant);
                      setEditorOpen(true);
                    }}
                    className="btn-ghost text-xs"
                  >
                    Edit
                  </button>
                )}
              </>
            ) : (
              agentModes.length > 0 && (
                <select
                  value={contextMeta?.kind === 'mode' ? contextMeta.id : ''}
                  onChange={(e) => void switchMode(e.target.value)}
                  disabled={streaming}
                  aria-label="Conversation mode"
                  className="max-w-[11rem] cursor-pointer rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-brand-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:cursor-default disabled:opacity-60"
                >
                  <option value="">No mode</option>
                  {agentModes.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              )
            )}
          </div>
          {messages.length > 0 && (
            <button type="button" onClick={newConversation} className="btn-ghost text-xs">
              New conversation
            </button>
          )}
        </div>

        {contextMeta && (
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-slate-100 bg-brand-50/60 px-5 py-2.5">
            <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
              {contextMeta.label}
            </span>
            <span className="text-xs text-slate-500">{contextMeta.description}</span>
          </div>
        )}

        {unavailable && (
          <div className="border-b border-slate-100 bg-amber-50 px-5 py-2.5 text-xs text-amber-800">
            The assistant that created this conversation is no longer available. You can keep chatting with the{' '}
            {AGENT_LABEL[agent]} instead.
          </div>
        )}

        {/* Transcript */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-6">
          {messages.length === 0 && (
            <p className="text-sm leading-relaxed text-slate-500">
              {assistant
                ? `Start a conversation with ${assistant.name}.`
                : agent === 'guide'
                  ? 'Describe a conversation you need to have, and the Guide will help you prepare for it, step by step.'
                  : 'Ask the Mentor anything about the system: the protocol, the Wisdom Principles, or the Leadership Tools.'}
            </p>
          )}
          {messages.map((m, i) => (
            <MessageBubble
              key={i}
              message={m}
              streaming={streaming && i === messages.length - 1}
              agentName={agentName}
            />
          ))}
          <div ref={bottomRef} />
        </div>

        {error && (
          <div className="mx-5 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
            <span>{error}</span>
            {!streaming && messages[messages.length - 1]?.role === 'user' && (
              <button
                type="button"
                onClick={retry}
                className="shrink-0 rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900 hover:bg-amber-200"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <Composer
          value={input}
          onChange={setInput}
          onSend={send}
          onStop={() => abortRef.current?.abort()}
          streaming={streaming}
          placeholder={`Message ${assistant ? assistant.name : `the ${agentName}`}…`}
        >
          <AttachControl
            documents={documents}
            selected={pendingAttachments}
            onChange={setPendingAttachments}
            onUpload={async (file) => {
              const doc = await uploadAndRegister(file, docsOrgId);
              refreshDocuments();
              return doc;
            }}
            onManage={() => setDocumentsOpen(true)}
            disabled={streaming}
          />
        </Composer>
      </div>

      <DocumentsPanel
        open={documentsOpen}
        onClose={() => setDocumentsOpen(false)}
        documents={documents}
        orgId={docsOrgId}
        orgName={docsOrgId ? (activeOrg?.orgName ?? null) : null}
        onChanged={refreshDocuments}
      />
      {editorOpen && (
        <AssistantEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          editing={editing}
          owned={editing ? mine.some((a) => a.id === editing.id) : true}
          documents={documents}
          onUpload={async (file) => {
            const doc = await uploadAndRegister(file, docsOrgId);
            refreshDocuments();
            return doc;
          }}
          memberships={memberships}
          activeOrgId={activeOrgId}
          onSaved={refreshAssistants}
          onDelete={editing ? () => removeAssistant(editing) : undefined}
        />
      )}
      {sharing && activeOrgId && (
        <ShareDialog
          assistant={sharing}
          orgId={activeOrgId}
          orgName={activeOrg?.orgName ?? null}
          owned={mine.some((a) => a.id === sharing.id)}
          onClose={() => setSharing(null)}
          onSaved={refreshAssistants}
        />
      )}
      <WhiteLabelPanel
        open={whiteLabelOpen}
        onClose={() => setWhiteLabelOpen(false)}
        assistants={[...mine, ...shared].filter((a) => a.org_id === activeOrgId)}
        orgId={activeOrgId}
        orgName={activeOrg?.orgName ?? null}
      />
      <OrgPanel
        open={orgPanelOpen}
        onClose={() => setOrgPanelOpen(false)}
        orgId={activeOrgId}
        onOrgRenamed={refreshAssistants}
      />
      {dialog}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-card">
      {children}
    </div>
  );
}
