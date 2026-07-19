import { ArrowRight, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SellerPanelListing } from "../../types/api";
import { buildMarketComparison, type SellerActionItem } from "./sellerModel";
import { SellerProductImage } from "./SellerProductImage";

type SellerMarketPageProps = {
  listings: SellerPanelListing[];
  competitors: SellerPanelListing[];
  actions: SellerActionItem[];
  initialProductId?: string | null;
  onAction: (action: SellerActionItem) => void;
};

export function SellerMarketPage({ listings, competitors, actions, initialProductId, onAction }: SellerMarketPageProps) {
  const [selectedId, setSelectedId] = useState(initialProductId ?? listings[0]?.product.product_id ?? "");
  const selected = listings.find((listing) => listing.product.product_id === selectedId) ?? listings[0];

  useEffect(() => {
    if (initialProductId && listings.some((listing) => listing.product.product_id === initialProductId)) {
      setSelectedId(initialProductId);
    } else if (!selectedId && listings[0]) {
      setSelectedId(listings[0].product.product_id);
    }
  }, [initialProductId, listings, selectedId]);
  const comparison = useMemo(
    () => selected ? buildMarketComparison(selected, competitors, actions) : null,
    [actions, competitors, selected]
  );

  return (
    <div className="seller-page seller-market-page">
      <header className="seller-page-header">
        <div>
          <p className="seller-kicker">Comparable listings</p>
          <h2>Market Compare</h2>
          <p>See where one product stands, the facts behind that position, and the improvement worth doing first.</p>
        </div>
        {listings.length > 0 && (
          <label className="seller-product-select">
            <span className="seller-product-select-label">Product to compare</span>
            <span className="seller-product-select-control">
              <select value={selected?.product.product_id ?? ""} onChange={(event) => setSelectedId(event.target.value)}>
                {listings.map((listing) => <option key={listing.product.product_id} value={listing.product.product_id}>{listing.product.title}</option>)}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </span>
          </label>
        )}
      </header>

      {!selected || !comparison ? (
        <div className="seller-empty-state"><h3>No comparable product is available</h3><p>Add a listing before reviewing its market evidence.</p></div>
      ) : (
        <>
          <section className="seller-market-position" aria-labelledby="seller-market-position-title">
            <div className="seller-market-product">
              <SellerProductImage src={selected.product.image_url} title={selected.product.title} size="market" />
              <div><span>Your listing</span><h3>{selected.product.title}</h3><p>{selected.seller.name}</p></div>
            </div>
            <div className="seller-market-position-copy">
              <p className="seller-kicker">Current position</p>
              <h3 id="seller-market-position-title">{comparison.position}</h3>
              <p>{comparison.reason}</p>
            </div>
            <div className="seller-market-recommendation seller-market-next" aria-labelledby="seller-market-recommendation-title">
              <div>
                <p className="seller-kicker">Best next improvement</p>
                <h3 id="seller-market-recommendation-title">{comparison.recommendation.title}</h3>
                <p>{comparison.recommendation.reason}</p>
              </div>
              <button type="button" className="seller-button seller-button-primary" onClick={() => onAction(comparison.recommendation)}>{comparison.recommendation.actionLabel}<ArrowRight size={16} aria-hidden="true" /></button>
            </div>
          </section>

          <section className="seller-market-evidence" aria-labelledby="seller-market-evidence-title">
            <div className="seller-section-heading"><div><p className="seller-kicker">Why this position</p><h3 id="seller-market-evidence-title">Evidence comparison</h3></div></div>
            <div className="seller-market-table-wrap">
              <table aria-label="Market evidence comparison">
                <thead><tr><th>Dimension</th><th>Your listing</th><th>Comparable listings</th></tr></thead>
                <tbody>{comparison.dimensions.map((dimension) => <tr key={dimension.label}><th>{dimension.label}</th><td className={`tone-${dimension.tone}`}>{dimension.yourValue}</td><td>{dimension.marketValue}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

        </>
      )}
    </div>
  );
}
