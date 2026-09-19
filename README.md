# APPDAET-BTIS2-GROUP2 Kanban Board

A shared kanban board (TO DO / IN PROGRESS / IN REVIEW / DONE) for the BTIS2 Group 2 project. It runs as a static site on GitHub Pages and stores all issues in a free Supabase database, so every member (Victor, Ethan M, Ethan J, Rain) sees the same live board.

## How it works

```
APPDAET-BTIS2-GROUP2
        │
        ▼
GitHub Pages ────▶ Kanban Board (TO DO / IN PROGRESS / IN REVIEW / DONE)
        │
        ▼
Supabase (online database)  ◀── all members' laptops read/write here
```

## Setup: Supabase (one time, by anyone in the team)

1. Create a free project at https://supabase.com
2. In the project, open **SQL Editor** → New query, paste the contents of `supabase-schema.sql`, and run it. This creates the `tasks` and `team_members` tables, enables row-level security with an open access policy, and turns on Realtime.
3. Go to **Project Settings → API**. Copy the **Project URL** and the **anon / public key**.
4. Open `config.js` and replace the placeholder values:

```js
const SUPABASE_URL = "https://<your-project-ref>.supabase.co";
const SUPABASE_ANON_KEY = "<your-anon-public-key>";
```

Until you fill these in, the board runs in **demo mode** with sample cards so you can preview it.

Notes:
- The anon key is intentionally public; access to your data is what matters. The policy in the schema lets anyone edit for prototyping. If the board is for coursework only, this is fine. For real production use, restrict RLS policies per user.
- If someone changes a card, it updates for everyone automatically (Realtime).

## Deploy to GitHub Pages

1. Create a GitHub repository for this folder (e.g. `appdaet-btis2-group2`).
2. Push the files:

```bash
git init
git add .
git commit -m "Initial kanban board"
git branch -M main
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```

3. In the repo on GitHub: **Settings → Pages → Source → Deploy from a branch → main / (root)** → Save.
4. Your board is live at `https://<your-username>.github.io/<repo-name>/`.

## Team workflow

- **Create** — "+ Create" or "+ Add issue" on any column, pick an assignee.
- **Move** — drag cards between columns; statuses save to Supabase instantly.
- **Filter** — search by text or filter by priority; "Clear filters" resets.
- **Delete** — hover a card and click the ✕ (asks for confirmation).
- **Docs** — the "Docs" item in the sidebar opens the shared files (kept in the repo): switch between **APPDAET Plan** and **Coding Challenge 4** PDFs with the tabs; a custom Google Docs link can be added via `GOOGLE_DOCS_URL` in `config.js`.
- **Team roles** — open **Team** in the sidebar (or "Edit roles") and set each member's role; it's saved to the shared board so everyone sees the same roster.
- **Dark mode** — ☾ in the top bar (remembered on your device).

## File structure

- `index.html` — board UI and create-issue modal
- `style.css` — all styling (light + dark theme)
- `script.js` — app logic: Supabase reads/writes, realtime, drag & drop, filters
- `config.js` — your Supabase URL + anon key
- `supabase-schema.sql` — run once in the Supabase SQL editor to create the database
