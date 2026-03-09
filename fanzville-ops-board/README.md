# FANZVILLE Ops Console (Static)

A **GitHub Pages-ready** Ops Board for your DayZ server:
- Public: roadmap + tasks + updates
- Maintainer mode: drag-and-drop tasks, add/edit tasks + updates (stored locally)
- Export JSON to commit back into the repo

## Quick start (local)
Just open `index.html` in a browser — or run a tiny static server:

```bash
# Python
python -m http.server 8080
# then open http://localhost:8080
```

> NOTE: Some browsers block `fetch()` for local `file://` pages. Use the `http.server` method above.

## Deploy to GitHub Pages
1. Create a repo and push everything in this folder to `main`.
2. Repo → **Settings** → **Pages**
3. Source: **Deploy from a branch**
4. Branch: **main** / Folder: **/(root)**

## Update content (the “real” workflow)
Edit these files and commit:
- `data/tasks.json`
- `data/updates.json`
- `data/config.json` (server name, links, passphrase, colors)

### Maintainer mode
- Click the key icon → enter passphrase from `data/config.json`
- Make edits
- Click **Export JSON**
- Copy the exported `tasks` and `updates` arrays back into `data/tasks.json` + `data/updates.json`
- Commit & push

## Customization
- Visual theme: `assets/style.css`
- App logic: `assets/app.js`

## Security note
Maintainer mode is **not secure authentication** (static site). It simply prevents accidental edits on shared machines.
