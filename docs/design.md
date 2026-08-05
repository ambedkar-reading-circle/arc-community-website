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

## Architecture

We are theme-less: styling lives in `layouts/_default/baseof.html` and `assets/css/main.css`, loaded via Hugo's asset pipeline (`resources.Get | minify | fingerprint`). Tokens are defined in CSS `:root` (see above). As the site grows, we can add more CSS partials and components without adding a full theme.