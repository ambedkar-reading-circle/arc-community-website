---
id: 002
title: Confirm static site generator choice
labels: [wayfinder:grilling]
status: closed
assignee: kilo
parent: 001
---

## Question

Should this documentation portal use Hugo, or would another static site generator (Astro, Jekyll, plain HTML) better fit the needs?

**Context**:
- Documentation portal for static essays/readings
- Non-technical editors need occasional edit capability
- Solo launch, fast timeline
- Free hosting on Cloudflare Pages or GitHub Pages

**Initial recommendation**: Hugo — mature, documentation-focused, large theme ecosystem, works on both platforms.

What factors matter most: build speed, theme availability, learning curve, or editor integration?

## Resolution

**Decision:** Hugo + Decap CMS + Cloudflare Pages

**Rationale:**
- Content volume: 1-2 pages at launch — build speed irrelevant
- Editor workflow: Non-technical editors via Decap CMS (git-based, visual editing)
- Hosting: Cloudflare Pages (free, native Hugo support, global CDN)
- Simplicity: Git-based CMS simpler than headless (Sanity) for small static site

**Stack confirmed:** Hugo with Decap CMS for content management, deployed to Cloudflare Pages.