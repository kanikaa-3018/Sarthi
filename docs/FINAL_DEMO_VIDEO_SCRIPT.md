# Sarthi Final Demo Recording Path

This is the full recording guide for a natural product demo. It is written as a screen-by-screen walkthrough, so you know exactly what to click and what to say.

Recommended recording length: 7 to 9 minutes for the full product. If the submission portal strictly needs 5 minutes, record this full version once, then trim pauses and skip the optional lines marked `Skip if short`.

## Demo Accounts

| Role | Username | Password |
| --- | --- | --- |
| Buyer | `asha.buyer` | `buyer-asha-pass` |
| Seller | `seller.a` | `seller-a-pass` |
| Admin reviewer | `reviewer.admin` | `admin-reviewer-pass` |

## Before Recording

1. Open the deployed app or local app in a clean browser window.
2. Keep terminals, env files, logs, and API keys hidden.
3. Use normal speed. Pause 2 seconds on every important screen before speaking about it.
4. Record in this order: Landing -> Buyer -> Seller -> Admin -> Closing.
5. Do not say "AI approves", "guaranteed no returns", or "fully automated marketplace". Say "AI prescreens", "human reviewer decides", and "evidence-backed recommendation".

## Core Story

Say this early:

> Sarthi is built for one marketplace problem: buyers do not just want to place an order, they want confidence that they will keep it. So we connect product proof, seller behavior, reviewer decisions, and post-delivery outcomes into one trust loop.

## Full Recording Script

### 0:00 - 0:25: Landing Page

Do:

1. Open `/`.
2. Keep the first hero screen visible.
3. Move the cursor slowly over the product visual and the proof message.
4. Click `Shop with proof`.

Say:

> Most shopping apps help users find cheap products quickly. But when many listings look the same, the hard question is: which product will I actually keep?
>
> Sarthi adds an evidence layer to that decision. It checks seller history, product proof, fit signals, pricing, and past outcomes before the buyer pays.

### 0:25 - 0:45: Login As Buyer

Do:

1. On `/login`, select the buyer demo account.
2. Click `Use demo`.
3. Click `Continue`.

Say:

> I will start as a buyer, because this is where the trust problem is most visible.

### 0:45 - 1:25: Buyer `Shop` Nav

Do:

1. Stay on `/shop`.
2. Point to the buyer top nav: `Shop`, `Trust`, `Saved`, `Orders`, `Proof`.
3. Use the search bar or one quick search, for example `cotton kurti`.
4. Point to category filters, product cards, trust badge, product image, price, delivery, and `Safety`.
5. Click `Safety` on one product, or click `View item`.

Say:

> The buyer still starts with a normal shopping feed. Search, categories, product images, price, and delivery are all familiar.
>
> The difference is that Sarthi adds one clear proof action. Instead of asking the buyer to read everything manually, it checks similar sellers, return signals, proof gaps, and whether this product has enough evidence to recommend.
>
> This is important for a marketplace like Meesho because trust should appear inside the buying flow, not in a separate report that nobody opens.

### 1:25 - 2:15: Product Detail And Verified Question

Do:

1. On the product detail screen, pause on the main image and right-side decision panel.
2. Point to the `before you decide` trust score.
3. Point to size selector and recommended size.
4. In `Ask from verified facts`, use a suggested question or type:
   `Will size L be comfortable for daily use?`
5. Click the send button.
6. Wait for the answer.
7. Point to the answer title, reasons, caution, and `Observe -> Reason -> Act -> Learn` trace.

Say:

> Here, Sarthi is not just showing a star rating. It is checking this exact SKU and variant.
>
> I can ask a normal buyer question, like whether size L will be comfortable. Sarthi answers from verified facts: seller record, return outcomes, SKU data, fit memory, and proof status.
>
> If the answer is strong, it gives a next step. If proof is weak, it says that clearly. This reduces guesswork without pretending the AI knows everything.

### 2:15 - 2:45: SKU Proof Popup And Source Trace

Do:

1. In the answer card, click the primary action if it opens the SKU proof popup. If not visible, click `See proof`.
2. Keep the SKU proof popup open.
3. Point to `SKU`, `Trust`, `Evidence`.
4. Point to the mini flow: question, seller/outcome facts, buyer check.
5. Click `Open source trace` only if you want to show the trace screen briefly.
6. Close the popup.

Say:

> This is the proof moment. The buyer sees why the advice was given.
>
> Sarthi shows the selected SKU, the trust score after the proof check, and how many facts grounded the answer. The source trace is there so the recommendation does not feel like a black box.

### 2:45 - 3:45: Saved Product, Regret Firewall, And Knowledge Graph

Do:

1. Go back to `/shop` if needed.
2. Click the heart/save icon on a product, or click `Safety`.
3. Open the saved check. You can use the `Saved` nav or the `Open saved check` button.
4. On the saved workspace, point to the 3-step strip: `Saved item`, `Evidence checked`, `Choose safely`.
5. Point to the recommended seller and the short checks.
6. Click `Show details`.
7. Open the `Evidence graph` details section.
8. Click `Full graph`.
9. Click one node, for example seller, proof, returns, reviews, offer, or score.
10. Point to the `Connected to` list and the `Fact used` reference.
11. In graph chat, click a suggestion or type:
    `Why is this seller safer than the other similar listings?`
12. Submit the graph question.
13. Point to highlighted nodes/edges and the answer card.

Say:

> Saving or checking a product triggers Sarthi's regret firewall. It compares similar listings and asks: if this buyer orders now, what might cause regret?
>
> This page turns that into a simple decision. It shows the recommended seller, the key checks, and then the evidence graph behind the decision.
>
> The graph is not just decoration. These are connected facts: the product, selected SKU, seller, return outcomes, reviews, offer truth, proof assets, and the final score.
>
> I can also chat with this graph. When I ask why this seller is safer, Sarthi answers only from the connected nodes and highlights the parts it used. Private buyer fit memory stays buyer-only.

Skip if short:

> The graph is useful for judges because it proves the AI is grounded. It is not a generic chatbot pasted into commerce. It is answering from marketplace records.

### 3:45 - 4:20: Buyer `Proof` Nav

Do:

1. Click the buyer top nav `Proof`.
2. Point to the summary: open checks, approved proof, possible trust lift.
3. Use the filters: `Needs action`, `Ready to use`, `All`.
4. Open a proof item if seller proof exists.
5. Click `Review proof`.
6. In the popup, point to proof media or file reference, reviewer status, proof quality, submitted date, trust score change.
7. Point to `Reconsider item` and `Open proof trail`.
8. Close the popup.

Say:

> The Proof tab is the buyer's proof tracker. If a buyer asked for fabric proof, packaging proof, measurements, or another claim, it does not disappear.
>
> The buyer can see whether the seller is still waiting, whether the proof is with admin review, or whether it is approved and ready to use.
>
> When proof is approved, the buyer can preview it and reconsider the product with new evidence. This closes the loop between buyer doubt, seller proof, and reviewer approval.

### 4:20 - 4:50: Buyer `Saved` Nav

Do:

1. Click `Saved`.
2. Point to saved product cards.
3. Point to score, recommendation, `View item`, and `Proof` or `Check trust`.
4. Open one saved item if you need to return to the graph.

Say:

> Saved is not just a wishlist. It is a decision workspace.
>
> If Sarthi finds a better seller for a similar item, it can show that before checkout. This helps buyers compare real choices instead of choosing only by price or photo.

### 4:50 - 5:25: Buyer `Trust` Nav

Do:

1. Click `Trust`.
2. Point to `Fit memory private`, orders learnt, and payment guidance.
3. Point to `Fit help` toggle.
4. Open `See everything` under the proof/privacy checklist if available.
5. Point to `Used for advice` and `Never shown to sellers`.
6. Scroll to order memory/correction if visible.

Say:

> The Trust page is the buyer's control center. Sarthi can learn from kept and returned orders, but the buyer controls that memory.
>
> This screen makes the privacy boundary explicit. Sarthi can use size and order outcomes to improve advice, but sellers never see private buyer fit memory.
>
> If a return reason was wrong, the buyer can correct it, so future recommendations improve without polluting the data.

### 5:25 - 6:20: Checkout And Payment Guidance

Do:

1. Go back to a product detail screen.
2. Click `Open checkout`.
3. On checkout, point to the progress strip: review item, choose payment, place order.
4. Point to the item card and protection line.
5. Point to Sarthi's payment recommendation.
6. Toggle between `Pay Online` and `Cash on Delivery`.
7. Point to offers checked and trust details.
8. Select who the order is for: self, mother, sister, or friend.
9. Point to order summary.
10. Click `Place order`.

Say:

> Checkout is where Sarthi makes the trust decision actionable.
>
> It checks the product, price proof, fit score, and expectation contract before payment. If evidence is strong, online payment can be recommended with clear reasons and benefits. If evidence is weak, COD remains the safer choice.
>
> This screen also asks who the order is for. That matters because Sarthi should not update my personal size memory when I am buying for someone else.
>
> Before placing the order, Sarthi locks the expectation contract: what was promised about size, proof, price, offer, and delivery context.

### 6:20 - 7:20: After Checkout, Orders, Kept/Returned Flow

Do:

1. On the order success screen, click `View My orders`.
2. On `Orders`, point to metrics: need answer, on the way, learnt, contracts.
3. Use filters: `All`, `Needs action`, `On the way`, `Closed`.
4. If the new order is on the way, click `Mark delivered`.
5. Click `Close contract`.
6. In the dialog, first show both options: `Kept it` and `Returned it`.
7. For kept demo: click `Kept it`, then `Save kept outcome`.
8. For return demo instead: click `Returned it`, select a general reason like `Damaged or defective`, `Wrong item received`, or `Delivery issue`, then click `Check before return`.
9. In the return assistant, point to severity, preference, recommendation, reasons, and caution.
10. Finish with `Continue return` or the recommended exchange/fix action.
11. Point to confirmation facts: outcome ID, fit memory, expectation contract, evidence map.

Say:

> After checkout, Sarthi does not stop. The order becomes part of the trust loop.
>
> Once the product is delivered, the buyer gives one simple answer: did they keep it or return it?
>
> If the buyer kept it, the pre-order promise is marked fulfilled and this can strengthen future SKU trust. If the buyer returned it, Sarthi captures the reason in a general way, like wrong item, damage, delivery issue, color mismatch, or quality issue.
>
> The return assistant checks whether an exchange, refund, or simple fix is better before the buyer exits. The seller only gets aggregate issue signals, not private buyer memory.

### 7:20 - 7:35: Switch To Seller

Do:

1. Logout.
2. Login as `seller.a`.
3. Land on `/seller`.

Say:

> Now I will switch to the seller side. Sarthi is not only helping buyers reject weak listings. It also gives honest sellers a clear path to improve trust.

### 7:35 - 8:10: Seller Console And Today

Do:

1. Point to seller identity, rating, verification status, and `New listing`.
2. In the seller local nav, point to `Today`, `Products`, `Proof requests`, and `Market`.
3. On `Today`, point to `Next action`.
4. Point to `Your short work queue`.
5. Point to seller facts: rating, live products, open proofs, review items.

Say:

> The seller console starts with the next useful action, not a decorative dashboard.
>
> If there is a proof gap, a draft waiting, a measurement correction, or verification issue, Sarthi pushes that to the top. The seller sees what to do and why it matters.

### 8:10 - 8:45: Seller Products And Measurement/Proof Actions

Do:

1. Click `Products`.
2. Point to the table columns: product, status, buyer concern, evidence, position, action.
3. Use filters: all, needs attention, in review, healthy.
4. Click an action button if it opens a measurement or proof dialog.
5. If a measurement dialog opens, show that the seller can correct measurements and send for review.
6. Close the dialog.

Say:

> Products shows every listing as an operational row. The seller can see which buyer concern is hurting trust and what evidence is missing.
>
> If a measurement is wrong, the seller can correct it. If proof is missing, they can submit exactly the proof the buyer and reviewer need.

### 8:45 - 9:25: Seller Proof Center

Do:

1. Click seller `Proof center` or local `Proof requests`.
2. Show the tabs: `Needs action`, `With reviewer`, `Buyer visible`.
3. Click `Upload proof` on an open proof task.
4. In the dialog, point to required proof, buyer demand, file upload, proof title, description, and `Submit for review`.
5. Close the dialog unless you want to submit during the recording.

Say:

> Proof requests are created from buyer concerns, return patterns, and reviewer feedback.
>
> The seller is not uploading random images. They are answering a specific evidence gap, like packaging proof, measurement chart, daylight color, fabric closeup, or replacement proof after reviewer rejection.
>
> Submitted proof goes to admin review first. Only approved proof becomes buyer-visible.

### 9:25 - 9:55: Seller New Listing

Do:

1. Click `New listing`.
2. Show the 3-step listing flow: product basics, image and evidence, review.
3. Point to verification status.
4. Show saved drafts and `Send for review`.
5. Do not create a new draft unless demo data reset is ready.

Say:

> New listings also follow a controlled flow. The seller adds product facts, image evidence, and then sends a draft to review.
>
> If seller verification is incomplete, buyer visibility is blocked. This protects the marketplace from unreviewed catalog claims.

### 9:55 - 10:25: Seller Market Compare

Do:

1. Click `Market compare`.
2. Point to `Best next improvement`.
3. Point to the selected product.
4. Point to `Evidence comparison`.
5. Use the product dropdown if helpful.

Say:

> Market Compare shows why this seller is weaker or stronger than similar listings.
>
> The key is that we show one best next improvement first. That keeps the seller focused on the work that can actually raise buyer trust.

### 10:25 - 10:40: Switch To Admin Reviewer

Do:

1. Logout.
2. Login as `reviewer.admin`.
3. Land on `/admin`.

Say:

> Finally, this is the admin reviewer flow. This is where Sarthi reduces manual effort at marketplace scale.

### 10:40 - 11:25: Admin `Review Desk`

Do:

1. Point to the admin top nav: `Review Desk`, `AI Triage`, `Risk & Policy`, `Work Saved`.
2. Stay on `Review Desk`.
3. Point to the internal tabs: `Sellers`, `Uploads`, `Drafts`, `Audit`.
4. In `Sellers`, point to lanes like documents, products, proofs, and needs decision.
5. Select a seller.
6. Point to the seller summary: open items, document blockers, drafts, proofs, risk.
7. Point to the packet groups: seller identity, documents, product drafts, proof uploads.

Say:

> The reviewer should not have to jump across multiple queues for the same seller.
>
> Sarthi groups each seller into one review packet. A seller can have multiple documents, product drafts, and proof uploads, and the reviewer sees the next blocker in one place.
>
> This makes the workflow clear: choose a seller, open the item waiting for decision, review the brief, then approve, reject, request revision, or escalate.

### 11:25 - 12:10: Admin Human Decision On Seller Packet

Do:

1. Open one packet item.
2. Point to `Decision brief`.
3. Point to AI/provider pill, checks, risk route, suggested action, and reasons.
4. Point to the foldout with product or document facts.
5. Click `Use suggested note` if visible.
6. Point to final action buttons: approve document, reject document, publish draft, request revision, approve proof, or reject proof.
7. Avoid clicking final approve/reject unless you intentionally want to mutate demo data.

Say:

> AI is used here as a reviewer assistant, not as an auto-approver.
>
> It prescreens the item, summarizes what failed or passed, suggests a seller-facing note, and tells the reviewer what action is likely safe. The human still makes the final decision.
>
> This is practical automation: less reading, better routing, and a clearer final action.

### 12:10 - 12:45: Admin `Uploads`

Do:

1. Click `Uploads`.
2. Show upload filters: `Needs review`, `Documents`, `Proof`, `All`.
3. Use search if useful.
4. Click `Review` on one row.
5. Point to the selected upload panel.
6. Show document/proof details, prescreen, note editor, and approve/reject buttons.

Say:

> Uploads are separated into a table because reviewers may receive a large number of documents and seller proofs.
>
> The reviewer can filter, search, select one upload, see the prescreen, and take action without reading every item in one long page.

### 12:45 - 13:15: Admin `Drafts`

Do:

1. Click `Drafts`.
2. Show that drafts are collapsed by default.
3. Open one draft with the arrow.
4. Point to product facts, image preview, prescreen, note editor, `Publish draft`, and `Request revision`.

Say:

> Drafts are kept collapsible so the page does not become overloaded.
>
> A clean draft can be published. A weak draft gets a precise revision note back to the seller. This prevents weak claims from reaching buyers without proof.

### 13:15 - 13:50: Admin `AI Triage`

Do:

1. Click `AI Triage`.
2. Point to fast-clear, needs-senior, and blocked lanes.
3. Point to priority queue.
4. Point to reviewer plan.
5. Click `Verify Assistant` if the demo environment has AI configured and stable.
6. Point to provider/status result.
7. Click `Open recommended seller` if useful.

Say:

> AI Triage answers the reviewer question: what should I open first?
>
> It ranks active queue items, identifies fast-clear work, routes risky items to senior review, and generates short next steps.
>
> When Gemini or another configured provider is available, the check is live. If the provider is unavailable, Sarthi labels the fallback instead of hiding it.

### 13:50 - 14:20: Admin `Risk & Policy`

Do:

1. Click `Risk & Policy`.
2. Point to source health, checks passed, warnings, failures, and AI prescreens.
3. Point to human-in-loop gates.
4. Point to source freshness rows.

Say:

> This screen keeps automation honest.
>
> It shows which gates are being enforced: seller KYC before publish, proof must match buyer request, high-risk items stay human-led, and source freshness must be healthy.

### 14:20 - 14:45: Admin `Work Saved`

Do:

1. Click `Work Saved`.
2. Point to checks pre-read, suggested actions, fast decisions, trust lift waiting.
3. Point to queue split and automation guardrails.

Say:

> Work Saved shows the operational impact. Reviewers can see how many checks were pre-read, how many suggested actions were generated, and where effort is going today.
>
> This matters because agentic AI should reduce manual work, not create another dashboard to maintain.

### 14:45 - 15:10: Admin `Audit`

Do:

1. Go back to `Review Desk`.
2. Click `Audit`.
3. Point to recent reviewer decisions and notes.

Say:

> Every decision writes to audit history.
>
> That means buyer-facing trust is traceable. If proof becomes visible, if a draft is published, or if a document is rejected, there is a reviewer action behind it.

### 15:10 - 15:55: Architecture From README

Do:

1. Open the repository `README.md`.
2. Scroll to the `Architecture` section.
3. Keep the architecture diagram visible.
4. Point from left to right: user roles, React web app, Fastify API, authentication/RBAC, trust core, optional AI/retrieval, audit trail, and MongoDB/Atlas.

Say:

> I want to end by showing the architecture, because Sarthi is not just a set of UI screens.
>
> The buyer, seller, and reviewer all use the React web app. Every request goes through the Fastify API, where session validation and role-based access control decide what each role can do.
>
> The center of the system is the trust core. This is where Sarthi matches similar products, builds the evidence knowledge graph, applies the human review gate, and runs deterministic decision logic for trust recommendations.
>
> AI is used around that core, not instead of it. Gemini or Bedrock can help with grounded explanations, retrieval, and reviewer summaries. Vector Search and Neo4j are optional retrieval/projection layers. But the source of truth stays in MongoDB/Atlas, and important actions write audit traces with fact IDs.
>
> So the architecture keeps the demo practical: AI reduces effort, humans approve sensitive review decisions, and every trust state can be traced back to evidence.

### 15:55 - 16:15: Closing

Do:

1. End on either the README architecture diagram, `AI Triage`, `Audit`, or the buyer evidence graph.
2. Keep the screen steady.

Say:

> Sarthi connects the full trust loop.
>
> Buyers get evidence before payment. Sellers get specific proof tasks. Reviewers get grouped packets, AI triage, human-in-loop decisions, and audit trails.
>
> The goal is simple: move the marketplace from placed orders to kept orders.

## If You Must Fit 5 Minutes

Keep these scenes:

1. Landing hook.
2. Buyer Shop -> product detail -> verified question -> SKU proof.
3. Saved product -> evidence graph -> graph chat.
4. Checkout -> expectation contract -> Orders kept/returned dialog.
5. Seller Today -> Proof center -> Market Compare.
6. Admin Review Desk -> Upload/Draft decision -> AI Triage -> Audit.

Cut these scenes:

1. Detailed Trust Center controls.
2. Seller new listing form details.
3. Full Risk & Policy and Work Saved screens.
4. Long proof/media previews.

## Natural Phrases To Use

Use:

- "Sarthi checks the evidence before the buyer pays."
- "The AI reduces reviewer reading work, but the reviewer still decides."
- "This is a source trail, not a black-box score."
- "Private buyer fit memory stays buyer-only."
- "Seller proof becomes buyer-visible only after review."
- "The kept or returned outcome improves future trust checks."

Avoid:

- "The AI automatically approves sellers."
- "Returns are guaranteed to reduce."
- "This is a real payment or KYC integration."
- "The model knows the answer."
- "Everything is fully automated."
