# Instrumet Calibration

Offline-first desktop app for calibration technicians. Add customers, their
equipment, reference standards and calibration results with or without an
internet connection. Everything is saved on the laptop first and syncs
automatically. When one technician fixes a mistake, every other technician sees
the change within seconds.

**Stack:** Electron · React · Tailwind · [PowerSync](https://powersync.com)
(local SQLite + sync) · [Supabase](https://supabase.com) (Postgres, Auth)

![Calibration editor](docs/screenshots/04-calibration-offline.png)

## How sync works

```
 Laptop (Electron window)                         Cloud
 ┌──────────────────────────────┐   download   ┌──────────────────┐   logical    ┌──────────────┐
 │ React UI ── live queries ──► │ ◄─────────── │ PowerSync Service│ ◄─────────── │   Supabase   │
 │ local SQLite (OPFS)          │  (streaming) │  (Development)   │  replication │   Postgres   │
 │ upload queue ─ uploadData() ─┼──────────────┼──────────────────┼────────────► │ (RLS-guarded)│
 └──────────────────────────────┘   writes via supabase-js (REST)               └──────────────┘
```

* Reads always come from local SQLite, so the app is instant and works offline.
* Writes go to local SQLite and an upload queue. When online, the queue uploads
  to Supabase. Edits upload only the changed fields, so two technicians editing
  different fields of the same record don't clobber each other.
* Supabase row-level security limits each technician to their own company's data.
* If the server permanently rejects a change (for example, the record was deleted
  by someone else), it is skipped so the queue never jams, and shown under
  **Settings → Changes the server rejected**.

## Running it

```bash
npm install
cp .env.example .env     # fill SUPABASE_URL, SUPABASE_ANON_KEY, POWERSYNC_URL
npm run dev              # development
npm run dist:win         # Windows installer  (also dist:mac, dist:linux)
```

**Windows (PowerShell 5.1):** create `.env` with ASCII encoding or the first key is
not read, e.g. `@"…"@ | Set-Content -Path .env -Encoding ascii`.

**`Error: Electron uninstall`** on `npm run dev` means Electron's binary download was
skipped during install. Run `node node_modules/electron/install.js`, then retry.

Only `SUPABASE_URL`, `SUPABASE_ANON_KEY` (publishable key) and `POWERSYNC_URL`
are built into the app. The admin tokens in `.env` are for the CLI only and are
never bundled.

## First-time setup

1. The **first person to create an account becomes the company admin**; everyone
   after joins as a technician (see `private.handle_new_user` in the migration).
2. Once your team has accounts, **turn off public sign-ups**: Supabase dashboard →
   Authentication → Sign In / Providers → disable "Allow new users to sign up".
   Invite new technicians from the dashboard after that.
3. Rename the company under **Settings** (it prints on certificates).

## Project layout

| Path | What |
|---|---|
| `supabase/migrations/` | Database schema, RLS, triggers, PowerSync publication |
| `supabase/powersync_role.sql` | Dedicated replication login for PowerSync (password lives in `.env`) |
| `powersync/` | PowerSync Cloud config (`service.yaml`, `sync-config.yaml`), deployed with the PowerSync CLI |
| `src/main/` | Electron main process (secure `app://` scheme, CSP, Save-as-PDF) |
| `src/renderer/src/powersync/` | Client schema, database, Supabase connector (`uploadData`, `fetchCredentials`) |
| `src/renderer/src/pages/` | Screens |
| `tests/e2e-sync.cjs` | Two-laptop end-to-end sync test (online, offline, reconnect, live edits) |

## Changing the schema

1. Add a migration in `supabase/migrations/`, apply it, and add any new table to the
   `powersync` publication.
2. Add the table to `powersync/sync-config.yaml` and run `npx powersync deploy sync-config`.
3. Regenerate the client schema: `npx powersync generate schema --output=ts --output-path=src/renderer/src/powersync/AppSchema.ts`
   (on Node 22, run the CLI with `node --js-explicit-resource-management`).
