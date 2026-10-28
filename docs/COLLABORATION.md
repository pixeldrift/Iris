# Collaboration: how the groundwork is laid

Goal: several people contributing to the same tasks and groups, or a whole shared workspace, without redoing the
data model later. What exists now, and what each next step needs.

## What exists

- **Workspaces.** `workspaces` + `workspace_members(role)` in `db/schema.sql`. Every person gets a personal workspace
  (id = user id). An entity (`entities` row) belongs to a workspace; tasks and groups carry an optional
  `workspaceId` (absent = personal), so one pond can mix personal and shared things.
- **Sync across workspaces.** `POST /api/sync` returns changes from every workspace the caller belongs to, with a
  server cursor per workspace; the client remembers them (`SyncMemory.cursors`) and knows which workspace each
  non-personal entity lives in (so a deletion is sent to the right place).
- **Permissions on write.** Owner and editor can write, viewer cannot, non-members cannot (`rejected` in the reply).
- **Attribution.** Each row records `updated_by` and a `rev` counter; the sync reply includes both.
- **Presence.** `devices` checks in while the app is visible; collaborators' open devices count as peers, which already
  switches sync to the fast 2 s pace so edits from other people also land live.

## What each next step needs

1. **Create / share a workspace.** Endpoints to create a workspace, list members, change roles; UI under the account
   menu ("Shared with ..."). Moving a group (and its tasks) into a workspace = rewriting `workspaceId` on those entities.
2. **Invitations.** `workspace_invites(token, workspace_id, role, expires_at)`; join by link (needs the signed-in
   user's id from the Neon Auth token, which the API already has) and, later, email invites.
3. **People vs users.** Today a `person` is an address-book entry. A collaborator is a *user*; link them
   (`person.userId`) so tagging @Sam can also mean "assigned to Sam".
4. **Seeing who did what.** Show `updated_by` (name/avatar) on tasks and a small "edited by" line; live presence
   avatars on the pond (the `devices` table, plus a display name).
5. **Better conflict handling.** Last-write-wins by the writer's clock is fine for one person's devices but loses
   edits when two people change the same task. Next: server-assigned versions (use `rev`: a write names the `rev` it
   was based on, and a stale write gets the current row back to merge), then field-level merge for the common
   fields (title, notes, status, dates, tags), and list items merged by id.
6. **Server-side guard rails.** Per-workspace size limits, rate limits, audit trail of deletions (the tombstones are
   already kept), and a way to export a workspace.
7. **Notifications.** Assigned-to-you and mention reminders through the same Web Push work already on the roadmap.
8. **Real push for liveness** (optional): replace the 2 s fast poll with server-sent events or a realtime service
   when many people share one workspace.

## Design rules to keep

- The client stays local-first: every change applies locally first and syncs after.
- Entities remain plain JSON documents in one table so new fields never need a migration.
- Permissions are enforced on the server in `api/_lib/sync.ts`; the client only hides what you cannot do.
