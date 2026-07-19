# Sarthi Buyer Trust Experience Design

## Product position

Sarthi is not an AI assistant, a seller analytics dashboard, or an architecture demo. It is the layer between a confusing marketplace listing and a purchase the buyer feels safe keeping.

The landing page is written for first-time buyers. Its primary promise is the repository's real promise: **Buy the product you will actually keep.** Seller and reviewer access remain available, but never compete with the buyer journey in the first viewport.

## Visual direction

- Editorial commerce rather than a grid of generic feature cards.
- Real seeded catalog photography is part of the product story, not decoration.
- Warm off-white canvas, ink typography, restrained berry accent, and proof green reserved for verified states.
- Large readable type, generous but controlled rhythm, square-edged commerce surfaces, and minimal icon use.
- Light and dark themes retain the same hierarchy and meet readable contrast.

## Landing narrative

1. Hero: the buyer problem, a single primary action, and a real product/proof composition.
2. Problem: similar listings can look interchangeable while evidence differs.
3. Journey: compare choices, check proof, ask from verified facts, then buy.
4. Proof workspace preview: show how evidence is explained in plain language and where facts came from.
5. Feature stories: fit memory, offer check, verified answers, and post-delivery learning shown through outcomes rather than internal system names.
6. Seller bridge and final buyer CTA.

## Content rules

- No unsupported statistics, fabricated confidence scores, or warehouse claims.
- No "agentic", "oracle", "OS", architecture, database, or model language in buyer-facing copy.
- No emoji, decorative AI sparkles, or generic AI iconography.
- Claims must map to implemented product behavior in the README and current routes.

## Interaction and responsive rules

- `/` is public; `Shop with proof` leads to login and then the buyer shop.
- Header is compact and usable from 360px upward; secondary links collapse before they crowd.
- Product imagery preserves aspect ratio and never causes horizontal overflow.
- Every interactive control has a visible focus state and at least a 44px mobile hit target.
- Modal and sheet work will use fixed backdrops, body scroll lock, bounded height, and internal scrolling.

## Acceptance checks

- Desktop and 390px screenshots visibly tell a coherent buyer story.
- At least three real product images are visible across the landing page.
- The primary promise and verified-facts USP are visible without navigating the authenticated app.
- Forbidden internal/fabricated language is absent.
- No horizontal overflow at desktop or mobile widths.
- Frontend TypeScript build and focused Playwright checks pass.
