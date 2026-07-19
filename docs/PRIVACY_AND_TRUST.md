# Privacy And Trust

## Privacy Position

Sarthi should feel helpful, not invasive.

Demo copy:

```text
Used: 2 past kurti outcomes and your selected fit preference.
Not used: phone contacts, messages, address, payment details, or raw voice.
```

## Data We Use

- catalog data;
- reviews;
- order outcomes;
- return reasons;
- price events;
- campaigns;
- inventory snapshots;
- buyer-provided fit preference;
- personal fit memory if enabled.

## Data We Do Not Use

- SMS;
- contacts;
- gallery;
- background notification access;
- address;
- payment details;
- raw voice retention;
- sensitive/protected attributes.

## Buyer Controls

The buyer can:

- view fit memory;
- edit fit preference;
- turn fit memory off;
- delete fit memory;
- use text instead of voice.

## Seller Fairness

- Use SKU/variant outcomes, not seller reputation alone.
- Smooth sparse data toward category priors.
- Mark new listings as unknown.
- Separate logistics-caused returns from product-caused returns.
- Give sellers aggregate feedback only.
- Show seller verification state separately from product evidence.
- Block buyer recommendation only when verification is restricted or missing.

## Trust Contract

Every claim should include:

- fact ID;
- source type;
- denominator where relevant;
- timestamp;
- freshness/expiry;
- confidence.

The validator must reject unsupported numbers, stale price claims, overconfident fit claims, and absolute language.

## Operational Trust

- Data freshness is tracked per source contract.
- Stale or unavailable source systems pause strong advice.
- Demo reset, scenario, and debug graph APIs are disabled outside development/demo mode.
- Outcome learning accepts only structured statuses and return reasons.
- Unknown variants are rejected before personal memory or aggregate evidence changes.
