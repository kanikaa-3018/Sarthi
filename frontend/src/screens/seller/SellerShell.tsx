import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { Seller } from "../../types/api";
import type { SellerCopy } from "./sellerCopy";
import type { SellerRoute } from "./sellerModel";

type SellerShellProps = {
  seller: Seller;
  verificationStatus: string;
  activeRoute: SellerRoute;
  copy: SellerCopy;
  loading: boolean;
  onNavigate: (route: SellerRoute) => void;
  children: ReactNode;
};

const ROUTES: SellerRoute[] = ["today", "products", "proofs", "market"];

export function SellerShell({
  seller,
  verificationStatus,
  activeRoute,
  copy,
  loading,
  onNavigate,
  children
}: SellerShellProps) {
  const rating = typeof seller.current_rating === "number"
    ? `${seller.current_rating.toFixed(1)} from ${seller.rating_count.toLocaleString("en-IN")} buyer ratings`
    : "No buyer ratings yet";

  return (
    <main className="seller-app" aria-busy={loading}>
      <header className="seller-identity">
        <div className="seller-identity-copy">
          <p className="seller-kicker">{copy.workspace}</p>
          <h1>{seller.name}</h1>
          <p className="seller-identity-meta">
            <span>{rating}</span>
            <span aria-hidden="true">·</span>
            <span>{verificationStatus}</span>
          </p>
        </div>
        <button className="seller-button seller-button-primary seller-new-listing" type="button" onClick={() => onNavigate("new")}>
          <Plus size={17} aria-hidden="true" />
          {copy.newListing}
        </button>
      </header>

      <nav className="seller-local-nav" aria-label="Seller workspace">
        {ROUTES.map((route) => (
          <button
            key={route}
            type="button"
            className={activeRoute === route ? "active" : ""}
            aria-current={activeRoute === route ? "page" : undefined}
            onClick={() => onNavigate(route)}
          >
            {route === "today" ? copy.today : route === "products" ? copy.products : route === "proofs" ? copy.proofs : copy.market}
          </button>
        ))}
      </nav>

      <div className="seller-page-shell">{children}</div>
    </main>
  );
}
