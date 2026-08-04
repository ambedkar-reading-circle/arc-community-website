---
id: 007
title: Set up Hugo project with minimal custom theme
labels: [wayfinder:task]
status: open
assignee:
parent: 001
blocked_by: []
---

## Objective

Initialize Hugo project with a custom minimal theme, configured for Cloudflare Pages deployment.

## Tasks

- [ ] Create Hugo project structure (`hugo new site .`)
- [ ] Create minimal custom theme with:
  - Base layout templates (baseof.html, list.html, single.html)
  - CSS with brand tokens (colors, typography, spacing)
  - Minimal responsive design
- [ ] Configure `hugo.toml` with site metadata
- [ ] Add `.gitignore` for Hugo artifacts
- [ ] Test local build (`hugo server`)

## Acceptance Criteria

- Hugo builds successfully locally
- Theme renders without errors
- Base templates ready for content

## Notes

Keep theme minimal — no JavaScript frameworks, no build tools beyond Hugo. Pure CSS, semantic HTML.