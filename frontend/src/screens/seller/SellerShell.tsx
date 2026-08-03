import type { ReactNode } from "react";
import type { Seller } from "../../types/api";
import type { SellerCopy } from "./sellerCopy";

type SellerShellProps = {
  seller: Seller;
  verificationStatus: string;
  copy: SellerCopy;
  loading: boolean;
  children: ReactNode;
};

export function SellerShell({
  seller,
  verificationStatus,
  copy,
  loading,
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
          <div className="seller-name-row">
            <h1>{seller.name}</h1>
            <span className="seller-verified-pill">{verificationStatus}</span>
          </div>
          <p className="seller-identity-meta">
            <span>{rating}</span>
          </p>
        </div>
      </header>

      <div className="seller-page-shell">{children}</div>
    </main>
  );
}
