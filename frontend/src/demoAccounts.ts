export type AuthPortal = "buyer" | "seller" | "reviewer";
export type DemoRole = "buyer" | "seller" | "admin";

type DemoAccount = {
  username: string;
  password: string;
  label: string;
  role: DemoRole;
  displayName: string;
  defaultPath: "/shop" | "/seller" | "/admin";
};

export const DEMO_ACCOUNTS = {
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
} as const satisfies Record<AuthPortal, DemoAccount>;

export function getDemoAccountForRole(role: DemoRole) {
  const portal: AuthPortal = role === "admin" ? "reviewer" : role;
  return DEMO_ACCOUNTS[portal];
}
