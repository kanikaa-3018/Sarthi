export type AuthPortal = "buyer" | "seller" | "reviewer";
export type SeededRole = "buyer" | "seller" | "admin";

type SeededAccount = {
  username: string;
  password: string;
  label: string;
  role: SeededRole;
  displayName: string;
  defaultPath: "/shop" | "/seller" | "/admin";
};

export const SEEDED_ACCOUNTS = {
  buyer: {
    username: "asha.buyer",
    password: "buyer-asha-pass",
    label: "Asha (Buyer)",
    role: "buyer",
    displayName: "Asha",
    defaultPath: "/shop"
  },
  seller: {
    username: "seller.a",
    password: "seller-a-pass",
    label: "NayiDisha Fashions (Seller)",
    role: "seller",
    displayName: "NayiDisha Fashions",
    defaultPath: "/seller"
  },
  reviewer: {
    username: "reviewer.admin",
    password: "admin-reviewer-pass",
    label: "Reviewer Admin",
    role: "admin",
    displayName: "Reviewer Admin",
    defaultPath: "/admin"
  }
} as const satisfies Record<AuthPortal, SeededAccount>;

export function getSeededAccountForRole(role: SeededRole) {
  const portal: AuthPortal = role === "admin" ? "reviewer" : role;
  return SEEDED_ACCOUNTS[portal];
}
