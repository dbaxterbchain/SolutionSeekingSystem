# Client role, per-member sharing, and assistant templates

One connected feature set (migrations 0028 + 0029): a third org role for an
organization's own customers, sharing an assistant with specific seats, live
template inheritance, and duplicate/delete actions behind a row menu. The
driving use case: a landlord gives every tenant a dedicated assistant loaded
with that tenant's lease, on top of one shared building-rules template.

Verified end to end in a real browser against the local stack (manager and
client accounts, template inheritance in streamed chat, and the negative
access probes: org-wide shares and templates answer 404 for clients, org
documents fall back to Personal, creation is refused).

## Screenshots

- `manager-sidebar-template-and-badges.png` — the manager's sidebar: the
  Template chip on Tenant Playbook, "Shared with 1" on the tenant assistant,
  "Shared" on the org-wide one.
- `assistant-row-menu-open.png` — the new per-row overflow menu (New from
  template / Edit / Duplicate / Sharing / Delete) that replaced the hover
  icon cluster.
- `share-dialog-specific-people.png` — the sharing dialog: the org-wide
  toggle ("Clients are not included") plus the per-seat list; the client seat
  is shareable while still Invited (unclaimed).
- `org-panel-roles-with-client.png` — Organization settings with the role
  legend, the Client option on member rows, and the role picker on the
  invite form.
- `client-dashboard-stripped.png` — what a client seat sees: Guide, Mentor,
  "Your assistants" with only what was shared to them, and no create,
  documents, white-label, or org buttons.
- `client-chat-template-inheritance.png` — the client chatting with their
  assistant: the reply opens with the template's marker word and mixes
  template content (building rules) with child content (their lease).
- `white-label-client-chat.png` — the same assistant behind an existing
  white-label page; the signed-in client passes the access check with no
  white-label changes.
- `delete-page-attached-confirm.png` — deleting an assistant that powers a
  live page now surfaces a second, explicit confirmation listing the page
  paths instead of failing silently.
