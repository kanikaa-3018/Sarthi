export function defaultScenarios() {
  return [{
    scenario_id: "mentor_checkout_flow",
    title: "Checkout trust and prepaid nudge",
    description: "Buyer saves a product, Sarthi checks trust, and checkout decides whether prepaid can be nudged.",
    buyer_id: "buyer_asha",
    cluster_id: "cluster_floral_blue",
    product_id: "kurti_1_1",
    variant_id: "kurti_1_1_xl",
    question: "Mera usual L hai, kapda thin toh nahi hai?",
    expected: ["trust score", "proof gap", "checkout confidence"],
    start: {
      screen: "buyer_feed",
      buyer_id: "buyer_asha",
      cluster_id: "cluster_floral_blue",
      product_id: "kurti_1_1",
      variant_id: "kurti_1_1_xl"
    },
    data_disclosure: "MongoDB Atlas seeded evidence is used until official connectors are available."
  }];
}
