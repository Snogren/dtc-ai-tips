# Feedback feature

## What it does

A private intake channel for members to reach the program directly. Three sidebar buttons open one shared form, each pre-set to a type:

| Button | Type |
|---|---|
| Request a prompt | `idea` |
| Ask for advice | `advice` |
| Vent frustration | `complaint` |

The categories inspire the user; all three route to the same form. The type is kept as metadata for admin triage.

Each submission has a subject and opens a private two-party thread. The author and admins post back and forth in app; messages render as markdown. A submission carries a status admins can change for triage.

## Requirements

- **Privacy.** A submission and its thread are visible only to its author and to admins. Nothing is public. This must be enforced server-side (Postgres RLS), not in the client.
- **Members** can create submissions, view their own, and reply in their own threads.
- **Admins** can view all submissions across authors, reply in any thread, and change a submission's status.
- **Replies** come from either party — the message author is whoever posted, not the submission's owner.
- **A reply indicator** in the sidebar shows when a thread has activity the current user hasn't seen, so the channel doesn't go silent.
- All user-entered text is escaped; markdown is sanitized before rendering.

## Out of scope

No public visibility, no email/push notifications, no leaderboard integration.
