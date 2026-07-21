import { useState } from 'react';
import type { ChatMessage } from '../../../lib/chatSessions';
import Markdown from './Markdown';

/**
 * The assistant produced a structured document (a prep summary), which means the
 * conversation reached the end of the protocol rather than trailing off. This is
 * both what reveals the Download/Print actions and what earns us the right to
 * ask "did this help?", so it is defined once and shared with ChatView's
 * feedback trigger.
 */
export const looksLikeDocument = (content: string) => /^##\s/m.test(content);

export default function MessageBubble({
  message,
  streaming,
  agentName,
}: {
  message: ChatMessage;
  streaming: boolean;
  agentName: string;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[min(85%,34rem)] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-500 px-4 py-2.5 text-sm leading-relaxed text-white">
          {message.content}
        </div>
        {message.attachments && message.attachments.length > 0 && (
          <div className="flex max-w-[min(85%,34rem)] flex-wrap justify-end gap-1.5">
            {message.attachments.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-600"
              >
                <span aria-hidden="true">📎</span>
                <span className="max-w-[10rem] truncate">{a.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[min(92%,48rem)] rounded-2xl rounded-bl-md bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
        {message.content === '' && streaming ? (
          <span className="text-slate-400">{agentName} is thinking…</span>
        ) : (
          <Markdown text={message.content} />
        )}
        {!streaming && message.content !== '' && (
          <MessageActions
            content={message.content}
            showDocumentActions={looksLikeDocument(message.content)}
          />
        )}
      </div>
    </div>
  );
}

function MessageActions({
  content,
  showDocumentActions,
}: {
  content: string;
  showDocumentActions: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'solution-seeking-summary.md';
    a.click();
    URL.revokeObjectURL(url);
  };

  const print = () => {
    const w = window.open('', '_blank', 'width=720,height=900');
    if (!w) return;
    w.document.title = 'Solution Seeking System';
    const body = w.document.body;
    body.style.cssText =
      'font-family:Georgia,serif;max-width:42rem;margin:2rem auto;padding:0 1rem;line-height:1.6;color:#1e293b';
    const pre = w.document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;font-family:inherit';
    pre.textContent = content;
    body.appendChild(pre);
    w.print();
  };

  return (
    <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-200/70 pt-2 text-xs">
      <button type="button" onClick={copy} className="font-semibold text-brand-600 hover:text-brand-700">
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      {showDocumentActions && (
        <>
          <button type="button" onClick={download} className="font-semibold text-brand-600 hover:text-brand-700">
            Download .md
          </button>
          <button type="button" onClick={print} className="font-semibold text-brand-600 hover:text-brand-700">
            Print
          </button>
        </>
      )}
    </div>
  );
}
