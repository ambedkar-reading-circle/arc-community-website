---
id: 010
title: Deploy to Cloudflare Pages
labels: [wayfinder:task]
status: open
assignee:
parent: 001
blocked_by: [007, 008, 009]
---

## Objective

Deploy the Hugo site to Cloudflare Pages.

## Prerequisites

- Hugo project builds successfully locally
- Homepage content ready
- Placeholder article ready

## Tasks

- [ ] Connect GitHub repo to Cloudflare Pages
- [ ] Configure build settings:
  - Build command: `hugo`
  - Output directory: `public`
- [ ] Deploy and verify live site
- [ ] Test all pages render correctly
- [ ] Verify mobile responsiveness on live URL

## Acceptance Criteria

- Site live at `ambedkar-reading-circle.github.io` (temporary)
- All pages accessible
- No build errors
- Ready for custom domain later

## Notes

Default GitHub Pages URL will be used initially. Custom domain configured post-launch.