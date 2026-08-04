---
id: 006
title: Determine editor workflow and CMS setup
labels: [wayfinder:task]
status: closed
assignee: kilo
parent: 001
---

## Question

Should non-technical editors use git directly (GitHub's web editor), or should a CMS like Decap be set up from the start?

**Options**:
1. **Git-only**: Editors use GitHub's web markdown editor. Works for occasional edits. No setup required.
2. **Decap CMS**: Visual editor at `/admin`. Better UX for non-technical users. Requires initial setup.
3. **Hybrid**: Start with git, add Decap later if editing frequency increases.

**Context**:
- Non-technical editors
- Occasional edits (a few times per year)
- Solo fast launch

**Initial recommendation**: Git-only initially. Add Decap if/when regular editing pattern emerges.

Are the non-technical editors comfortable with basic markdown editing in GitHub's web UI, or do they need a WYSIWYG experience from day one?

## Resolution

**Decision:** Launch with git-only, add Decap CMS post-launch

**Workflow:**
1. Launch: Editors use GitHub's web markdown editor
2. Post-launch: Configure Decap CMS for visual editing

**Rationale:**
- Faster initial launch
- Editor needs CMS but can wait for setup
- Site live first, CMS configuration second
- Decap CMS integration straightforward (add `admin/` folder + config)

**CMS setup steps (post-launch):**
1. Create `static/admin/` directory
2. Add `index.html` and `config.yml`
3. Configure OAuth for authentication
4. Test visual editor at `/admin`