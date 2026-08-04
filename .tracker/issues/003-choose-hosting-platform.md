---
id: 003
title: Choose hosting platform
labels: [wayfinder:grilling]
status: closed
assignee: kilo
parent: 001
---

## Question

Should the site deploy to Cloudflare Pages or GitHub Pages?

**Comparison**:

| Factor | GitHub Pages | Cloudflare Pages |
|--------|--------------|------------------|
| Cost | Free | Free |
| Custom domain | Supported | Supported |
| CDN | Limited regions | Global edge network |
| Analytics | None built-in | Built-in Web Analytics |
| Deploy previews | Via PRs | Automatic branch previews |
| Build minutes | 2000 min/month | 500 builds/month |
| Hugo support | Via Actions | Native (builds automatically) |

**Initial recommendation**: Cloudflare Pages — superior global performance, built-in analytics, simpler Hugo integration.

Which matters more: GitHub ecosystem integration or performance/analytics?

## Resolution

**Decision:** Cloudflare Pages

**Rationale:**
- Decided as part of ticket 002 stack decision (Hugo + Decap CMS + Cloudflare Pages)
- Native Hugo support (no Actions configuration needed)
- Global CDN for better performance in India (target audience)
- Built-in Web Analytics at no cost
- Free tier sufficient for documentation site