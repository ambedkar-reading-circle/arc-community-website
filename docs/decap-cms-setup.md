# Decap CMS Setup & Wiring Guide

**Status:** Executed through Checkpoint 5 (2026-08-24) — CMS pipeline live. Stage 6 (CSRF hardening) **not yet applied**. Execution diverged from this plan in one major way (the deploy pipeline never existed as assumed) and survived one production incident; both are recorded in [§11 As-built record](#11-as-built-record--how-execution-diverged-from-this-plan).
**Date:** 2026-08-23 (plan) · 2026-08-24 (as-built record)
**Audience:** Engineer taking ownership of the ARC content pipeline
**Time estimate:** 75–105 minutes end to end (45 min if GitHub/Cloudflare access is already sorted)

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
- [8. Stage 6 — Validate the OAuth state (CSRF hardening)](#8-stage-6--validate-the-oauth-state-csrf-hardening)
- [9. Stage 7 — Recommended next steps](#9-stage-7--recommended-next-steps)
- [10. Troubleshooting](#10-troubleshooting)
- [11. As-built record — how execution diverged from this plan](#11-as-built-record--how-execution-diverged-from-this-plan)
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
                        arc-community-website
                        (content/_index.md) ──────────► GitHub Actions notices push
                                                      npm ci → tailwind → hugo
                                                      → wrangler deploy (v4)
                                                                                     6. Site updated
                                                                                        within ~1 min
```

Why the OAuth dance at all? Because Decap needs permission to commit to your repo. It asks GitHub for a personal token via OAuth. GitHub will only hand that token to a **registered OAuth App** through a **server-side code exchange** — and the "server" here is two small handlers we host ourselves (`src/api/auth.js` and `src/api/callback.js`). Those handlers need two secrets (a GitHub client ID and client secret) to prove which app is asking.

That's the entire system: **Decap UI + our two auth handlers + GitHub + Cloudflare rebuild.** Four pieces, each verified independently in the stages below.

---

## 1. Inventory — what exists today

| Piece | File | State |
|---|---|---|
| CMS app shell | `static/admin/index.html` | ✅ Working — loads Decap from unpkg CDN; Hugo copies `static/` verbatim, so it deploys at `/admin/` |
| CMS config | `static/admin/config.yml` | ✅ Working — deployed and verified live; points at `ambedkar-reading-circle/arc-community-website` (renamed from `.github.io` — see §11.4), branch `master` |
| OAuth start | `src/api/auth.js` | ✅ Deployed and live (recovered after §11.3 incident) |
| OAuth finish | `src/api/callback.js` | ✅ Deployed and live (recovered after §11.3 incident) |
| Content | `content/_index.md` | ✅ Working — the under-construction homepage |
| Site build | `layouts/`, `hugo.toml` | ✅ Working — Hugo renders `content/_index.md` into the homepage |
| Deploy config | `wrangler.jsonc` | ✅ Wired — `main: "src/worker.js"` + `run_worker_first: ["/api/*"]`, serves `public/` as static assets |
| CI/CD | `.github/workflows/deploy.yml` | ✅ Green on push to `master` (not in the original plan — see §11.1) |
| Secrets | — | ⚠️ `GITHUB_CLIENT_ID` restored; `GITHUB_CLIENT_SECRET` **must be re-set** after §11.3 wiped it |
| GitHub OAuth App | — | ✅ Registered as "ARC Community Website CMS" (plan suggested "ARC Content Manager" — cosmetic) |

## 2. The diagnosis — why login currently breaks

Observed behavior (verified 2026-08-23):

- `https://arc-community.in/admin/` loads and shows the Decap **Login with GitHub** button ✅
- Clicking it opens a popup to `/api/auth`, which returns **404** ❌ — login dies there
- `https://arc-community.in/admin/config.yml` serves the correct config ✅

Root cause — a deployment-convention mismatch:

- The OAuth handlers were originally written in the **Cloudflare Pages** *Functions* style: on Pages, a file named `api/auth.js` inside a top-level `functions` directory is *automatically* routed to `/api/auth`. Zero config.
- But this site is deployed as a **Cloudflare Worker with static assets** (see `wrangler.jsonc` — it has an `assets.directory` key; also see git history: *"Add Wrangler config to fix Cloudflare Pages deploy"*). A Worker-assets deployment **silently ignores** that Pages convention. Static files ship; the handlers don't; `/api/*` 404s.

So the answer to "we have a function but never deployed it, right?" is **yes, exactly** — the logic is complete and correct; it simply had no route into the deployed Worker.

The fix is to port the OAuth logic **natively** into handlers under `src/api/`, dispatched by a small router in `src/worker.js` registered via `main` in `wrangler.jsonc` — and to delete the inert `functions` directory outright. Why a native rewrite rather than an adapter around the Pages-style code: the Pages `context` object (`params`, `waitUntil`, `next`, `data`) was pure ceremony neither handler ever used; one convention in one place beats two running in parallel; and Pages-style functions are the dead end on this deployment, not the direction of travel. That's Stage 1.

---

## 3. Stage 1 — Route `/api/*` into the Worker (code changes)

Seven small steps, each verifiable. All are local repo edits.

### Step 1.1 — Create `src/api/auth.js`

Create the file `src/api/auth.js` (new `src/api/` directory at repo root) with exactly this content:

```js
export async function handleAuth(request, env) {
    const client_id = env.GITHUB_CLIENT_ID;

    try {
        const url = new URL(request.url);
        const redirectUrl = new URL('https://github.com/login/oauth/authorize');
        redirectUrl.searchParams.set('client_id', client_id);
        redirectUrl.searchParams.set('redirect_uri', url.origin + '/api/callback');
        redirectUrl.searchParams.set('scope', 'repo user');
        redirectUrl.searchParams.set(
            'state',
            crypto.getRandomValues(new Uint8Array(12)).join(''),
        );
        return Response.redirect(redirectUrl.href, 302);
    } catch (error) {
        console.error(error);
        return new Response('Internal Server Error', { status: 500 });
    }
}
```

**What this is and why it looks like this:**

- Native Worker signature: `handleAuth(request, env)` — no Pages-style `onRequest(context)` destructure. The Pages `context` carried `params`, `waitUntil`, `next`, and `data`; this handler never used any of them.
- The redirect is **302 from birth** (the old demo code used `301`). **Why:** `301` means *Moved Permanently* — browsers and CDNs cache it aggressively. The URL being redirected to contains a fresh random `state` parameter on every login, and a cached 301 keeps replaying the *stale* URL, which can silently break repeat logins (symptom: login works once, then weirdly fails or skips screens). `302` (temporary) is the correct status for an OAuth redirect. (This line is replaced once more in Step 6.1 to attach the state cookie — the `302` stays.)
- `scope: 'repo user'` is kept as-is — narrowing to `public_repo` is deliberately a Stage 7 item, not mixed into this port.
- The 500 body is a generic `'Internal Server Error'`, not the raw `error.message` the demo leaked. The real detail still reaches the operator via `console.error` → Worker logs (`npx wrangler tail`); the client never needs it.

### Step 1.2 — Create `src/api/callback.js`

Create the file `src/api/callback.js` with exactly this content:

```js
function renderBody(status, content) {
    const html = `
    <script>
      const receiveMessage = (message) => {
        window.opener.postMessage(
          'authorization:github:${status}:${JSON.stringify(content)}',
          message.origin
        );
        window.removeEventListener("message", receiveMessage, false);
      }
      window.addEventListener("message", receiveMessage, false);
      window.opener.postMessage("authorizing:github", "*");
    </script>
    `;
    const blob = new Blob([html]);
    return blob;
}

function htmlResponse(status, body) {
    return new Response(body, {
        headers: {
            'content-type': 'text/html;charset=UTF-8',
            'cache-control': 'no-store',
        },
        status,
    });
}

export async function handleCallback(request, env) {
    const client_id = env.GITHUB_CLIENT_ID;
    const client_secret = env.GITHUB_CLIENT_SECRET;

    try {
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        if (!code) {
            return new Response('missing code parameter', { status: 400 });
        }
        const response = await fetch(
            'https://github.com/login/oauth/access_token',
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'user-agent': 'arc-community-website-oauth',
                    'accept': 'application/json',
                },
                body: JSON.stringify({ client_id, client_secret, code }),
            },
        );
        const result = await response.json();
        if (result.error) {
            return htmlResponse(401, renderBody('error', result));
        }
        const token = result.access_token;
        const provider = 'github';
        const responseBody = renderBody('success', {
            token,
            provider,
        });
        return htmlResponse(200, responseBody);

    } catch (error) {
        console.error(error);
        return htmlResponse(500, 'Internal Server Error');
    }
}
```

**What this is and why it looks like this:**

- Same native signature change: `handleCallback(request, env)`; the Pages `context` fields were unused here too.
- The `user-agent` on the token-exchange request changes from the demo leftover `'cloudflare-functions-github-oauth-login-demo'` to `'arc-community-website-oauth'`. GitHub requires a user-agent on API calls; the string itself is arbitrary, so claim it.
- `renderBody` is byte-for-byte identical to the original. It builds the HTML that performs the `postMessage` handshake with the Decap popup — the message format (`authorization:github:{status}:{token}` plus the `authorizing:github` ping) is Decap's contract. **Do not reformat the template literal** — its whitespace and indentation are inside the string.
- A request without a `code` parameter gets **400 immediately** — no wasted round trip to GitHub's token endpoint and no cryptic upstream error relayed back to the popup.
- The three HTML responses are built by one `htmlResponse(status, body)` helper instead of three copy-pasted `new Response(...)` blocks. It also sets **`cache-control: no-store`** on all of them — the success body embeds the access token, and that must never land in any cache. (Stage 6 extends this helper with an optional `extraHeaders` argument to burn the state cookie.)
- Like `auth.js`, the 500 body is generic (`'Internal Server Error'`); the real detail goes to Worker logs via `console.error`.

### Step 1.3 — Create `src/worker.js` (the router)

Create the file `src/worker.js` with exactly this content:

```js
import { handleAuth } from './api/auth.js';
import { handleCallback } from './api/callback.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api/auth') return handleAuth(request, env);
    if (pathname === '/api/callback') return handleCallback(request, env);

    return env.ASSETS.fetch(request);
  },
};
```

**How requests now route** (this is the part worth understanding):

1. A request arrives at Cloudflare.
2. By default, **static assets are checked first** — if a file in `public/` matches the path, it's served and the Worker never runs. This is why the site's pages keep working exactly as before, with zero overhead.
3. With `run_worker_first: ["/api/*"]` set (Step 1.4), `/api/*` skips the asset lookup and invokes the Worker directly. The router matches the pathname and dispatches to a handler.
4. Anything that isn't an API route falls through to `env.ASSETS.fetch(request)`. `env.ASSETS` is an automatic binding (present whenever a Worker has static assets configured) that serves files from `public/`. A Worker must return *something* for every request — this fallback is what makes that true.

### Step 1.4 — Wire the Worker into `wrangler.jsonc`

Two keys: `main` (so Wrangler knows to bundle and deploy the Worker alongside the assets) and `run_worker_first` inside the `assets` block (so `/api/*` always invokes the Worker, even if someone someday adds a `public/api/` file — belt-and-suspenders; behavior is otherwise unchanged). Final block:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "arc-community-website",
  "main": "src/worker.js",
  "compatibility_date": "2026-08-05",
  "observability": {
    "enabled": true
  },
  "assets": {
    "directory": "public",
    "run_worker_first": ["/api/*"]
  },
  "compatibility_flags": ["nodejs_compat"]
}
```

### Step 1.5 — Delete the old `functions` directory

From the repo root (PowerShell):

```powershell
Remove-Item -Recurse -Force functions
```

**Why delete instead of keep:** nothing deploys it, so keeping it invites exactly the trap this stage fixes — "I added a file under `functions`, why doesn't it route?" One convention, one place. After Step 1.3 nothing imports from it; the delete proves that (the dry-run in Step 1.6 would fail on a dangling import). `git status` shows the deletions; they're committed in Step 1.7.

### Step 1.6 — Verify the build locally

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

### Step 1.7 — Commit

```powershell
git add src/ wrangler.jsonc
git add -A functions      # stages the old directory's deletion (Step 1.5)
git commit -m "Serve OAuth endpoints natively from the Worker"
```

(Adapt the message to house style; the point is: this is a self-contained, revertable change.)

---

## 4. Stage 2 — Deploy the Worker

Two paths. **Use Path A** — it keeps deploys consistent forever. Path B is the manual override.

### Path A — Push and let GitHub Actions build (preferred, as built)

The plan originally assumed Cloudflare's own git integration (Workers Builds) would auto-deploy on push. **That integration never existed on this project** — discovered only when a CMS publish landed on `master` and the live site didn't change (full story in §11.1). The auto-deploy that actually exists is GitHub Actions:

1. `.github/workflows/deploy.yml` triggers on every push to `master` (also on manual `workflow_dispatch`).
2. Pipeline: `hugo --minify` (pinned `0.164.0`, binary cached between runs) → `wrangler deploy` (pinned v4 — the action's default 3.90.0 predates `wrangler.jsonc` support). The compiled stylesheet `assets/css/tw.css` is **committed**, so CI needs no Node/Tailwind; a `concurrency` block cancels superseded runs so two quick publishes can't deploy out of order (§11.7).
3. Authentication is via **repo-level secrets** — `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub → Settings → Secrets and variables → Actions. No personal login is involved, which is exactly why editors never need Cloudflare credentials (§11.6).

To deploy: `git push origin master`, then watch the repo's **Actions** tab. Green check = live.

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

Expected result: **HTTP 302** (a 301 here means Step 1.1's `302` isn't deployed — re-check the deployment) with a `Location` header pointing at `https://github.com/login/oauth/authorize?...`.

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

- It must **exactly match** what `src/api/auth.js` constructs at runtime: `url.origin + '/api/callback'` — i.e. the origin of wherever `/api/auth` was reached from. Since we always reach it via `https://arc-community.in/admin/`, the callback is `https://arc-community.in/api/callback`. GitHub shows a `redirect_uri_mismatch` error page if they differ by even a slash.
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
6. GitHub Actions picks up the push → builds (Tailwind + Hugo) → `wrangler deploy` → within a minute or two `https://arc-community.in/` shows your edit. Watch it happen in the repo's **Actions** tab.

**Things worth knowing before you demo this to editors:**

- **Access control = GitHub repo access.** Anyone who can log in via OAuth can *see* the CMS, but publishing requires **write access to the repo** — otherwise the commit fails with a 403-ish error. To onboard a new editor: add them as a repo collaborator, done. No CMS-level user management exists (by design).
- **The token lives in the browser's localStorage** for `arc-community.in` after login. The CMS **Logout** button clears it. Shared/borrowed machines: log out when done.
- The first OAuth login on a fresh app may show a scary "unverified application" warning screen — that's normal for unverified apps; it can be approved for the org if desired.

**Checkpoint 5 (pipeline proven):** an edit made in `/admin` appears as a commit on `master` and shows up on the live site with no human touching the terminal.

**Do not stop here.** Checkpoint 5 proves the pipeline, but the OAuth flow still carries a weakness inherited from the demo it's based on: `auth.js` generates a `state` param that `callback.js` never checks — no CSRF protection on login. Stage 6 closes it with a ~10-line stateless fix, and it must land **before any editor beyond the core team gets the `/admin` URL**. The finish line is Checkpoint 6.

---

## 8. Stage 6 — Validate the OAuth state (CSRF hardening)

Scheduled deliberately as the step right after Checkpoint 5, not as a "next step." Two weaknesses inherited from the demo this flow is based on were triaged in review:

- The **redirect status** was born fixed: `src/api/auth.js` has returned `302` since Step 1.1 — the demo's cacheable `301` would have broken repeat logins, and no retro-fix is needed here.
- **State validation** is deferred no further than here. `auth.js` has always sent a random `state` param; `callback.js` has never checked it. Until this stage there is **no CSRF protection on login**: an attacker can complete the OAuth flow themselves and trick a victim's browser into adopting the attacker's token (the victim then unknowingly edits and publishes under the attacker's identity). Tolerable while the editor group is the core team; a hard blocker the moment anyone else gets the `/admin` URL.

Note the ordering dependency: a cached 301 would defeat this check too (it replays a stale state against a fresh cookie), which is why the `302` (Step 1.1) had to be in place before this stage. Fix the redirect *before* adding state checks, never after.

The fix is stateless — no KV, no storage. `auth.js` plants the state in a short-lived cookie; `callback.js` compares cookie vs. query param and fails closed. The popup flow stays on `arc-community.in` the whole way, so the cookie is guaranteed to ride along.

### Step 6.1 — Plant the state cookie in `src/api/auth.js`

`Response.redirect()` cannot attach headers, so replace the redirect line (the one Step 1.1 wrote) with a `Response` that sets both the `Location` and the cookie. Hoist the state into a variable so the URL and the cookie share one value:

**Before (as written in Step 1.1):**

```js
        redirectUrl.searchParams.set(
            'state',
            crypto.getRandomValues(new Uint8Array(12)).join(''),
        );
        return Response.redirect(redirectUrl.href, 302);
```

**After:**

```js
        const state = crypto.getRandomValues(new Uint8Array(12)).join('');
        redirectUrl.searchParams.set('state', state);
        return new Response(null, {
            status: 302,
            headers: {
                Location: redirectUrl.href,
                'Set-Cookie': `oauth_state=${state}; Max-Age=600; Path=/api; HttpOnly; SameSite=Lax; Secure`,
            },
        });
```

Cookie attributes, so this isn't cargo-culted: `Max-Age=600` gives the editor 10 minutes on GitHub's consent screen; `Path=/api` limits the cookie to the two auth endpoints; `HttpOnly` keeps it out of page JavaScript; `SameSite=Lax` still rides the top-level navigation back from GitHub while blocking the cross-site requests an attacker needs; `Secure` because the site is HTTPS-only.

### Step 6.2 — Verify the state in `src/api/callback.js`

At the top of the `try` block, right after `const url = new URL(request.url);`, reject anything that doesn't match:

```js
        const state = url.searchParams.get('state');
        const cookie = (request.headers.get('Cookie') || '').match(
            /(?:^|;\s*)oauth_state=([^;]+)/,
        );
        if (!state || !cookie || cookie[1] !== state) {
            return new Response('state mismatch', { status: 403 });
        }
```

Then burn the cookie after a successful exchange. The `htmlResponse` helper from Step 1.2 doesn't take extra headers, so extend it, then pass the burn header on the success call only:

```js
function htmlResponse(status, body, extraHeaders = {}) {
    return new Response(body, {
        headers: {
            'content-type': 'text/html;charset=UTF-8',
            'cache-control': 'no-store',
            ...extraHeaders,
        },
        status,
    });
}
```

```js
        return htmlResponse(200, responseBody, {
            'Set-Cookie': 'oauth_state=; Max-Age=0; Path=/api; HttpOnly; SameSite=Lax; Secure',
        });
```

(In the helper, only the `extraHeaders = {}` parameter and its spread are new; at the call site, only the `Set-Cookie` header.) One-time use by design: if anything replays the callback URL later, the state no longer matches and the check fails closed.

### Step 6.3 — Commit, deploy, verify

```powershell
git add src/api/auth.js src/api/callback.js
git commit -m "Validate OAuth state against a cookie (CSRF hardening)"
git push origin master
```

Then two tests:

1. **Positive:** full login at `https://arc-community.in/admin/` — must still reach Checkpoint-5 behavior (popup closes, CMS loads, an edit publishes).
2. **Negative:**

   ```powershell
   curl.exe -I "https://arc-community.in/api/callback?code=x&state=bogus"
   ```

   Expected: **HTTP 403** — no matching cookie, so the check rejects the request before any token exchange happens.

**Checkpoint 6 (the finish line):** a real login still works end-to-end AND a bogus callback gets 403. Only now hand the `/admin` URL to editors beyond the core team.

---

## 9. Stage 7 — Recommended next steps

With the pipeline working (Stage 5) and hardened (Stage 6), remaining improvements in priority order:

1. **Editorial workflow** — in `static/admin/config.yml`, add as the first key under `backend:`:

   ```yaml
   publish_mode: editorial_workflow
   ```

   Edits then become **draft commits on a branch + open pull request** instead of direct commits to `master`. Someone reviews the PR, merges, site updates. Recommended once more than one person edits, or before handing admin access to non-technical editors.

2. **Narrow the OAuth scope** — `src/api/auth.js` requests `scope: 'repo user'`. For a public repo, `public_repo` suffices and grants less. Edit the string in `auth.js`, commit, push. (Existing tokens keep old scope until users re-login.)

3. **Grow the CMS to match the site** — every future content type (blog posts, events, pages) becomes a `collections:` entry in `config.yml` mapping form widgets to files/sections under `content/`. The media library uploads into `static/img` (already configured via `media_folder`).

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/auth` returns 404 | Worker not deployed — `main` missing from `wrangler.jsonc`, or deploy failed | Checkpoint 2; inspect Cloudflare deployment logs |
| `curl.exe -I` shows `client_id=undefined` | Secrets not set / typo in name | Stage 4; names are case-sensitive |
| GitHub page: `redirect_uri_mismatch` | Callback URL in OAuth App ≠ `https://arc-community.in/api/callback` exactly, or admin was opened on `*.workers.dev` | Fix the app's callback URL; always use the custom domain |
| Login popup opens then hangs on a blank/`authorizing:github` screen | `/api/callback` 404s or errored (worker route missing, or secret exchange failed) | `curl.exe -I https://arc-community.in/api/callback` — anything but 404/500 is fine (a bare GET returns **400** today — missing `code`, see Step 1.2 — and **403** once Stage 6 is live; that's OK). Check worker logs via `npx wrangler tail` while retrying login |
| Login worked once, then loops or skips screens on later attempts | Old cached `301` redirect replaying a stale `state` | Ensure Step 1.1 (`302`) is deployed; clear browser cache for the site once |
| Real login dies at the callback with **403 state mismatch** | The `oauth_state` cookie didn't arrive or expired — browser blocking cookies, or more than 10 min (`Max-Age=600`) spent on GitHub's consent screen | Retry the login; if persistent, clear the site's cookies and confirm the Step 6.1 `Set-Cookie` is deployed (`npx wrangler tail` while retrying shows the exact line) |
| Login OK, but **Publish** fails with permission error | Logged-in GitHub user lacks write access to the repo | Add as collaborator on `ambedkar-reading-circle/arc-community-website` |
| Publish says wrong repo / 404 | `config.yml` `repo:`/`branch:` drifted from reality | Verify `repo: ambedkar-reading-circle/arc-community-website`, `branch: master` (currently correct) |
| Commit lands on `master` but site doesn't change | GitHub Actions run failed (red ✗ in the repo's Actions tab) | Open the failed run; the step that died names the problem — historically: missing Tailwind build, Hugo version drift, wrangler predating `wrangler.jsonc` (§11.1) |
| **CI is green but `/api/auth` returns 404** | An **assets-only deploy wiped the Worker**: `wrangler.jsonc` lost its `main` key (or was deployed from a checkout without `src/`) — such a deploy replaces the previous one, deleting the Worker script *and its secrets* | Restore `"main": "src/worker.js"`, push, let CI redeploy, then re-set **both** secrets (`npx wrangler secret put GITHUB_CLIENT_ID` / `...GITHUB_CLIENT_SECRET`) — this exact incident happened; see §11.3 |
| Admin page itself 404s | `public/` was deployed without `static/admin` (stale build) | Re-run `hugo` before deploy; confirm `public/admin/index.html` exists locally |

Live log debugging tip: `npx wrangler tail` streams the Worker's console output in real time while you retry a login — it shows the exact error line from either function.

---

## 11. As-built record — how execution diverged from this plan

The plan above was written 2026-08-23 and executed 2026-08-24. Stages 1–5 landed and Checkpoints 1–5 all passed, but execution diverged in real ways. Each divergence below changes something the plan still asserts; the affected claims above have been corrected and point here.

### 11.1 The deploy pipeline the plan assumed never existed

**What the plan assumed:** Cloudflare git integration (Workers Builds) watches `master` and rebuilds on push (original Stage 2 Path A, the round-trip diagram, Stage 5 step 6).

**What actually happened:** Checkpoint 5's CMS publish landed as a commit on `master` — and the live site didn't change. There was no Cloudflare git integration and never had been; every deploy to that point was manual `wrangler deploy` (Path B). The plan's Path A described machinery that was never configured.

**What was built instead:** a GitHub Actions workflow, `.github/workflows/deploy.yml` — `npm ci` → `npm run css:build` → `hugo --minify` → `wrangler deploy`, authenticating with the repo-level secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

Getting it green took four fixes, each a distinct class of drift worth remembering:

| # | Failure in CI | Root cause | Fix |
|---|---|---|---|
| 1 | Workflow never triggered on CMS publishes | Trigger said `branches: [main]`; the repo's branch is `master` | Trigger on `master` |
| 2 | Hugo: `fingerprint: <nil> can not be transformed` | `assets/css/tw.css` is a compiled artifact and **gitignored** — CI never ran Tailwind, so the asset didn't exist at build time | Added `npm run css:build` before `hugo` |
| 3 | Hugo: `can't evaluate field Locale in type *langs.Language` | Workflow pinned Hugo `0.145.0`; the templates use newer API (`.Site.Language.Locale`); local dev runs `0.164.0` | Pin `0.164.0`; also removed the template-level `minify` from `layouts/_default/baseof.html` (the CLI's `--minify` already covers it) |
| 4 | `wrangler deploy`: `Missing entry-point` | wrangler-action defaulted to wrangler **3.90.0**; `wrangler.jsonc` (vs `.toml`) support arrived in 3.91.0, so the action's wrangler couldn't see the config at all | Pin `wranglerVersion: '4'` |

**Rule for reading the plan:** anywhere it says "Workers Builds," read "GitHub Actions."

### 11.2 Workflow files need `workflow` scope to push

The first CLI push of `deploy.yml` was rejected: *"refusing to allow an OAuth App to create or update workflow without `workflow` scope."* GitHub deliberately blocks OAuth tokens from touching `.github/workflows/*` unless explicitly granted that scope. Consequences:

- The first version of the file was created through the **GitHub web UI** (commit `1b4edcd`).
- `gh auth refresh -h github.com -s workflow` (device-code flow, one browser authorization) then permanently fixed CLI pushes; `gh auth setup-git` wired git to the gh credential.

### 11.3 Incident: a `git reset --hard` silently unpublished the Worker

Recorded honestly, because the signature will recur if the lesson doesn't:

1. The Worker commit (`b1f3c42` — Stage 1 in full, plus the doc sync) was **local-only**; its push had been rejected by the §11.2 scope error, so it sat unpushed.
2. While resolving the conflict between the locally-committed workflow file and the UI-created one, the operator ran `git reset --hard origin/master`. That silently **discarded `b1f3c42`** — the repo lost `src/`, and `wrangler.jsonc` reverted to a config with no `main`.
3. The next CI run (otherwise green) shipped that assets-only config. An assets-only `wrangler deploy` **replaces** the previous deployment: the Worker script was deleted in production, and its secrets with it. `/api/auth` went 404 — CMS login broken while content deploys kept working. The asymmetry (green CI, broken admin) is the diagnostic signature.
4. **Recovery:** the commit still existed in the reflog (as the rebased `9119c96`); it was cherry-picked as `fe77c52`, pushed, and CI redeployed the Worker. `GITHUB_CLIENT_ID` was re-set via `npx wrangler secret put`. `GITHUB_CLIENT_SECRET` is unreadable from anywhere and must be re-pasted once from the OAuth App page (Stage 4 command).

Standing lessons:

- **An unpushed local commit is one `reset --hard` away from not existing.** Push early, push often.
- **A checkout whose `wrangler.jsonc` lacks `main` is a loaded gun** — any deploy from it (CI or manual) wipes the Worker *and its secrets*. The troubleshooting table gained a row for this signature.

### 11.4 Repo renamed

`ambedkar-reading-circle/ambedkar-reading-circle.github.io` → `ambedkar-reading-circle/arc-community-website`. GitHub redirects the old name everywhere (git remotes, API, OAuth), so nothing broke — Checkpoint 5 had already passed under the old name. `static/admin/config.yml` and the local remote were updated to the canonical name anyway; redirects are a compatibility feature, not an identity. Leftover: the repo's GitHub Pages past still shows historical `pages-build-deployment` runs in the Actions tab — harmless (the custom domain points at Cloudflare), and Pages can be disabled under repo Settings → Pages if the noise matters.

### 11.5 Minor deviations

- OAuth App registered as **"ARC Community Website CMS"**, not the plan's suggested "ARC Content Manager" — cosmetic.
- Cloudflare secrets were set via the dashboard UI rather than `wrangler secret put` — same effect. After §11.3 they must be re-set once more regardless.

### 11.6 Onboarding editors — what they actually need

The Stage 5 note ("access control = GitHub repo access") is exactly right, and the deploy side needs **nothing** from editors:

| Editor needs | Who provides | When |
|---|---|---|
| A GitHub account | editor | once |
| **Write access** — repo → Settings → Collaborators → Add people | admin | once |
| One-time "Authorize" click on the OAuth consent screen | editor, via the existing login flow | once per login (the token persists in their browser until Logout) |
| GitHub token | **Minted automatically** by `/api/auth` → `/api/callback` at login; bound to *their* account; stored in *their* browser only | automatic |
| Cloudflare token | **Nobody** — CI deploys authenticate with the repo-level `CLOUDFLARE_API_TOKEN` secret; whoever pushed is irrelevant | never |

No editor ever creates a token, installs anything, or needs to know Cloudflare exists. Onboarding is literally one collaborator invite; **Publish** rides the same GitHub Actions pipeline as every other commit to `master` (~40 s to live).

Before handing `/admin` to editors beyond the core team, the plan's own advice stands, and the infra now makes it cheap: land **Stage 6** (state validation) first; then consider Stage 7's `editorial_workflow` (drafts become PRs instead of direct commits to `master`) and `public_repo` scope narrowing — the repo is public, so the narrower scope suffices and each editor's login token then cannot touch their private repositories.

### 11.7 CI slimmed: compiled CSS committed, deploy runs serialized

The first green pipeline installed Node + Tailwind on every run — ~31 s end to end, of which roughly 4 s was actual building. Two changes:

- **`assets/css/tw.css` is committed** (un-gitignored). Tailwind becomes a dev-side step: anyone changing styling or layout classes runs `npm run css:build` locally (needed for preview anyway) and commits the result alongside the change. CI dropped `npm ci` and the CSS build entirely.
- **`concurrency: group=deploy, cancel-in-progress: true`** fixes a latent race: two publishes landing close together used to run concurrently, and if the *older* run's deploy finished last, the live site silently reverted until the next push. Superseded runs are now cancelled automatically.

Tradeoff of the committed CSS: Tailwind generates classes by scanning templates *and content*, so a raw-HTML utility class an editor hand-writes in a CMS markdown field won't exist in `tw.css` until the next dev-side rebuild + commit. Classes referenced from `layouts/` are immune — they change only via dev commits.

---

## Appendix A — The OAuth flow, annotated

What actually happens, message by message, when "Login with GitHub" is clicked:

1. **Decap (admin popup)** → `GET https://arc-community.in/api/auth`
   Decap constructs this URL from `config.yml`: `base_url` + `auth_endpoint`.
2. **`src/api/auth.js`** builds the GitHub authorize URL:
   - `client_id` from the env secret — identifies *which* OAuth App
   - `redirect_uri = <origin>/api/callback` — must byte-match the App's registered callback
   - `scope=repo user` — what the token will be allowed to do
   - `state` — random CSRF nonce; Stage 6 also plants it in a short-lived cookie for verification
   - Responds **302** → browser follows to `github.com/login/oauth/authorize?...`
3. **GitHub** shows the user the consent screen; on **Authorize**, GitHub redirects to `https://arc-community.in/api/callback?code=XXX&state=YYY`. The `code` is a short-lived, single-use "voucher". `callback.js` first verifies `state` against the cookie planted in step 2 (Stage 6); on mismatch it returns 403 and no exchange happens.
4. **`src/api/callback.js`** POSTs `{client_id, client_secret, code}` to `https://github.com/login/oauth/access_token` — the server-side exchange. This is the whole reason the handlers exist: **the client secret never touches the browser.** GitHub returns `{access_token: ...}`.
5. The callback renders a tiny HTML page whose script does `window.opener.postMessage('authorization:github:success:{token}', ...)` — handing the token to the Decap popup that opened it. The popup closes.
6. **Decap** stores the token and starts calling the GitHub API with it: reads `content/_index.md`, renders the form, and on Publish does `PUT /repos/.../contents/content/_index.md` — which is a commit.

Security properties you get from this shape: the secret lives only in Cloudflare; the token lives only in the editor's browser; GitHub enforces who may push; and the Stage 6 state check closes the login-CSRF hole.

## Appendix B — `config.yml`, annotated

```yaml
backend:
  name: github                          # talk to GitHub directly (no Netlify git-gateway)
  repo: ambedkar-reading-circle/arc-community-website  # renamed from .github.io (§11.4); old name still resolves via redirect
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
