# AI Tips

A private library of prompting techniques for the DTC program. Plain HTML/JS + Supabase (auth + Postgres + RLS). No build step.

## Run locally

It works two ways:

- **Demo mode (no setup):** serve the folder and open it — runs on sample data, sign-in disabled.
  ```
  npx serve .      # or: python -m http.server
  ```
  (Open via `http://localhost…`, not `file://`, so the Concepts page can load.)

- **Live mode:** fill in `config.js` with your Supabase URL + anon key.

## Supabase setup

1. Create a project at supabase.com.
2. SQL editor → run **`schema.sql`** (tables, the `is_approved()` gate, RLS).
3. Authentication → Providers → keep **Email** on; turn **off** "Allow new users to sign up" (access is gated by the allowlist).
4. Add approved access:
   - Domains are seeded in `schema.sql` (`sprezzmc.com`, `va.gov`) — edit there or in the `approved_domains` table.
   - One-off subcontractors → add their email to `approved_emails`.
5. Settings → API → copy the **Project URL** and **anon public** key into `config.js`.
6. Have nicholas.snogren@sprezz.com sign in once, then run **`seed.sql`** to load the default tips under his name.

## Deploy (GitHub Pages)

Push the `app/` contents to a repo and enable Pages (or point Pages at this folder). Add your live URL to Supabase → Authentication → URL Configuration → **Site URL / Redirect URLs**, so magic links return to the right place.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Markup + script tags |
| `styles.css` | All styling |
| `config.js` | Supabase URL + anon key (empty = demo) |
| `data.js` | Data layer — Supabase or sample data |
| `app.js` | Auth gate, views, interactions |
| `concepts.md` | "How AI works" page (admin-editable) |
| `schema.sql` | Tables + RLS + access gate |
| `seed.sql` | Default groups/tips |

The anon key is meant to be public — **RLS** is what protects the data. Never put the `service_role` key in the frontend.
