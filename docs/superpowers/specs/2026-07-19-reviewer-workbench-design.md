# Reviewer Workbench Design

## Objective

Make the reviewer demo understandable at a glance without changing authentication, routes, queue data, API calls, approval rules, notes, audit history, AI triage, policy, or impact features.

## Product decision

The reviewer workspace is an operations tool, not a dashboard showcase. The primary flow is:

1. Choose a queue item.
2. Inspect the decision summary and supporting evidence.
3. Add or accept an audit note.
4. Approve, reject, publish, or request revision.
5. Move to the next item.

The existing page obscures that flow with a duplicated recommendation strip, three instructional layers, repeated badges, and responsive tables that hide the action column. The redesign keeps the data and handlers but reduces simultaneous visual hierarchy.

## Information architecture

### Review desk

- Keep Sellers, Uploads, Drafts, and Audit as the review-desk subnavigation.
- Remove the separate recommendation strip from command mode. The automatically selected seller remains the recommended seller and is labelled in the queue.
- Keep a two-pane desktop workbench: seller queue on the left, selected seller and decision work on the right.
- Keep the selected seller summary compact.
- Present pending items as a compact queue immediately above the selected decision.
- Present one compact recommendation summary, followed by the real review card.
- Preserve reviewer guidance inside a collapsed disclosure instead of displaying three large instruction columns at all times.

### Upload review

- Keep the existing desktop table and all filters.
- Add a semantic mobile card representation containing seller, upload, status, checks, submitted time, and Review action.
- Reuse the existing selected-upload panel and handlers.
- Add a visible return-to-queue control without changing selection semantics.

### Global reviewer shell

- Keep all four primary reviewer destinations.
- At narrow widths, arrange navigation as a complete grid so no label is clipped.
- Keep language, theme, reset, account, and logout functionality.

## Visual language

- Neutral canvas and white work surfaces.
- Magenta only for selected state and primary emphasis.
- Green, amber, and red only for semantic outcomes.
- Eight-to-twelve-pixel radii, subtle borders, and almost no shadow.
- No gradients, glass effects, floating AI decoration, generic statistic-card rows, or ornamental animation.
- Reduce badge repetition and use plain text wherever a status shape adds no meaning.

## Responsive behavior

- Desktop: stable queue/detail workbench with the first decision action reachable in the initial 1440x1000 viewport.
- Tablet: panels stack without sticky sidebars or fixed widths.
- Mobile: complete four-item primary navigation, two-by-two review tabs, card-based upload queue, full-width controls, no root horizontal overflow.

## Preservation constraints

- No API or backend changes.
- No changes to authentication, roles, routes, seeded data, or review action eligibility.
- No removal of AI triage, policy, impact, draft, audit, history, validation, note, or evidence features.
- Existing approval and rejection callbacks are reused unchanged.
- Reviewer CSS is isolated in a new last-loaded stylesheet to avoid buyer and seller regressions.

## Verification

- Extend Playwright coverage for desktop decision visibility, complete mobile navigation, mobile upload metadata, selection, and root overflow.
- Run the existing admin route and seller-to-reviewer approval tests.
- Run the production frontend build and API tests.
- Capture desktop and mobile screenshots for visual review.
