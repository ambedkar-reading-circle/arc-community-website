---
id: 001
title: Wayfinder: Ambedkar Reading Circle Portal
labels: [wayfinder:map]
status: closed
assignee: 
children: [002, 003, 004, 005, 006]
dependencies:
  002: []  # SSG choice — CLOSED
  003: []  # Hosting — CLOSED
  004: []  # Theme — CLOSED
  005: []  # Content structure — CLOSED
  006: []  # Editor workflow — CLOSED
---

## Destination

A public platform for the Ambedkar Reading Circle (ARC) collectives across cities — Bangalore, Chennai, Hyderabad (BARC), Mumbai, Pune, and Delhi. The site hosts documentation on philosophies, articles, positions, organizing manuals, and connects social media channels for all ARC chapters.

## Background

ARC is a people's collective originally started in Bangalore with the objective to occupy public spaces and public imagination with anti-caste literature, iconographies, thought, and imagination in parks and public places. The reading circle eventually grew into hosting talks, lectures, panel discussions, film screenings, workshops and other activities in collaboration with various organizations, while also inspiring similar initiatives across Chennai, Hyderabad, Mumbai, Pune, and Delhi.

## Notes

- **Domain**: Common platform for all ARC city chapters
- **Content**: Documentation, articles, organizing manuals, philosophy, positions; social media links
- **Audience**: Public, organizers, activists
- **Editors**: Non-technical via Decap CMS (git-based visual editor)
- **Hosting**: Cloudflare Pages (free, native Hugo support)
- **Stack**: Hugo + Decap CMS + Cloudflare Pages
- **Skills to consult**: `source-driven-development` for Hugo/Decap docs, `frontend-ui-engineering` for theme customization

## Decisions so far

- [Confirm static site generator choice](.tracker/issues/002-confirm-ssg-choice.md) — Hugo + Decap CMS + Cloudflare Pages
- [Choose hosting platform](.tracker/issues/003-choose-hosting-platform.md) — Cloudflare Pages
- [Determine theme and design approach](.tracker/issues/004-theme-design-approach.md) — Custom minimal theme with brand tokens
- [Define content structure and navigation](.tracker/issues/005-content-structure-navigation.md) — 5-section site, blog-style essays
- [Determine editor workflow and CMS setup](.tracker/issues/006-editor-workflow-decision.md) — Git-only at launch, add Decap CMS post-launch

## Not yet specified

- What specific content will be ported or written initially?
- Any specific features needed beyond navigation? (search, tags/categories, reading time estimates, print-friendly styles)
- Is there existing content to migrate, or starting fresh?
- What custom domain will be used?

## Out of scope

<!-- Work ruled beyond the destination -->