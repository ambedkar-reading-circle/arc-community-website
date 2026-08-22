# Design Tokens

## Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-primary` | `#131857` | Headers, links, accent |
| `--color-background` | `#ffe` | Page background |
| `--color-text` | `#1a1a1a` | Body text (default) |

## Typography

| Token | Value |
|-------|-------|
| `--font-heading` | `"Miriam Libre", sans-serif` |
| `--font-body` | `"Miriam Libre", sans-serif` |
| `--font-fallback` | `system-ui, -apple-system, sans-serif` |

## Font Loading

```css
@import url('https://fonts.googleapis.com/css2?family=Miriam+Libre:wght@400;700&display=swap');
```

## Spacing

Handled by Tailwind v4's dynamic spacing scale: every `p-*` / `m-*` / `gap-*`
utility is a multiple of `--spacing` (`0.25rem`) — `p-2` = 0.5rem, `p-4` = 1rem,
`p-8` = 2rem, `p-16` = 4rem.

## Layout

| Context | Utility | Value |
|---------|---------|-------|
| Content column | `max-w-3xl` | 48rem (768px) |
| Wide content column | `max-w-5xl` | 64rem (1024px) |

## Logo

Location: TBD (user to provide)

---

## Architecture

We are theme-less. `assets/css/main.css` is the **source** stylesheet: a Tailwind
CSS v4 input file whose design tokens live in `@theme` (see above). The Tailwind
CLI compiles it to `assets/css/tw.css` (generated, git-ignored) via
`npm run css:watch` (dev) / `npm run css:build` (prod), and Hugo's asset pipeline
(`resources.Get | minify | fingerprint`) serves the fingerprinted
`/css/tw.<hash>.css`. Layout and component styling are Tailwind utilities written
in the templates under `layouts/`. As the site grows, we can add more CSS partials
and utilities without adding a full theme.