# Wayfinder Local Tracker

This directory contains the local-markdown issue tracker for wayfinding efforts.

## Structure

```
.tracker/
├── issues/           # All issues (map and tickets)
├── labels.md         # Label definitions
└── README.md         # This file
```

## Issue Format

Each issue is a markdown file with YAML frontmatter:

```yaml
---
id: 001
title: Issue Title
labels: [wayfinder:map]
status: open
assignee: 
parent: 001           # For tickets, references the map
blocked_by: [002]     # Dependencies
---
```

## Wayfinding Operations

### View the map
Read `.tracker/issues/001-wayfinder-ambedkar-docs-portal.md`

### Find frontier tickets
Open issues with no blockers (`blocked_by: []` or absent) and no assignee.

### Claim a ticket
Set `assignee: <your-name>` in the issue frontmatter.

### Resolve a ticket
1. Add a resolution comment to the issue body
2. Set `status: closed`
3. Append a gist to the map's "Decisions so far" section

### Graduate fog
When a resolution makes new tickets specifiable:
1. Create new ticket files
2. Update the map's `children` and `dependencies`
3. Remove the graduated fog from "Not yet specified"

## Labels

- `wayfinder:map` — The canonical map issue
- `wayfinder:research` — Research ticket (AFK)
- `wayfinder:prototype` — Prototype ticket (HITL)
- `wayfinder:grilling` — Conversation ticket (HITL)
- `wayfinder:task` — Manual work ticket (HITL/AFK)