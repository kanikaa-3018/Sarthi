# Demo Script

## Seven-Minute Flow

### 0:00 - Problem

Asha sees multiple similar kurtis. She does not know which seller, size, or offer to trust.

### 0:45 - Confusion Resolver

Open the feed. Show three similar listings. Tap:

```text
Let Sarthi compare
```

Sarthi recommends one listing and one alternative.

### 1:45 - Sarthi Samvaad

Ask:

```text
In teen mein best kaunsa hai? Mera usual L hai, kapda thin nahi chahiye.
```

Show that the agent detects compare, fit, and fabric intents.

### 2:45 - Product Detail

Show:

- XL recommendation;
- one color/fabric caution;
- evidence strength;
- fact IDs in audit.

### 3:45 - Offer Sach Check

At checkout, show:

```text
No need to rush. This price has been active for 5 days.
```

Do not say fake or manipulative.

### 4:45 - Outcome Learning

Simulate delivery. Mark kept. Show personal fit memory update and Neo4j `KEPT` edge.

### 5:30 - Cold Start

Open a new SKU. Sarthi says there is not enough size/color history and uses only seller/catalog facts.

### 6:15 - Audit Proof

Open audit drawer:

- tools used;
- fact IDs;
- graph path;
- unsupported claims blocked;
- timestamps.

### 6:45 - Impact

Close with:

```text
Sarthi optimizes for kept orders, not just placed orders.
```
