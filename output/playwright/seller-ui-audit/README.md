# Seller UI visual audit

These are real-browser captures from the isolated `codex/seller-ui-overhaul` worktree. Desktop captures use a 1366×768 viewport; mobile captures use 390×844. The images show the current implementation after the visual corrections in this branch.

## Desktop

- `00-auth-seller-desktop-1366x768.png` — seller demo sign-in, complete in one viewport
- `01-seller-today-desktop-1366x768.png` — seller identity, one next action, and short queue
- `02-products-desktop-1366x768.png` — product operations table and designed image fallback
- `03-new-listing-step1-desktop-1366x768.png` — compact product basics with the next action visible
- `04-new-listing-step2-desktop-1366x768.png` — image and evidence step
- `05-new-listing-review-desktop-1366x768.png` — review state with a safe preview fallback
- `04-proofs-desktop-1366x768.png` — proof request lanes and status tabs
- `05-proof-dialog-desktop-1366x768.png` — proof upload dialog with isolated scrolling
- `06-market-compare-desktop-1366x768-light.png` — product, position, and best action in one decision row
- `07-market-compare-desktop-1366x768-dark.png` — dark-mode market comparison
- `08-measurement-dialog-desktop-1366x768.png` — measurement correction dialog
- `09-return-proof-dialog-desktop-1366x768.png` — return-derived proof request with fixed footer

## Mobile

- `10-proof-dialog-mobile-390x844.png` — full-height proof dialog; background remains locked
- `11-products-mobile-390x844.png` — card-based products and fully visible 2×2 filters
- `12-seller-today-mobile-390x844.png` — next action appears before the queue
- `13-new-listing-mobile-390x844.png` — all three listing steps remain readable
- `14-proofs-mobile-390x844.png` — visible proof lanes and primary action
- `15-market-compare-mobile-390x844-light.png` — best improvement is deliberately shown first
- `16-market-compare-mobile-390x844-dark.png` — the same decision flow in dark mode
- `17-auth-seller-mobile-390x844.png` — seller demo sign-in in a single mobile viewport

## Issues found through screenshots

1. Seller auth overflowed the desktop viewport and the password field collapsed. The route is now viewport-bound, both fields match, and only long forms scroll inside the card.
2. Active portal supporting text had insufficient contrast. It now inherits the selected surface contrast.
3. The listing step-one action was below the fold. Desktop fields now use a deliberate four-column layout, keeping `Continue to image` visible at 1366×768.
4. A failed listing image showed the browser's broken-image glyph. It now shows an intentional preview-unavailable state with recovery guidance.
5. The mobile product filter cut off `Healthy`. Filters now use a 2×2 grid.
6. The mobile listing stepper clipped later steps. All three steps now fit and wrap cleanly.
7. Market Compare hid its recommendation below descriptive content. Desktop uses a three-part decision row; mobile puts the best next improvement first.

The `before/` folder retains diagnostic and intermediate captures that led to these fixes. They are not current-state approval images.
