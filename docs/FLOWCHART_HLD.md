# Sarthi Flowchart And HLD

This document contains three left-to-right flowcharts that fit better on A4 landscape pages.

The goal is to show Sarthi as a closed-loop product without making the diagram too tall or crowded.

## 1. Entire Closed-Loop System

```mermaid
flowchart LR
    Buyer[Buyer App<br/>Search / Open / Wishlist] --> Agent[Agent Orchestrator]
    Buyer --> Dashboard[Buyer Trust Dashboard<br/>Privacy + Review Weight]

    Agent --> Score[Trust Score Engine]
    Agent --> Mongo[(MongoDB Atlas<br/>Product Evidence, Scores,<br/>Reviewer Profiles, Traces, Cache)]
    Agent --> Graph[(Neo4j<br/>Weighted Trust Graph)]

    Mongo --> Score
    Graph --> Score
    Score --> Trust[Buyer Trust View<br/>Score + Reason + Warning]

    Trust --> Checkout[Checkout Confidence<br/>Offer + Payment Trust]
    Checkout --> Gate{Trust Gates Pass?}

    Gate -- Strong --> Prepaid[Prepaid Nudge<br/>COD Still Available]
    Gate -- Medium --> Balanced[Balanced Choice<br/>Show Tradeoff]
    Gate -- Weak --> NoNudge[No Prepaid Nudge<br/>Explain Limited Trust]

    Prepaid --> Order[Order Placed]
    Balanced --> Order
    NoNudge --> Order

    Order --> Outcome[Kept / Returned Outcome]
    Outcome --> Mongo
    Outcome --> Dashboard
    Outcome --> SellerTask[Aggregate Seller Proof<br/>or Improvement Task]

    Trust --> ProofGap{Proof Missing?}
    ProofGap -- Yes --> SellerTask

    SellerTask --> Seller[Seller Portal]
    Seller --> Admin[Admin Review]
    Admin --> Mongo
    Admin --> Graph
```

## 2. Buyer Flow

```mermaid
flowchart LR
    Login[Buyer Logs In] --> Browse[Browse / Search]
    Browse --> Dashboard[Trust Dashboard<br/>Memory + Review Credibility]
    Dashboard --> Select[Open / Wishlist Product]
    Select --> Similar{Similar Listings?}

    Similar -- No --> Limited[Limited Evidence<br/>No Forced Comparison]
    Similar -- Yes --> Compare[Compare Seller Listings]

    Compare --> Score[Trust Score + Breakdown]
    Score --> Detail[SKU Passport<br/>Size + Warning]
    Detail --> Ask[Ask Sarthi]

    Ask --> Evidence{Enough Evidence?}
    Evidence -- Yes --> Answer[Grounded Answer<br/>Proof Path]
    Evidence -- No --> ProofRequest[Create Seller Proof Request]

    Answer --> Checkout[Checkout]
    ProofRequest --> Checkout
    Limited --> Checkout

    Checkout --> Payment[COD / Prepaid Choice]
    Payment --> Outcome[Kept or Returned]
    Outcome --> Learning[Update Future Trust<br/>and Review Weight]
```

## 3. Seller And Admin Flow

```mermaid
flowchart LR
    Seller[Seller Applies] --> Docs[Upload Verification Docs]
    Docs --> AdminReview[Admin Reviews Seller]
    AdminReview --> Approved{Approved?}

    Approved -- No --> Revision[Revision / Rejection]
    Revision --> Docs

    Approved -- Yes --> Draft[Create Listing Draft]
    Draft --> ListingReview[Admin Reviews Listing]
    ListingReview --> Published[Published With<br/>Limited Evidence]

    Published --> BuyerSignals[Buyer Questions<br/>Returns + Reviews]
    BuyerSignals --> Aggregate[Aggregate Signals Only<br/>No Buyer Identity]
    Aggregate --> Coach[Seller Evidence Coach]

    Coach --> Action[Seller Adds Proof<br/>or Fixes Listing]
    Action --> ProofReview[Admin / Rules Validate]
    ProofReview --> Update[Update SKU Trust<br/>and Graph Evidence]
    Update --> FutureBuyer[Future Buyers See<br/>Stronger Proof]
```

## 4. Reading The Diagram

- The buyer receives a simple trust decision, not a technical report.
- MongoDB Atlas stores flexible product evidence, scores, traces, checkout sessions, proof requests, and cache.
- Buyer review profiles downweight reviews from very new, high-return, high-RTO, or repeated-pattern accounts.
- Neo4j stores weighted relationships for graph reasoning.
- Seller tasks are aggregate and privacy-safe.
- Admin review prevents trust from being self-declared.
- Delivery outcomes update future recommendations.
