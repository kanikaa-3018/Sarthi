# Sarthi Buyer Commerce Overhaul Design

## Scope and success definition

This design completes the remaining buyer-facing requirements in `issue-1.md` without changing the API contracts, trust calculations, order behavior, proof workflow, or role boundaries. It covers `/shop`, `/shop/saved/:productId`, `/shop/checkout/:productId/:variantId`, `/shop/orders`, `/shop/proofs`, `/trust`, evidence exploration, and buyer overlays.

Success means a buyer can understand what to do next in every first viewport, browse without an endless catalog, inspect proof without losing their place, and complete a purchase without decoding technical scores. Desktop, 390px mobile, light, and dark modes must preserve the same hierarchy.

## Chosen approach

Use one shared buyer commerce system instead of giving every route an unrelated redesign. The system has five levels:

1. **Page purpose**: one title and one sentence explaining the buyer's job.
2. **Primary action**: one visually dominant action per state.
3. **Decision summary**: plain-language recommendation, uncertainty, and next step.
4. **Supporting evidence**: compact facts, expandable only when useful.
5. **Technical detail**: graph paths, fact IDs, and reviewer records remain available but never lead the page.

This is preferred over a CSS-only reskin because current problems are caused by information order and interaction behavior. It is preferred over a full component rewrite because the underlying API flows are working and must not be put at risk.

## Shared buyer shell

- Desktop keeps the current compact header and role separation.
- On mobile, the brand/account row stays at the top while the five buyer destinations become a fixed bottom navigation. This returns roughly one full content row to every first viewport.
- Page content reserves safe space for the bottom navigation and never sits beneath it.
- Primary buttons use the existing Meesho berry accent; proof success uses green; amber is reserved for incomplete or risky evidence.
- All text uses the existing Noto Sans family with a minimum readable size and consistent line height.

## Catalog `/shop`

- Search, delivery context, category filters, and popular searches collapse into a compact discovery toolbar.
- The catalog shows eight products per desktop page and six per mobile page. Search or category changes reset to page one.
- Pagination reports the visible range, provides Previous/Next, and exposes numbered pages with an accessible current-page state.
- Product cards use a consistent image ratio, two-line title limit, visible seller/price/delivery, one proof state, and one primary item action.
- Product image controls are conditional: if future API data supplies multiple image URLs, cards and product detail support previous/next controls and a count. Single-image products show no fake carousel.
- Clicking a Safety action immediately opens a blocking progress surface with a spinner, staged plain-language status, and `aria-live`. The comparison/proof sheet opens only after the check resolves.

## Product and saved decision workspace

- The verified-facts question module remains before checkout.
- Saved-product pages follow three labelled stages: selected item, Sarthi's recommendation, then proof/questions. Repeated scores and duplicated status statements are removed from the leading hierarchy.
- The recommendation states the winning seller, why it is stronger, remaining uncertainty, and one next action.
- The evidence map defaults to a plain-language route. Technical topology stays behind an explicit view switch.
- If graph data or a graph answer is unavailable, the buyer sees an honest fallback explaining what is still known and can retry without losing the product comparison.
- Saved-check toasts and floating proof buttons do not cover product pages. Proof remains reachable through the page and global Proof destination.

## Checkout

- Checkout remains a familiar two-column flow: review item and protection, choose payment, confirm delivery, then order summary.
- The order summary stays visible on desktop and becomes an in-flow final confirmation on mobile.
- Trust score numbers do not lead the payment recommendation. Copy first explains why a payment method is recommended; compact evidence facts support it.
- Loading uses stable skeleton rows so the layout does not jump.
- The final action states the payment method and total. Error states keep the entered/selected state intact.

## Orders

- Orders begin with clear filters: All, Needs feedback, Kept, and Returned.
- Desktop uses a two-column card grid; mobile uses one column.
- Each card groups image, date/status, product, seller/variant/price, and one relevant action without empty horizontal space.
- Feedback due is visually prioritized; completed orders remain quiet.
- Outcome and return functionality remains unchanged.

## Proof center `/shop/proofs`

- Three summary values become a compact responsive strip, not three large dashboard tiles.
- Requests are grouped by actionable state: Needs action, Ready to use, and History.
- Every proof card leads with status, product, the buyer question, and the next safe step. Trust-score change is supporting detail.
- Technical quality checks and timeline stay collapsed by default.
- View item and See proof remain available, with one primary action based on state.

## Trust Center `/trust`

- The page becomes three comprehensible control groups: Fit and privacy, Payment guidance, and Learning from outcomes.
- A compact overview explains which settings are active and what data is used.
- Controls explicitly state consequence and privacy boundary.
- Full proof/source detail remains available after the plain checklist, not beside it as a competing column.

## Dialog and loading standards

- Compare and proof surfaces use `role="dialog"`, `aria-modal`, labelled headings, focus return, Escape dismissal, a fixed backdrop, and bounded internal scrolling.
- `html` and `body` remain locked while any buyer overlay is open.
- Desktop dialog width is consistent at 720px for proof and 960px for comparison, with a maximum height of 86vh.
- Mobile dialogs use the viewport minus 16px and leave visible breathing room around the sheet.
- A loading action always changes its label, disables repeat activation, exposes status to assistive technology, and does not wait silently.

## Verification

- Focused Playwright tests cover catalog pagination, immediate Safety loading, saved-workspace hierarchy, graph fallback, compact orders/proofs, Trust Center sections, checkout hierarchy, dialog scroll lock, Escape, and mobile overflow.
- Audit screenshots are captured for every remaining buyer route at 1366x768 and 390x844, including light and dark coverage.
- The frontend production build, existing buyer/auth/role tests, and `git diff --check` must pass.

## Non-goals

- Do not invent new product evidence or marketing statistics.
- Do not synthesize extra product images from other listings.
- Do not modify trust scores, proof approval policy, pricing, checkout contracts, or order outcomes.
- Do not remove technical evidence; move it behind progressive disclosure.
