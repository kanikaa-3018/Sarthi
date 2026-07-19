# Data Dictionary

## Entities

### Buyer

Represents a demo shopper profile.

Fields:

- `buyer_id`
- `display_name`
- `language`
- `cod_preferred`
- `fit_memory_enabled`

### Account

Represents an authenticated buyer, seller, or admin login.

Fields:

- `account_id`
- `username`
- `display_name`
- `role`
- `buyer_id`
- `seller_id`
- `password_salt`
- `password_hash`
- `disabled`
- `created_at`

Allowed roles:

```text
buyer
seller
admin
```

### SellerProfile

Represents seller verification and seller data-access state.

Fields:

- `seller_id`
- `verification_status`
- `gst_status`
- `kyc_status`
- `pickup_pincode`
- `categories_json`
- `support_contact`
- `data_access_level`
- `restricted_reason`
- `last_verified_at`

Allowed verification statuses:

```text
verified
pending
restricted
```

### DataSource

Represents the freshness and reliability contract for a source system.

Fields:

- `source_id`
- `domain`
- `display_name`
- `owner_system`
- `reliability`
- `freshness_sla_hours`
- `last_synced_at`
- `status`
- `notes`

Allowed statuses:

```text
operational
degraded
stale
unavailable
```

### Product

Represents a listing-level product.

Fields:

- `product_id`
- `cluster_id`
- `seller_id`
- `title`
- `category`
- `garment_type`
- `fabric`
- `color_family`
- `base_price`
- `image_url`
- `rating`
- `rating_count`
- `commerce_badge`
- `delivery_text`
- `is_sarthi_eligible`

### SellerApplication

Represents a database-backed seller onboarding application.

Fields:

- `application_id`
- `seller_id`
- `business_name`
- `gst_number`
- `pickup_pincode`
- `support_contact`
- `status`
- `created_at`

Allowed statuses:

```text
pending_review
approved
rejected
```

### SellerVerificationDocument

Represents a seller-submitted verification document and its stored evidence metadata.

Fields:

- `document_id`
- `seller_id`
- `document_type`
- `reference`
- `file_name`
- `mime_type`
- `file_size_bytes`
- `sha256`
- `storage_uri`
- `uploaded_at`
- `status`
- `submitted_at`
- `reviewed_at`
- `notes`

Allowed document statuses:

```text
submitted
under_review
approved
rejected
```

### ReviewerAuditEvent

Represents an admin reviewer decision.

Fields:

- `event_id`
- `actor_account_id`
- `action`
- `target_type`
- `target_id`
- `seller_id`
- `decision`
- `notes`
- `created_at`

### ListingDraft

Represents a seller listing before it becomes a live buyer-facing product.

Fields:

- `draft_id`
- `seller_id`
- `title`
- `category`
- `garment_type`
- `fabric`
- `color_family`
- `base_price`
- `image_url`
- `target_cluster_id`
- `status`
- `readiness_status`
- `created_at`
- `updated_at`
- `submitted_at`

Allowed draft statuses:

```text
draft
submitted
needs_revision
approved
```

Approved drafts can create buyer-facing product and variant rows only through the admin review flow.

### Variant

Represents a size-specific product option.

Fields:

- `variant_id`
- `product_id`
- `size`
- `current_price`
- `stock`

### OrderOutcome

Synthetic order event.

Fields:

- `order_id`
- `buyer_id`
- `variant_id`
- `status`
- `return_reason`
- `created_at`
- `fact_id`

Allowed statuses:

```text
delivered_kept
returned
exchanged
rto
```

Allowed return reasons:

```text
too_small
too_large
color_different
fabric_different
damaged
```

Returned and exchanged outcomes require a structured `return_reason`. Kept and RTO outcomes cannot include one.

### FactRecord

Auditable source record behind a claim.

Fields:

- `fact_id`
- `source_table`
- `source_id`
- `source_type`
- `summary`
- `created_at`
- `expires_at`

### RecommendationTrace

Stores decision trace for audit drawer.

Fields:

- `trace_id`
- `buyer_id`
- `product_id`
- `variant_id`
- `intent`
- `tools_used`
- `fact_ids`
- `created_at`

## Invariants

```text
returns <= delivered_orders
kept + returned + exchanged <= delivered
every buyer-facing claim has a fact_id
every Neo4j fact_id maps to SQLite FactRecord
price comparisons use same variant context
new products are unknown, not risky
restricted sellers do not get buyer recommendations
stale source systems pause strong claims
invalid outcome writebacks are rejected
```
