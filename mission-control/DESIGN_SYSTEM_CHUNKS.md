# Mission Control Design System Pass (No Functionality Removal)

## Goals
- Improve scan/read speed.
- Reduce clutter and interaction ambiguity.
- Keep all existing functionality.

## Chunk Checklist
- [x] Chunk 0: Define chunk plan and acceptance checklist
- [x] Chunk 1: Settings IA cleanup (grouping/toggles, better scanning)
- [x] Chunk 2: Unify table + visual workflows (clear primary/secondary actions)
- [x] Chunk 3: Safety UX consistency (confirmations, feedback, undo patterns)
- [ ] Chunk 4: Token/semantic cleanup (status, hover, selected, contrast)
- [ ] Chunk 5: Checklist pass + bugfix polish

## Acceptance Checks
- [ ] No existing action removed
- [ ] Keyboard interactions preserved
- [ ] Topbar/button conventions remain consistent
- [ ] Settings are easier to scan and use
- [ ] Visual and table workflows are predictable
- [x] Confirmations consistent for destructive actions

## Known Bugs / Backlog
- [ ] Folder picker failed: `unknown route` after clicking `Add Folder…`
