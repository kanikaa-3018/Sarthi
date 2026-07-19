# Seller Operations UX Design

## Objective

Replace the seller experience with a calm, action-first operations workspace that tells a seller what to do next, why it matters, and what will happen after the action. The redesign must remove visual clutter, fix overflow and responsive failures, simplify proof upload and listing creation, and make Market Compare useful without changing seller privacy boundaries or inventing new backend facts.

The target seller is a marketplace operator managing products, proof requests, listing reviews, and trust performance. The interface must work for a first-time seller without becoming inefficient for a repeat user.

## Current Problems

- `SellerPanel.tsx` is a 3,841-line component that owns data fetching, routing, copy, derived scores, five workbench tabs, three top-level areas, listing forms, proof forms, and multiple sheets.
- Seller presentation rules are spread across `seller.css`, `responsive.css`, `admin-trust.css`, and several generations of overrides in `refined.css`. Later selectors routinely override earlier ones.
- The `/seller` header gives the store name, rating, rating count, privacy statement, verification state, refresh, and add-product action similar visual weight.
- The overview repeats the same facts through insights, quick actions, trust strips, proof impact, metrics, review loops, action boards, and rating coaching.
- Proof upload displays request context, a suggested draft, reuse information, a quality score, warning cards, four fields, and submission controls at once.
- New listing mixes listing entry, readiness scoring, document verification, document upload, and saved drafts in one dense two-column surface.
- Market comparison exposes many metrics but does not produce a clear business decision.
- Mobile behavior is built by collapsing desktop grids rather than by establishing a mobile reading order.

## Product Principles

1. **One decision per surface.** A page or dialog may show supporting evidence, but it must have one dominant action.
2. **Tasks before metrics.** Seller metrics explain priority; they do not compete with the work queue.
3. **Evidence, not AI theatre.** No AI avatars, sparkles, chat bubbles, generic automation copy, or unsupported recommendations. Recommendations cite the existing return, rating, proof, verification, and listing facts used to derive them.
4. **Restrained commerce UI.** No gradients, glassmorphism, decorative charts, emojis, oversized empty cards, or excessive status pills.
5. **Progressive disclosure.** Show the next required information, with secondary facts available through details or subsequent steps.
6. **Same hierarchy on every viewport.** Mobile is an ordered workflow, not a compressed desktop dashboard.
7. **Preserve trust boundaries.** Buyer personal fit memory remains unavailable to sellers. Only aggregate evidence already returned by seller endpoints appears.

## Information Architecture

The seller workspace has five canonical destinations under the existing `/seller/*` route boundary:

| Route | Purpose | Primary action |
| --- | --- | --- |
| `/seller` | Today's highest-impact work and short priority queue | Complete the first task |
| `/seller/products` | Inspect and correct live product health | Act on a selected product |
| `/seller/new` | Create, review, and submit a listing draft | Save or submit the listing |
| `/seller/proofs` | Answer buyer proof requests and track review state | Upload the selected proof |
| `/seller/market` | Compare one product with its marketplace cluster | Apply the recommended improvement |

Legacy seller URLs and tab query parameters continue to resolve to their matching canonical destination so bookmarked demo links do not break.

The application-level seller navigation uses four destinations—Today, Products, Proofs, and Market Compare—plus one visually distinct `New listing` action. Navigation labels do not include explanatory subtitles or counts unless a count requires immediate seller action.

## Seller Identity Header

The seller header establishes identity without behaving like another dashboard:

- `NayiDisha Fashions` is the only page-level heading.
- Verification state appears beside the name as short metadata.
- Rating and rating count appear in a single readable sentence such as `4.4 from 6,048 buyer ratings`.
- The privacy statement moves to an unobtrusive information line near evidence-related work, not the primary header.
- Refresh is not a floating icon-only control. Background refresh occurs on page entry; a labeled retry appears only after a loading failure.
- `New listing` is the only persistent primary action.

## Today Page

The Today page begins with a single `Next action` panel derived from existing data in this order:

1. Finish seller verification when verification blocks buyer visibility.
2. Replace a rejected proof.
3. Answer the highest-priority open buyer proof request.
4. Fix a product with a high-priority trust or return issue.
5. Submit a review-ready listing draft.
6. Create a listing when no live or draft product exists.
7. Show a caught-up state with links to Products and Market Compare.

The panel contains a direct title, one-sentence reason, the affected product or account state, and one action. Below it is a maximum five-row queue with priority, item, reason, and action. Rating, products, proof requests, and review status appear afterward as a compact four-item facts row. Repeated coaching, trust strips, and duplicate metric cards are removed.

Loading uses a skeleton matching the final action panel and queue. Empty state means the seller is caught up; it does not display generic motivational copy.

## Products Page

Desktop uses a semantic table with columns for Product, Status, Buyer concern, Evidence state, Market position, and Action. Rows remain at a readable density and do not contain nested card layouts.

Mobile turns each row into a stacked product record in this order: product identity, status, buyer concern, evidence state, and action. No horizontal page scrolling is permitted.

Search matches product title and product identifier. Filters cover `Needs action`, `In review`, and `Healthy`. Each product exposes one primary contextual action and a quieter `View details` disclosure. Raw internal scores are not shown when a seller-readable label and fact can communicate the state.

## New Listing Flow

Listing creation is a three-stage route-level flow rather than a dashboard card:

1. **Product basics:** title, category, garment type, fabric, color, and base price.
2. **Images and evidence:** one required current product image using the existing API contract, image preview, replacement control, and concise evidence guidance.
3. **Review and submit:** structured summary, inline readiness issues, seller verification impact, save-draft action, and submit action for eligible drafts.

The step indicator communicates position and completion but does not allow skipping required incomplete stages. Form data remains in React state while navigating between stages. Validation is field-specific and moves focus to the first invalid field. A seller can move backward without losing input.

Document verification is not embedded beside listing fields. When verification blocks publication, the review stage explains the block and links to the verification action. Existing draft records appear below the new-listing flow as a compact list, not as a competing side panel.

The current API accepts one `image_url`; this design does not pretend to support multi-image listings. Multi-image support requires a separate data-contract change.

## Proof Workspace and Upload Dialog

The Proofs page uses three explicit lanes:

- `Needs your action`: open and rejected proof requests.
- `With reviewer`: submitted assets awaiting review.
- `Buyer-visible`: approved proof.

The first lane is the default when work exists. Each request row shows the product, exact buyer concern, required proof type, demand count, and one `Upload proof` action. Review and approved lanes are history views and do not repeat upload controls.

The upload experience is an accessible modal dialog on desktop and a full-height sheet on mobile. Its content order is:

1. Exact buyer concern and affected product.
2. Accepted proof type and a short example of acceptable evidence.
3. File input with real preview or filename summary.
4. Proof title and short explanation.
5. Inline validation and expected reviewer outcome.
6. Cancel and Submit actions in a sticky footer.

Suggested values may prefill title and description, but no separate suggested-draft card is shown. The quality score, proof reuse card, and warning collection are replaced by direct validation beside the relevant input. Submission is disabled only for a visible, specific reason.

Opening a modal locks `html` and `body` background scrolling. The dialog owns scrolling, traps focus, closes with Escape, has an accessible title and description, and restores focus to its trigger. Clicking the backdrop may close only when no submission is in progress. Submission prevents duplicate requests and retains user input on API failure.

## Market Compare

Market Compare answers three seller questions: `Where does this product stand?`, `Why?`, and `What should I improve first?`

The page starts with a product selector. The selected product is compared only with the existing cluster data returned by the seller panel endpoint. The first section shows a plain-language position such as `Stronger evidence than 2 of 4 comparable listings` when the denominator is available; otherwise it uses a non-numeric label and never invents a percentile.

A comparison table covers only actionable dimensions supported by current data: price, rating evidence, kept/return behavior, size or measurement evidence, dispatch, and proof coverage. The selected product is visually anchored without turning every cell into a colored badge.

The recommendation panel names one improvement, the fact that triggered it, and the destination for fixing it. Secondary opportunities follow as a short ordered list. No radar chart, gauge, arbitrary composite score, or unsupported competitor claim is introduced.

## Visual System

Seller styles are scoped under `.seller-app` and consolidated in `frontend/src/styles/seller.css`. Seller-specific generations in `refined.css` are removed after equivalent intentional rules exist in the scoped stylesheet. Shared base tokens remain unchanged unless a genuine cross-role defect requires a separate change.

- Content width: `1200px` maximum.
- Spacing rhythm: `4, 8, 12, 16, 24, 32, 48px`.
- Page title: approximately `28/36px`; section title `20/28px`; body `15/24px`; metadata no smaller than `13/18px`.
- Borders: one-pixel neutral borders; corner radius generally `10–12px`.
- Shadows: dialogs and raised menus only.
- Accent: Meesho magenta for primary action, active navigation, links, and focus indication—not for large backgrounds.
- Status colors: semantic success, warning, and danger colors with text/icon labels; never color alone.
- Icons: functional actions only. No decorative icon containers.

All controls meet a minimum 44px touch target where practical. Visible focus rings use sufficient contrast in both themes. Text and interactive contrast meet WCAG AA.

## Responsive Behavior

The primary breakpoint is driven by content rather than device labels:

- Above roughly `960px`, pages use the desktop table and two-area compositions where they improve scanning.
- From `640–960px`, secondary areas stack and tables reduce nonessential columns.
- Below `640px`, navigation becomes compact, tables become records, modal dialogs become full-height sheets, and sticky footers respect safe-area insets.

Acceptance rules:

- `documentElement.scrollWidth - clientWidth <= 2px` at 360, 390, 768, 1024, and 1440px widths.
- No clipped headings, controls, values, or status text at 200% text zoom.
- Sticky actions never cover the last focusable field.
- Long product names and translated copy wrap without expanding the viewport.

## Data Loading and Error Handling

Seller onboarding, panel, and evidence-coach requests continue to load together at workspace entry. A failure in one supporting request does not erase successfully loaded seller identity or onboarding state.

- Initial load: page-shaped skeletons.
- Route-level empty state: explicit reason and useful destination.
- Recoverable fetch failure: inline error with labeled retry.
- Form validation: field-level message connected with `aria-describedby`.
- API submission failure: error summary plus retained form state.
- Submission in progress: disable only the affected form controls and announce state through an `aria-live` region.
- Successful submission: close the dialog only after the API confirms success, refresh affected data, focus the resulting status message, and avoid obstructive floating toasts.

## Component Boundaries

The monolith is decomposed without changing backend contracts:

- `SellerPanel.tsx`: compatibility export only.
- `seller/SellerWorkspace.tsx`: data orchestration, canonical route selection, refresh, and mutation callbacks.
- `seller/SellerShell.tsx`: identity header and seller-local navigation.
- `seller/SellerTodayPage.tsx`: next action, queue, and supporting facts.
- `seller/SellerProductsPage.tsx`: product search, filters, responsive records, and product actions.
- `seller/SellerListingFlow.tsx`: three-stage listing form and draft list.
- `seller/SellerProofsPage.tsx`: proof lanes and request rows.
- `seller/SellerProofDialog.tsx`: proof upload state, focus management, preview, validation, and submission.
- `seller/SellerMarketPage.tsx`: product selection, evidence comparison, and prioritized recommendation.
- `seller/sellerModel.ts`: pure derivation of action priority, proof lanes, product states, and market comparison rows.
- `seller/sellerCopy.ts`: seller copy by supported language.

Pure derivation functions receive API response types and return display models. They do not read browser state or make network calls. Route components consume those display models and emit typed callbacks.

## Testing Strategy

Implementation follows test-first behavior checks:

1. Add Playwright expectations for canonical routes, task-first hierarchy, listing stages, proof dialog accessibility, background scroll lock, and Market Compare structure.
2. Run the focused tests against the baseline to record the intended failures.
3. Implement the smallest route and component changes that satisfy each behavior group.
4. Add desktop and mobile overflow checks at 1440, 768, and 390px.
5. Preserve the existing seller-to-admin proof approval test and update selectors only where the visible language intentionally changes.
6. Run TypeScript build, backend tests, seller E2E flows, and visual smoke screenshots.

E2E runs must use a dedicated database name and non-conflicting API/frontend ports. They must not call `/seed/reset` against the user's active `sarthi` database or reuse Antigravity's running servers.

## Acceptance Criteria

- `/seller` exposes one clear next action before any metrics.
- The header reads as store identity, not a row of competing cards.
- Every seller destination has one page purpose and one dominant action.
- New listing is a recoverable three-stage workflow with inline validation and image preview.
- Proof upload shows only request context, required evidence, file preview, concise fields, validation, and submission outcome.
- Background content cannot scroll while any seller dialog is open.
- Products and proof requests remain usable without horizontal scrolling at 390px.
- Market Compare explains position, supporting facts, and one next improvement without invented data.
- Light and dark themes preserve readable text, boundaries, focus indicators, and semantic states.
- Seller CSS has one scoped source of truth; obsolete seller override generations are removed from `refined.css`.
- Existing seller API contracts, RBAC, reviewer approval, and buyer privacy boundaries continue to pass.
