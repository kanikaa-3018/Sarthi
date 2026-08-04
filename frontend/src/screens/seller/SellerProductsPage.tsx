import { ArrowRight, Bot, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { roleText, type LanguageCode } from "../../i18n";
import type { SellerCopy } from "./sellerCopy";
import type { SellerAutomationSummary, SellerProductRow } from "./sellerModel";
import { SellerProductImage } from "./SellerProductImage";

type ProductFilter = "all" | SellerProductRow["state"];

type SellerProductsPageProps = {
  rows: SellerProductRow[];
  automation?: SellerAutomationSummary | null;
  copy: SellerCopy;
  language: LanguageCode;
  onAction: (row: SellerProductRow) => void;
  onCompare: (row: SellerProductRow) => void;
};

export function SellerProductsPage({ rows, automation, copy, language, onAction, onCompare }: SellerProductsPageProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProductFilter>("all");
  const tx = (text: string) => roleText(language, text);
  const claimRisks = automation?.claimRisks.slice(0, 2) ?? [];
  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery = !normalizedQuery || `${row.listing.product.title} ${row.listing.product.product_id}`.toLowerCase().includes(normalizedQuery);
      return matchesQuery && (filter === "all" || row.state === filter);
    });
  }, [filter, query, rows]);

  return (
    <div className="seller-page seller-products-page">
      <header className="seller-page-header">
        <div>
          <p className="seller-kicker">{tx("Catalog operations")}</p>
          <h2>{tx("Products")}</h2>
          <p>{tx("See what is blocking buyer trust and take one clear action for each listing.")}</p>
        </div>
      </header>

      <div className="seller-product-tools">
        <label className="seller-search-field">
          <Search size={17} aria-hidden="true" />
          <input aria-label={copy.searchProducts} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.searchProducts} />
        </label>
        <div className="seller-filter-group" aria-label="Product status filters">
          {(["all", "attention", "review", "healthy"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={filter === value ? "active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === "all" ? copy.allProducts : value === "attention" ? copy.needsAttention : value === "review" ? copy.inReview : copy.healthy}
            </button>
          ))}
        </div>
      </div>

      {automation && (automation.listingSuggestions.length || claimRisks.length) ? (
        <section className="seller-listing-agent-strip" aria-labelledby="seller-listing-agent-heading">
          <div>
            <span><Bot size={16} aria-hidden="true" /> {tx("Listing agent")}</span>
            <h3 id="seller-listing-agent-heading">{claimRisks.length ? tx("Proof-backed promises") : tx("Seller-approved fixes")}</h3>
            <p>{claimRisks.length ? tx("Replace risky product claims with evidence the seller can actually submit.") : automation.rootCause ? `${automation.rootCause.title}: ${automation.rootCause.reason}` : tx("Review the product promises that can reduce buyer doubt.")}</p>
          </div>
          {claimRisks.length ? (
            <div className="seller-claim-risk-list">
              {claimRisks.map((risk) => {
                const row = rows.find((item) => item.listing.product.product_id === risk.productId);
                return (
                  <article key={risk.productId} className={`seller-claim-risk-card tone-${risk.tone}`}>
                    <div>
                      <span>{risk.issue}</span>
                      <strong>{risk.title}</strong>
                    </div>
                    <dl>
                      <div>
                        <dt>{tx("Risky claim")}</dt>
                        <dd>{risk.riskyClaim}</dd>
                      </div>
                      <div>
                        <dt>{tx("Safer promise")}</dt>
                        <dd>{risk.saferClaim}</dd>
                      </div>
                    </dl>
                    <small>{tx("Evidence")}: {risk.evidenceNeeded}</small>
                    <button type="button" className="seller-button seller-button-text" disabled={!row} onClick={() => row && onAction(row)}>
                      {risk.action}
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="seller-listing-agent-items">
              {automation.listingSuggestions.slice(0, 3).map((suggestion) => {
                const row = rows.find((item) => item.listing.product.product_id === suggestion.productId);
                return (
                  <article key={suggestion.productId} className={`tone-${suggestion.tone}`}>
                    <strong>{suggestion.title}</strong>
                    <p>{suggestion.reason}</p>
                    <button type="button" className="seller-button seller-button-text" disabled={!row} onClick={() => row && onAction(row)}>
                      {suggestion.action}
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {visibleRows.length ? (
        <div className="seller-product-table-wrap">
          <table className="seller-product-table" aria-label="Seller products">
            <thead>
              <tr>
                <th>{copy.product}</th>
                <th>{copy.status}</th>
                <th>{copy.buyerConcern}</th>
                <th>{copy.evidence}</th>
                <th>{copy.position}</th>
                <th>{copy.action}</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.listing.product.product_id}>
                  <td data-label={copy.product}>
                    <div className="seller-product-identity">
                      <SellerProductImage src={row.listing.product.image_url} title={row.listing.product.title} />
                      <div>
                        <strong>{row.listing.product.title}</strong>
                        <span>{row.listing.product.product_id}</span>
                      </div>
                    </div>
                  </td>
                  <td data-label={copy.status}><span className={`seller-state seller-state-${row.state}`}>{row.status}</span></td>
                  <td data-label={copy.buyerConcern}>{row.concern}</td>
                  <td data-label={copy.evidence}>{row.evidence}</td>
                  <td data-label={copy.position}>{row.position}</td>
                  <td data-label={copy.action}>
                    <div className="seller-product-actions">
                      <button type="button" className="seller-button seller-button-secondary" onClick={() => onAction(row)}>{row.actionLabel}</button>
                      {row.actionKind !== "market" && <button type="button" className="seller-button seller-button-text" onClick={() => onCompare(row)}>{tx("Compare")}</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="seller-empty-state">
          <h3>{copy.noProducts}</h3>
          <button type="button" className="seller-button seller-button-secondary" onClick={() => { setQuery(""); setFilter("all"); }}>{tx("Clear filters")}</button>
        </div>
      )}
    </div>
  );
}
