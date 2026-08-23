# Decap CMS Setup & Wiring Guide

**Status:** Draft — awaiting execution
**Date:** 2026-08-23
**Audience:** Engineer taking ownership of the ARC content pipeline
**Time estimate:** 60–90 minutes end to end (30 min if GitHub/Cloudflare access is already sorted)

This document does two things:

1. Explains how the CMS works — so every change you make is understood, not copy-pasted.
2. Gives incremental, verifiable steps to take it from "login button breaks" to "editor edits the site without touching code."

Every stage ends with a **checkpoint**. Do not move to the next stage until the checkpoint passes.

---

## Table of contents

- [0. The mental model](#0-the-mental-model)
- [1. Inventory — what exists today](#1-inventory--what-exists-today)
- [2. The diagnosis — why login currently breaks](#2-the-diagnosis--why-login-currently-breaks)
- [3. Stage 1 — Route /api/* into the Worker (code changes)](#3-stage-1--route-api-into-the-worker-code-changes)
- [4. Stage 2 — Deploy the Worker](#4-stage-2--deploy-the-worker)
- [5. Stage 3 — Register the GitHub OAuth App](#5-stage-3--register-the-github-oauth-app)
- [6. Stage 4 — Set the Cloudflare secrets](#6-stage-4--set-the-cloudflare-secrets)
- [7. Stage 5 — End-to-end test](#7-stage-5--end-to-end-test)
- [8. Stage 6 — Recommended next steps](#8-stage-6--recommended-next-steps)
- [9. Troubleshooting](#9-troubleshooting)
- [Appendix A — The OAuth flow, annotated](#appendix-a--the-oauth-flow-annotated)
- [Appendix B — Decap config.yml, annotated](#appendix-b--decap-configyml-annotated)

---

## 0. The mental model

**Decap CMS (formerly Netlify CMS) has no database.** The `content/` folder in the GitHub repo *is* the database. Decap is purely a friendly editing UI that makes commits to GitHub on the editor's behalf.

That means there are two equivalent doors to change any content:

| Door | Who uses it | What it does |
|---|---|---|
| Edit `content/*.md`, `git commit`, `git push` | Developers | Directly commits the Markdown |
| Visit `https://arc-community.in/admin/`, edit in forms, click **Publish** | Editors | Decap commits the *same files* via the GitHub API |

Both doors produce identical commits. There is no sync step, no webhook into a database, nothing else to maintain.

The full round-trip:

```
 Editor                GitHub                          Cloudflare                    Visitor
 ──────              ────────                        ───────────                    ────────
 1. Visits /admin
 2. Clicks "Login
    with GitHub" ──► /api/auth ──► GitHub OAuth page ─┐
 3. Authorizes ◄──────────────────────────────────────┘
 4. /api/callback hands the
    token to Decap ◄──────────────────────────────────┘
 5. Edits the form,
    clicks Publish ──► commit to `master` of
                       ambedkar-reading-circle/
                       ambedkar-reading-circle.github.io
                       (content/_index.md) ──────────► Workers Builds notices push
                                                     runs `hugo` + `wrangler deploy`
                                                                                    6. Site updated
                                                                                       within ~1 min
```

Why the OAuth dance at all? Because Decap needs permission to commit to your repo. It asks GitHub for a personal token via OAuth. GitHub will only hand that token to a **registered OAuth App** through a **server-side code exchange** — and the "server" here is two small functions we host ourselves (`functions/api/auth.js` and `functions/api/callback.js`). Those functions need two secrets (a GitHub client ID and client secret) to prove which app is asking.

That's the entire system: **Decap UI + our two auth functions + GitHub + Cloudflare rebuild.** Four pieces, each verified independently in the stages below.

---

## 1. Inventory — what exists today

| Piece | File | State |
|---|---|---|
| CMS app shell | `static/admin/index.html` | ✅ Working — loads Decap from unpkg CDN; Hugo copies `static/` verbatim, so it deploys at `/admin/` |
| CMS config | `static/admin/config.yml` | ✅ Working — deployed and verified live; points at `ambedkar-reading-circle/ambedkar-reading-circle.github.io`, branch `master` (matches the actual remote — the rename was handled correctly) |
| OAuth start | `functions/api/auth.js` | ⚠️ Written, correct, **never deployed** |
| OAuth finish | `functions/api/callback.js` | ⚠️ Written, correct, **never deployed** |
| Content | `content/_index.md` | ✅ Working — the under-construction homepage |
| Site build | `layouts/`, `hugo.toml` | ✅ Working — Hugo renders `content/_index.md` into the homepage |
| Deploy config | `wrangler.jsonc` | ⚠️ Serves `public/` as static assets, but has no `main` — so the auth functions don't ship |
| Secrets | — | ❌ `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` not yet set on Cloudflare |
| GitHub OAuth App | — | ❌ Not yet registered |

## 2. The diagnosis — why login currently breaks

Observed behavior (verified 2026-08-23):

- `https://arc-community.in/admin/` loads and shows the Decap **Login with GitHub** button ✅
- Clicking it opens a popup to `/api/auth`, which returns **404** ❌ — login dies there
- `https://arc-community.in/admin/config.yml` serves the correct config ✅

Root cause — a deployment-convention mismatch:

- The `functions/` directory is a **Cloudflare Pages** convention. On Pages, any file at `functions/api/auth.js` is *automatically* routed to `/api/auth`. Zero config.
- But this site is deployed as a **Cloudflare Worker with static assets** (see `wrangler.jsonc` — it has an `assets.directory` key; also see git history: *"Add Wrangler config to fix Cloudflare Pages deploy"*). A Worker-assets deployment **silently ignores** a `functions/` directory. Static files ship; the functions don't; `/api/*` 404s.

So the answer to "we have a function but never deployed it, right?" is **yes, exactly** — the code is complete and correct; it simply has no route into the deployed Worker.

The fix is not to rewrite the functions. It's to add a ~20-line Worker entry that routes `/api/*` to them. That's Stage 1.

---

## 3. Stage 1 — Route `/api/*` into the Worker (code changes)

Four small changes, each with its own commit-worthy checkpoint. All are local repo edits.

### Step 1.1 — Create `src/worker.js`

Create the file `src/worker.js` (new `src/` directory at repo root) with exactly this content:

```js
import { onRequest as auth } from "../functions/api/auth.js";
import { onRequest as callback } from "../functions/api/callback.js";

function adapt(handler, request, env, ctx) {
    return handler({
        request,
        env,
        params: {},
        waitUntil: ctx.waitUntil.bind(ctx),
        next: () => env.ASSETS.fetch(request),
        data: {},
    });
}

export default {
    async fetch(request, env, ctx) {
        const { pathname } = new URL(request.url);

        if (pathname === "/api/auth") return adapt(auth, request, env, ctx);
        if (pathname === "/api/callback") return adapt(callback, request, env, ctx);

        return env.ASSETS.fetch(request);
    },
};
```

**What this is and why it looks like this:**

- The existing functions are written in the Pages style: they export `onRequest(context)` and pull `request`, `env`, etc. out of a single `context` object. We keep them **unmodified** (they're proven, standard code) and write a thin adapter that manufactures that `context` object from a standard Worker's `(request, env, ctx)` signature.
- `env.ASSETS` is an automatic binding (present whenever a Worker has static assets configured) that serves files from `public/`. The final `return env.ASSETS.fetch(request)` is a fallback for any non-API path that didn't match a static file — with this config that basically never happens, but the Worker must return *something* for every request.
- You do **not** need to touch `functions/api/auth.js` or `functions/api/callback.js`.

### Step 1.2 — Register the Worker in `wrangler.jsonc`

Add a `main` field so Wrangler knows to bundle and deploy the Worker alongside the assets.

**Before:**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "arc-community-website",
  "compatibility_date": "2026-08-05",
  ...
```

**After:**

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "arc-community-website",
  "main": "src/worker.js",
  "compatibility_date": "2026-08-05",
  ...
```

(Only the `main` line is new. Leave everything else as-is.)

**How requests now route** (this is the part worth understanding):

1. A request arrives at Cloudflare.
2. By default, **static assets are checked first** — if a file in `public/` matches the path, it's served and the Worker never runs. This is why the site's pages keep working exactly as before, with zero overhead.
3. If no asset matches (e.g. `/api/auth` — there's no such file in `public/`), **the Worker runs** and hits our router.

**Optional, recommended for explicitness** — make the intent visible in config by forcing `/api/*` to always invoke the Worker first, inside the `assets` block:

```jsonc
  "assets": {
    "directory": "public",
    "run_worker_first": ["/api/*"]
  },
```

This is belt-and-suspenders: it guarantees `/api/*` reaches the Worker even if someone someday adds a `public/api/` file. It's safe to add; behavior is otherwise unchanged.

### Step 1.3 — Fix the redirect status in `functions/api/auth.js`

**Before (line 23):**

```js
        return Response.redirect(redirectUrl.href, 301);
```

**After:**

```js
        return Response.redirect(redirectUrl.href, 302);
```

**Why:** `301` means *Moved Permanently* — browsers and CDNs cache it aggressively. The URL being redirected to contains a fresh random `state` parameter on every login, and a cached 301 keeps replaying the *stale* URL, which can silently break repeat logins (symptom: login works once, then weirdly fails or skips screens). `302` (temporary) is the correct status for an OAuth redirect. One-character-class fix, real failure mode.

### Step 1.4 — Verify the build locally

From the repo root (PowerShell):

```powershell
hugo                      # rebuilds public/ from content/ + layouts/
npx wrangler deploy --dry-run
```

Expected dry-run output (sizes may differ slightly):

```
✨ Read NN files from the assets directory D:\...\public
Total Upload: ~4 KiB / gzip: ~1-2 KiB
--dry-run: exiting now.
```

If you see the upload size, the Worker bundles successfully. `--dry-run` touches nothing — it only validates.

**Checkpoint 1:** dry-run succeeds and reports a non-zero upload size (that's your Worker code being bundled).

### Step 1.5 — Commit

```powershell
git add src/worker.js wrangler.jsonc functions/api/auth.js
git commit -m "Wire OAuth functions into Worker and fix auth redirect status"
```

(Adapt the message to house style; the point is: this is a self-contained, revertable change.)

---

## 4. Stage 2 — Deploy the Worker

Two paths. **Use Path A** — it keeps deploys consistent forever. Path B is the manual override.

### Path A — Push and let Cloudflare build (preferred)

The site auto-deploys via Cloudflare's git integration (Workers Builds) on every push to `master`.

1. First, sanity-check the build configuration once (Cloudflare dashboard → Workers & Pages → **arc-community-website** → **Settings → Build**):
   - **Build command:** must run Hugo *before* Wrangler uploads assets — e.g. `hugo`. (Git history shows a past double-build issue — there should be exactly one build command, in exactly one place. If the dashboard has a build command, `wrangler.jsonc` should *not* also carry one.)
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory:** repo root.
2. `git push origin master`
3. Watch the build: dashboard → the worker → **Deployments**. Wait for "Success".

### Path B — Manual deploy from your machine

Prerequisite: `npx wrangler login` (opens a browser to authorize your Cloudflare account).

```powershell
hugo
npx wrangler deploy
```

Hugo **must** run first — `wrangler deploy` uploads whatever is currently in `public/`.

### Checkpoint 2

```powershell
curl.exe -I https://arc-community.in/api/auth
```

(Use `curl.exe`, not `curl` — in PowerShell 5.1, bare `curl` is an alias for `Invoke-WebRequest` and behaves differently.)

Expected result: **HTTP 302** (or 301 if Stage 3 isn't done yet — see below) with a `Location` header pointing at `https://github.com/login/oauth/authorize?...`.

- Getting **404** still → the Worker didn't deploy; re-check `main` in `wrangler.jsonc` and the deployment logs.
- Getting **302** → your functions are live. The `Location` URL will currently contain `client_id=undefined` — **that is expected** at this point; the secrets don't exist yet. That's Stage 4.

---

## 5. Stage 3 — Register the GitHub OAuth App

Decap's login can't work until GitHub knows about "an app" asking for repo access on behalf of arc-community.in.

1. On GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**
   (Register it while acting as the **organization** `ambedkar-reading-circle` if possible — then it survives any individual leaving. Personal accounts work too; the app just belongs to that person.)
2. Fill in:

   | Field | Value |
   |---|---|
   | Application name | `ARC Content Manager` (anything recognizable) |
   | Homepage URL | `https://arc-community.in` |
   | Application description | optional |
   | **Authorization callback URL** | `https://arc-community.in/api/callback` — **exact**, no trailing slash, correct scheme |

3. Register. You'll be shown a **Client ID** — copy it.
4. Click **Generate a new client secret** — copy it immediately (it's only fully visible once). Store both in the team password manager.

**Two rules to understand about the callback URL:**

- It must **exactly match** what `functions/api/auth.js` constructs at runtime: `url.origin + '/api/callback'` — i.e. the origin of wherever `/api/auth` was reached from. Since we always reach it via `https://arc-community.in/admin/`, the callback is `https://arc-community.in/api/callback`. GitHub shows a `redirect_uri_mismatch` error page if they differ by even a slash.
- Corollary: if you ever test the admin at the raw `*.workers.dev` domain, the runtime callback would be `https://<something>.workers.dev/api/callback` → mismatch → breakage. **Always use the custom domain for admin work.**

**Checkpoint 3:** you have a Client ID (hex-ish string) and a Client Secret saved somewhere safe. No GitHub-side errors so far.

---

## 6. Stage 4 — Set the Cloudflare secrets

The functions read `env.GITHUB_CLIENT_ID` and `env.GITHUB_CLIENT_SECRET`. These are **runtime secrets** on the deployed Worker — not build variables, and never files in the repo.

From the repo root (Wrangler picks up the worker name `arc-community-website` from `wrangler.jsonc`):

```powershell
npx wrangler secret put GITHUB_CLIENT_ID
# paste the Client ID when prompted, press Enter

npx wrangler secret put GITHUB_CLIENT_SECRET
# paste the Client Secret when prompted, press Enter
```

(Setting a secret creates a new deployment automatically — no separate deploy needed.)

To review later: `npx wrangler secret list` (names only, never values).

### Checkpoint 4

```powershell
curl.exe -I https://arc-community.in/api/auth
```

Now the `Location` header must contain `client_id=<your real client ID>`, not `undefined`. If it still says `undefined`, the secret name has a typo (names are case-sensitive) or it was set on a different worker.

---

## 7. Stage 5 — End-to-end test

Now do the whole flow as an editor would:

1. Open `https://arc-community.in/admin/` in a normal browser window.
2. Click **Login with GitHub**. A popup opens → GitHub's authorization page (asking to grant `repo` + `user` scope to your app) → **Authorize**.
3. The popup closes itself and Decap loads, showing the **Home / Under Construction** collection with one entry.
4. Open the entry, tweak the message text, hit **Save** (or **Publish**).
5. In a another tab, open the repo on GitHub: `content/_index.md` should show a **new commit authored by you** — Decap commits *as the logged-in GitHub user*, using their token.
6. Cloudflare Workers Builds picks up the push → rebuilds → within a minute or two `https://arc-community.in/` shows your edit.

**Things worth knowing before you demo this to editors:**

- **Access control = GitHub repo access.** Anyone who can log in via OAuth can *see* the CMS, but publishing requires **write access to the repo** — otherwise the commit fails with a 403-ish error. To onboard a new editor: add them as a repo collaborator, done. No CMS-level user management exists (by design).
- **The token lives in the browser's localStorage** for `arc-community.in` after login. The CMS **Logout** button clears it. Shared/borrowed machines: log out when done.
- The first OAuth login on a fresh app may show a scary "unverified application" warning screen — that's normal for unverified apps; it can be approved for the org if desired.

**Checkpoint 5 (the finish line):** an edit made in `/admin` appears as a commit on `master` and shows up on the live site with no human touching the terminal.

---

## 8. Stage 6 — Recommended next steps

Once the basics work, in priority order:

1. **Editorial workflow** — in `static/admin/config.yml`, add as the first key under `backend:`:

   ```yaml
   publish_mode: editorial_workflow
   ```

   Edits then become **draft commits on a branch + open pull request** instead of direct commits to `master`. Someone reviews the PR, merges, site updates. Recommended once more than one person edits, or before handing admin access to non-technical editors.

2. **Narrow the OAuth scope** — `functions/api/auth.js` requests `scope: 'repo user'`. For a public repo, `public_repo` suffices and grants less. Edit the string in `auth.js`, commit, push. (Existing tokens keep old scope until users re-login.)

3. **State validation (CSRF hardening)** — `auth.js` sends a random `state` param, but `callback.js` doesn't verify it (the current code never stores it). For a small team this is an acceptable, known limitation; note it if you ever expand access.

4. **Grow the CMS to match the site** — every future content type (blog posts, events, pages) becomes a `collections:` entry in `config.yml` mapping form widgets to files/sections under `content/`. The media library uploads into `static/img` (already configured via `media_folder`).

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/auth` returns 404 | Worker not deployed — `main` missing from `wrangler.jsonc`, or deploy failed | Checkpoint 2; inspect Cloudflare deployment logs |
| `curl.exe -I` shows `client_id=undefined` | Secrets not set / typo in name | Stage 4; names are case-sensitive |
| GitHub page: `redirect_uri_mismatch` | Callback URL in OAuth App ≠ `https://arc-community.in/api/callback` exactly, or admin was opened on `*.workers.dev` | Fix the app's callback URL; always use the custom domain |
| Login popup opens then hangs on a blank/`authorizing:github` screen | `/api/callback` 404s or errored (worker route missing, or secret exchange failed) | `curl.exe -I https://arc-community.in/api/callback` — anything but 404/500 is fine (it will 4xx on a bare GET without a `code` param; that's OK). Check worker logs via `npx wrangler tail` while retrying login |
| Login worked once, then loops or skips screens on later attempts | Old cached `301` redirect replaying a stale `state` | Ensure Step 1.3 (`302`) is deployed; clear browser cache for the site once |
| Login OK, but **Publish** fails with permission error | Logged-in GitHub user lacks write access to the repo | Add as collaborator on `ambedkar-reading-circle/ambedkar-reading-circle.github.io` |
| Publish says wrong repo / 404 | `config.yml` `repo:`/`branch:` drifted from reality | Verify `repo: ambedkar-reading-circle/ambedkar-reading-circle.github.io`, `branch: master` (currently correct) |
| Commit lands on `master` but site doesn't change | Cloudflare build failed | Dashboard → worker → Deployments; confirm build command runs `hugo` |
| Admin page itself 404s | `public/` was deployed without `static/admin` (stale build) | Re-run `hugo` before deploy; confirm `public/admin/index.html` exists locally |

Live log debugging tip: `npx wrangler tail` streams the Worker's console output in real time while you retry a login — it shows the exact error line from either function.

---

## Appendix A — The OAuth flow, annotated

What actually happens, message by message, when "Login with GitHub" is clicked:

1. **Decap (admin popup)** → `GET https://arc-community.in/api/auth`
   Decap constructs this URL from `config.yml`: `base_url` + `auth_endpoint`.
2. **`functions/api/auth.js`** builds the GitHub authorize URL:
   - `client_id` from the env secret — identifies *which* OAuth App
   - `redirect_uri = <origin>/api/callback` — must byte-match the App's registered callback
   - `scope=repo user` — what the token will be allowed to do
   - `state` — random number, CSRF-nonce (see Stage 6 note 3)
   - Responds **302** → browser follows to `github.com/login/oauth/authorize?...`
3. **GitHub** shows the user the consent screen; on **Authorize**, GitHub redirects to `https://arc-community.in/api/callback?code=XXX&state=YYY`. The `code` is a short-lived, single-use "voucher".
4. **`functions/api/callback.js`** POSTs `{client_id, client_secret, code}` to `https://github.com/login/oauth/access_token` — the server-side exchange. This is the whole reason the functions exist: **the client secret never touches the browser.** GitHub returns `{access_token: ...}`.
5. The callback renders a tiny HTML page whose script does `window.opener.postMessage('authorization:github:success:{token}', ...)` — handing the token to the Decap popup that opened it. The popup closes.
6. **Decap** stores the token and starts calling the GitHub API with it: reads `content/_index.md`, renders the form, and on Publish does `PUT /repos/.../contents/content/_index.md` — which is a commit.

Security properties you get from this shape: the secret lives only in Cloudflare; the token lives only in the editor's browser; GitHub enforces who may push.

## Appendix B — `config.yml`, annotated

```yaml
backend:
  name: github                          # talk to GitHub directly (no Netlify git-gateway)
  repo: ambedkar-reading-circle/ambedkar-reading-circle.github.io
  branch: master                        # where Publish commits land
  site_domain: https://arc-community.in # informational for github backend
  base_url: https://arc-community.in    # where the OAuth popup is served from
  auth_endpoint: /api/auth              # + base_url = the auth function's URL

media_folder: static/img                # uploads land here in the repo
public_folder: /img                     # ...and are referenced by this URL prefix

collections:                            # each entry = one form in the CMS
  - name: "home"
    label: "Home / Under Construction"
    delete: false                       # the homepage file can't be deleted from the UI
    files:
      - file: "content/_index.md"       # THE binding: form ↔ file in the content folder
        fields:
          - { label: "Title", name: "title", widget: "string" }     # → front matter
          - { label: "Message", name: "body", widget: "markdown" }  # → below front matter
```

The one line that answers "how does someone change the content sitting in our content folder": **`file: "content/_index.md"`**. Decap reads that exact file into the form, and Publish writes it back out as a commit. Add new files under `collections:` as the site grows — that is the entire extension model.
