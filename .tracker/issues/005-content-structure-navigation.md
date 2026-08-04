---
id: 005
title: Define content structure and navigation
labels: [wayfinder:grilling]
status: closed
assignee: kilo
parent: 001
---

## Question

How should the documentation be organized? What navigation structure and page hierarchy will serve readers best?

**Considerations**:
- Single-level navigation (all essays at top level) vs hierarchical (categorized readings)
- Need for sections like: About, Readings, Resources, Contact?
- Should readings be chronological, thematic, or both?
- Any landing page content beyond navigation links?

**Context**:
- Platform for ARC city collectives (Bangalore, Chennai, Hyderabad, Mumbai, Pune, Delhi)
- Content includes: philosophies, articles, positions, organizing manuals
- Social media links for each chapter
- Public audience seeking educational and organizing resources

What are the primary content categories? Is there an existing structure to preserve or can this be defined fresh?

## Resolution

**Decision:** 5-section site with blog-style essays

**Site structure:**
```
/
├── Home (intro + link to featured essay)
├── Essays/ (chronological list)
├── About/ (static page)
├── Resources/ (placeholder)
└── Contact/ (static page)
```

**Navigation:** Top-level nav with 5 sections

**Launch content:**
- 1 essay with placeholder lorem ipsum
- Structure supports multiple essays (organized by date)

**Homepage:** Intro/mission text + link to featured essay (separate page)