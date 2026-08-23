# Engineer's Guide: Favicon, Open Graph & JSON-LD for arc-community.in

> **Status: IMPLEMENTED.** The system this document designed now lives in
> `layouts/partials/head/{favicon,seo,json-ld}.html` + `hugo.toml [params]` +
> `assets/images/`. The shipped code is the source of truth and deviates
> deliberately from the snippets below (param-driven constants instead of
> literals, `arc-favicon.png` instead of `arc-icon.png`, an overlay-based
> opaque touch icon). Treat the snippets as historical design rationale —
> do not re-apply them by hand.

Target audience: an engineer (or agent) unfamiliar with this repo.

---

## 0. Scope and outcome

This change adds three categories of metadata to the site's `<head>`:

| Category | What it does | Who consumes it |
|---|---|---|
| **Favicon set** (PNG icons + web manifest) | Tab/bookmark icon, Android home-screen icon, iOS home-screen icon, browser UI tint | Browsers and OSes |
| **Open Graph + Twitter Card tags** | Rich preview card when the site URL is shared on WhatsApp, Telegram, X/Twitter, Facebook, Slack, Discord, iMessage, etc. | Link-unfurling crawlers |
| **JSON-LD structured data** | Machine-readable description of the organization and website, enabling knowledge-panel-style results and validating us as an entity | Search engines (Google, Bing), validators |

Everything is generated **at Hugo build time** from two source images, so a
future logo swap automatically regenerates every derived asset — no manual
image wrangling, no external tools.

---

## 1. How the pieces work — logical flow

### 1.1 Build-time flow (Hugo)

```
hugo.toml  [params]  (social[], twitter_handle, og_image_alt, description)
      │
      │  referenced by every partial below
      ▼
assets/images/arc-icon.png          assets/images/arc-logo-blue.png
 (square mark, >=512x512)            (508x264 wordmark)
      │                                      │
      │ resources.Get "images/..."           │ resources.Get "images/..."
      ▼                                      ▼
layouts/partials/head/favicon.html   layouts/partials/head/seo.html
  .Resize  16/32/180/192/512           .Filter (images.Padding ...) + .Resize fill
  .Filter  (images.Padding) → touch
  resources.FromString → manifest
      │                                      │
      ▼                                      ▼
public/images/*.png  (derived, hash-suffixed filenames)
public/site.webmanifest (generated JSON file)
      │
      ▼
layouts/partials/head/json-ld.html  → inline <script type="application/ld+json">
      │                                       in public/index.html
      ▼
layouts/_default/baseof.html  includes all three partials in <head>
```

Key idea: `static/` files are copied verbatim and **cannot be processed**. Only
files under `assets/` are loadable via `resources.Get` and therefore eligible
for the image pipeline (resize, pad, crop). That is why step 2 moves the logo.

### 1.2 Consumer flow (what happens after deploy)

```
Browser, opening the site:
  HTML <head> → <link rel="manifest"> + <link rel="icon"> → picks 16/32 PNG for tab
  Android "Add to home screen" → manifest icons (192/512)
  iOS "Add to Home Screen"     → apple-touch-icon (180, opaque)
  Mobile Chrome address bar    → <meta name="theme-color"> (#131857)

Link unfurler (WhatsApp/Telegram/X/Facebook/Slack):
  1. crawler GETs the shared URL → reads og:title, og:description, og:image
  2. crawler fetches og:image URL (must be ABSOLUTE) → renders preview card
  3. X additionally reads twitter:card / twitter:site

Search engine:
  1. crawler parses <script type="application/ld+json">
  2. resolves @graph: Organization (with sameAs social links) + WebSite
  3. associates entity across the web via sameAs
```

Why absolute URLs matter: `og:image` is fetched by a *different* crawler than
the page, with no page context — a relative path like `images/x.png` breaks.
Icons (`rel="icon"`) are resolved relative to the page, so relative is fine.

---

## 2. Prerequisites (gather before starting)

1. **Square mark PNG**, ideally exactly square and >= 512x512 px (Hugo's
   current image pipeline *does* upscale on explicit `Resize` — a smaller
   source ships as a soft upscale). Transparent background is fine. Save as
   `assets/images/arc-favicon.png`. *(Owner confirmed a square mark exists.)*
2. **Social profile URLs** for `sameAs` (Instagram / X / YouTube / WhatsApp
   channel, etc.) and the X handle for `twitter:site`. *(Owner will provide.)*
   URLs must be the canonical public profile pages (This is our only instagram url, use this: `https://www.instagram.com/arc.bangalore/`).
3. Hugo v0.164+ extended edition installed (already present on this machine).
   The `images.Padding` filter requires Hugo >= 0.126 — satisfied.

Brand constants (from `assets/css/main.css` design tokens):
- primary / theme color: `#131857`
- background cream: `#ffffee`

---

## 3. Implementation steps

### Step 1 — Add the square mark

Place the square icon file at `assets/images/arc-icon.png`.

No code change yet; the partials added later reference it. If the mark is
*nearly* but not perfectly square (e.g. 1024x1020), that's acceptable — use the
`fill` variants noted in step 3, which force exact squares by center-cropping.

---

### Step 2 — Move the wordmark into the asset pipeline

**Goal:** make the existing logo processable by Hugo's image functions.

```powershell
git mv static/images/arc-logo-blue.png assets/images/arc-logo-blue.png
```

Update `layouts/partials/site-header.html`:

```html
{{ $logo := resources.Get "images/arc-logo-blue.png" }}
<img
  src="{{ $logo.RelPermalink }}"
  alt="{{ .Site.Title }} logo"
  class="w-32 rounded-lg border border-primary my-3"
>
```

**Why:** `resources.Get` reads only from `assets/`. An unprocessed asset
publishes to the identical URL it had in `static/` (`/images/arc-logo-blue.png`),
so the rendered page is byte-for-byte unchanged — this step is invisible but
enables everything later.

---

### Step 3 — Favicon partial

Create `layouts/partials/head/favicon.html`:

```html
{{- $icon := resources.Get "images/arc-icon.png" -}}
{{- if $icon -}}

  {{- /* Straight resizes from the square source.
         "WxH" without a qualifier = fit-within; a square source yields
         exactly square output. If the source is not perfectly square,
         use e.g. "32x32 fill" instead. */ -}}
  {{- $favicon32 := $icon.Resize "32x32" -}}
  {{- $favicon16 := $icon.Resize "16x16" -}}
  {{- $icon192 := $icon.Resize "192x192" -}}
  {{- $icon512 := $icon.Resize "512x512" -}}

  {{- /* Apple touch icon: iOS composites transparent pixels as BLACK and
          images.Padding preserves alpha, so an opaque icon needs an opaque
          base: upscale a 1x1 brand-cream pixel to the canvas and overlay
          the mark (see layouts/partials/head/favicon.html). */ -}}
  {{- $touch := (resources.Get "images/pixel-ffffee.png").Resize "180x180" -}}
  {{- $touch = $touch.Filter (images.Overlay ($icon.Resize "140x140") 20 20) -}}

  {{- /* Web app manifest, generated as a virtual file. */ -}}
  {{- $manifest := dict
        "name" site.Title
        "short_name" "ARC"
        "start_url" "/"
        "display" "standalone"
        "background_color" "#ffffee"
        "theme_color" "#131857"
        "icons" (slice
          (dict "src" $icon192.RelPermalink "sizes" "192x192" "type" "image/png" "purpose" "any maskable")
          (dict "src" $icon512.RelPermalink "sizes" "512x512" "type" "image/png" "purpose" "any maskable")
        )
  -}}
  {{- $manifestResource := resources.FromString "site.webmanifest" ($manifest | jsonify) -}}

  <link rel="icon" type="image/png" sizes="32x32" href="{{ $favicon32.RelPermalink }}">
  <link rel="icon" type="image/png" sizes="16x16" href="{{ $favicon16.RelPermalink }}">
  <link rel="apple-touch-icon" sizes="180x180" href="{{ $touch.RelPermalink }}">
  <link rel="manifest" href="{{ $manifestResource.RelPermalink }}">
  <meta name="theme-color" content="#131857">
{{- end -}}
```

**Line-by-line rationale:**

- **`if $icon` guard** — the build must not crash if `arc-icon.png` is absent;
  the head simply renders without icons.
- **16 + 32 PNG favicons** — every current browser supports PNG favicons.
  32 covers standard/retina tabs, 16 is the legacy fallback.
- **No `.ico`** — Hugo's pipeline cannot emit ICO, and nothing requires it
  anymore. (An `.ico` would only matter for IE-era browsers.)
- **Apple touch 180x180 on an opaque base** — iOS request sizes vary by device,
  but 180 is the largest canonical size and iOS downscales. The opaque cream
  base fixes the transparency-to-black problem (padding alone cannot: it
  preserves alpha) and gives the icon breathing room.
- **Manifest with 192 + 512 `any maskable`** — Android/Chrome reads these for
  "Add to home screen". `maskable` means the icon is safe to crop to shapes
  (circle/squircle); because the mark is centered with generous margins this is
  true. One icon entry serving both purposes keeps the manifest minimal.
- **`resources.FromString`** — creates the manifest out of thin air (a Go map →
  `jsonify` → virtual file) instead of hand-maintaining a static JSON file.
  Published to `/site.webmanifest`.
- **`theme-color`** — tints the mobile browser address bar with brand indigo.
- **Relative URLs (`.RelPermalink`)** — correct for icons; see §1.2.

---

### Step 4 — Open Graph / Twitter partial

Create `layouts/partials/head/seo.html`:

```html
{{- $title := or .Title site.Title -}}
{{- $description := or .Description site.Params.description -}}
{{- $url := .Permalink -}}

{{- /* OG image: wordmark centered on cream, exactly 1200x630.
       Arithmetic in the guide, §4. */ -}}
{{- $ogImage := "" -}}
{{- with resources.Get "images/arc-logo-blue.png" -}}
  {{- $ogImage = .Filter (images.Padding 183 346 "#ffffee") -}}
{{- end -}}

<meta property="og:type" content="website">
<meta property="og:site_name" content="{{ site.Title }}">
<meta property="og:title" content="{{ $title }}">
<meta property="og:description" content="{{ $description }}">
<meta property="og:url" content="{{ $url }}">
{{- with $ogImage }}
  <meta property="og:image" content="{{ .Permalink }}">
  <meta property="og:image:width" content="{{ .Width }}">
  <meta property="og:image:height" content="{{ .Height }}">
  <meta property="og:image:alt" content="{{ site.Params.og_image_alt | default "Ambedkar Reading Circle wordmark" }}">
{{- end }}
<meta property="og:locale" content="en_US">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{{ $title }}">
<meta name="twitter:description" content="{{ $description }}">
{{- with $ogImage }}<meta name="twitter:image" content="{{ .Permalink }}">{{- end }}
{{- with site.Params.twitter_handle }}<meta name="twitter:site" content="{{ . }}">{{- end }}
```

**Rationale:**

- **1200x630** is the size every unfurler renders well; anything smaller may be
  rejected by Facebook (min 200x200, recommends 1200x630) and looks cropped on
  X. `summary_large_image` = the big card with image on top.
- **`.Permalink` (absolute)** for `og:image`/`twitter:image` — mandatory, §1.2.
  Hugo emits `https://arc-community.in/images/...` because `baseURL` is set.
- **Fallback chain** (`or .Title site.Title`, `or .Description ...`) — the
  homepage sets its own title; future pages without a description inherit the
  site-level one, so this partial is reusable on any future page type.
- **`twitter:site` only when set** — emitting an empty tag would be invalid.
- **`og:locale`** hardcoded to `en_US` (correct POSIX→OG transformation of the
  site's `en-us` locale) to avoid depending on language config plumbing.

**Fallback if `images.Padding` rejects the two-value form:** pad all sides then
center-crop — replace the `$ogImage` line with:

```html
{{- $ogImage = (.Filter (images.Padding 346 "#ffffee")).Resize "1200x630 fill" -}}
```

Both routes produce an identical 1200x630 image (proof in §4). Verify the
output dimensions in step 9 and switch forms only if the build errors.

---

### Step 5 — JSON-LD partial

Create `layouts/partials/head/json-ld.html`:

```html
{{- $logoURL := "" -}}
{{- with resources.Get "images/arc-icon.png" }}{{ $logoURL = .Permalink }}{{ end -}}

{{- $sameAs := slice -}}
{{- range site.Params.social }}{{ $sameAs = $sameAs | append . }}{{ end -}}

{{- $orgID := printf "%s#organization" site.BaseURL -}}
{{- $siteID := printf "%s#website" site.BaseURL -}}

{{- $graph := slice
      (dict
        "@type" "Organization"
        "@id" $orgID
        "name" site.Title
        "url" site.BaseURL
        "description" site.Params.description
        "logo" $logoURL
        "sameAs" $sameAs
      )
      (dict
        "@type" "WebSite"
        "@id" $siteID
        "name" site.Title
        "url" site.BaseURL
        "inLanguage" "en"
        "publisher" (dict "@id" $orgID)
      )
-}}

<script type="application/ld+json">{{ dict "@context" "https://schema.org" "@graph" $graph | jsonify | safeJS }}</script>
```

**Rationale:**

- **`@graph` with `@id` nodes** — the canonical schema.org pattern for linking
  entities: `WebSite.publisher` points at `Organization` by `@id`, letting
  crawlers merge them into one knowledge graph instead of two detached blocks.
- **`Organization`** — correct general type. (schema.org also offers the
  subtype `NGO`; switch later if desired, `Organization` is the safe default.)
- **`logo`** points at the square icon — Google's logo guidelines for
  structured data want a square mark, not a wordmark.
- **`sameAs`** — the strongest signal for entity consolidation; each URL must
  be a profile the org actually controls. An empty array is emitted harmlessly
  until `social` is populated.
- **`jsonify`** — serializes the Go dict to valid JSON and HTML-escapes `<`,
  `>`, `&` (prevents a `</script>` breakout from any future user-supplied
  string). `safeJS` stops Hugo's template escaper from double-escaping the
  JSON's quotation marks inside the script context.

---

### Step 6 — Wire everything into the page + config

**`layouts/_default/baseof.html`** — insert directly after the
`<meta name="description">` line:

```html
  {{ partial "head/favicon.html" . }}
  {{ partial "head/seo.html" . }}
  {{ partial "head/json-ld.html" . }}
```

**`hugo.toml`** — extend `[params]`:

```toml
[params]
  description = "A people's collective to occupy public spaces and public imagination with anti-caste literature, iconographies, thought, and imagination."
  status = "under construction"
  twitter_handle = ""            # e.g. "@arc_community" — leave empty until provided
  og_image_alt = "Ambedkar Reading Circle wordmark on a cream background"
  social = [
    # Fill in when provided, e.g.:
    # "https://www.instagram.com/example",
    # "https://x.com/example",
  ]
```

Partials never hardcode these values, so updating links later is a config-only
change with zero template edits.

---

## 4. The OG image arithmetic (why 183 and 346)

Source wordmark: **508 x 264** (ratio ≈ 1.92:1 — nearly the 1.91:1 OG ideal).
Target: **1200 x 630** (ratio ≈ 1.905:1).

`images.Padding V H COLOR` follows CSS shorthand: **V** px top and bottom,
**H** px left and right; the color is always the LAST argument.

```
width:  508 + 346 + 346 = 1200   →  H = (1200 − 508) / 2 = 346
height: 264 + 183 + 183 =  630   →  V = ( 630 − 264) / 2 = 183
```

The wordmark lands mathematically centered on a cream canvas — no scaling, no
cropping, no distortion; the logo's own pixels are untouched.

The fallback route pads 346 on **all** sides → 1200x956, then
`Resize "1200x630 fill"` scales by max(1200/1200, 630/956) = 1.0 and
center-crops 163px off top and bottom — leaving 183px margins everywhere,
i.e. pixel-identical output. (Direct `Resize "1200x630 fill"` on the unpadded
logo was rejected: it would scale by 630/264 ≈ 2.39 and shave ~6px of scaled
logo off each side — risky for a wordmark that may run to its edges.)

---

## 5. Verification checklist

1. `hugo` — must exit 0. (Processed images publish with hash-suffixed names
   like `arc-icon_hu_...png` under `public/images/` — that is expected.)
2. Inspect `public/index.html` — confirm, in the `<head>`:
   - two `rel="icon"` links, one `apple-touch-icon`, one `manifest`,
     one `theme-color`;
   - `og:image` is an **absolute** `https://arc-community.in/...` URL and
     `og:image:width/height` read `1200`/`630`;
   - one `<script type="application/ld+json">` containing both `@id` nodes.
3. Confirm derived files exist: `public/images/` (16/32/180/192/512 outputs +
   1200x630 OG image) and `public/site.webmanifest`.
4. Open the OG image file and visually confirm: cream background, centered
   wordmark, nothing clipped. Dimensions must be exactly 1200x630 (if not,
   see the fallback in step 4).
5. `hugo server` → http://localhost:1313 — favicon appears in the tab, no
   console errors, manifest fetches (DevTools → Application → Manifest).
6. Paste the rendered JSON-LD (from the built HTML) into
   https://validator.schema.org — expect zero errors.
7. Post-deploy only: run the URL through https://www.opengraph.xyz and
   Meta's Sharing Debugger; note that **WhatsApp caches preview images
   aggressively** — re-share or prepend any query string to force a refresh.

---

## 6. Files changed — summary

| File | Change |
|---|---|
| `assets/images/arc-icon.png` | NEW — user-provided square mark (prerequisite) |
| `assets/images/arc-logo-blue.png` | MOVED from `static/images/` |
| `layouts/partials/site-header.html` | logo served via `resources.Get` |
| `layouts/partials/head/favicon.html` | NEW — icons + manifest + theme-color |
| `layouts/partials/head/seo.html` | NEW — Open Graph + Twitter Card |
| `layouts/partials/head/json-ld.html` | NEW — Organization + WebSite schema |
| `layouts/_default/baseof.html` | include the three partials in `<head>` |
| `hugo.toml` | add `twitter_handle`, `og_image_alt`, `social` params |

Commit as one atomic change after the checklist passes (owner confirms before
committing, per repo workflow).

---

## 7. Gotchas the implementer should know

- **Hashed filenames are a feature.** Hugo content-addresses derived images, so
  changing the source logo produces new URLs — which busts crawler caches on
  `og:image` automatically.
- **Hugo DOES upscale on explicit `Resize`.** The 259px `arc-favicon.png`
  produced a genuine (soft) 512x512 output in this repo's build. Manifest
  `sizes` stay honest either way, but replace the icon with a true >=512px
  source when available for crisp Android icons.
- **`disableKinds` includes `page`** — this site is homepage-only today, which
  is why the partials read `.Title`/`.Permalink` with site-level fallbacks and
  will keep working when real pages are enabled later.
- **Ordering in `<head>` doesn't matter** for these consumers; the three
  partials are independent of each other except that all three read the same
  two source images (Hugo caches pipeline results, so each derived size is
  computed once per build).
