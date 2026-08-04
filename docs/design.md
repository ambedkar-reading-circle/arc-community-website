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

| Token | Value |
|-------|-------|
| `--space-xs` | `0.25rem` |
| `--space-sm` | `0.5rem` |
| `--space-md` | `1rem` |
| `--space-lg` | `2rem` |
| `--space-xl` | `4rem` |

## Layout

| Token | Value |
|-------|-------|
| `--content-width` | `720px` |
| `--content-width-wide` | `960px` |

## Logo

Location: TBD (user to provide)

---

## Theme Recommendation

**Approach:** Start with minimal Hugo blog theme, customize with these tokens.

**Candidate themes:**
- [Hugo PaperMod](https://github.com/adityatelange/hugo-PaperMod) — minimal, fast, easy to customize
- [Hugo Starter](https://github.com/bep/hugo-starter) — blank slate, full control
- [Hugo Bear](https://github.com/jmooring/hugo-bear-blog) — ultra-minimal, ~100 lines CSS

**Recommendation:** PaperMod for blog-style content, or custom minimal theme for brand match.