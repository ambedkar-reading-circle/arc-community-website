---
id: 004
title: Determine theme and design approach
labels: [wayfinder:prototype]
status: closed
assignee: kilo
parent: 001
---

## Question

Should this documentation portal use an existing Hugo theme, customize one, or build a custom design?

**Options**:
1. **Use existing theme**: Fastest path. Hugo has documentation themes like Docsy, Gecko, etc.
2. **Customize a theme**: Modify colors/fonts to match any branding
3. **Custom design**: Full control, but significant effort

**Context**:
- Documentation portal (not a blog or marketing site)
- Public audience reading essays/readings
- Solo launch, speed matters

**Initial recommendation**: Start with a clean documentation theme, customize only if needed after launch.

What visual identity requirements exist? Is there a logo, color palette, or branding guide to match?

## Resolution

**Decision:** Build custom minimal theme

**Branding:**
- Colors: `#131857` (primary), `#ffe` (background)
- Typography: Miriam Libre
- Logo: Available (location TBD)

**Design tokens:** Documented in `docs/design.md`

**Rationale:**
- Full control over design tokens
- Exact brand match
- Minimal overhead for 1-2 page site
- No theme dependency or lock-in
- Blog-style content fits minimal approach