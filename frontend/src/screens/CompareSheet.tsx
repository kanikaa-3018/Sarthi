import { HelpCircle, Info, ShieldCheck } from "lucide-react";
import { t, type LanguageCode } from "../i18n";
import type { CompareResponse, Product } from "../types/api";

type Props = {
  comparison: CompareResponse;
  productCatalog: Product[];
  language: LanguageCode;
  experienceMode: "simple" | "standard";
  onContinue: () => void;
  onOpenAudit: () => void;
};

export function CompareSheet({
  comparison,
  productCatalog,
  language,
  experienceMode,
  onContinue,
  onOpenAudit
}: Props) {
  const ranking = comparison.ranking;
  const fit = comparison.fit;
  const isSimple = experienceMode === "simple";
  const visibleFactors = isSimple ? ranking.top_factors.slice(0, 2) : ranking.top_factors;
  const winnerDetails = getProductDetailsForVariant(ranking.winner, productCatalog);
  const alternativeDetails = ranking.alternative
    ? getProductDetailsForVariant(ranking.alternative, productCatalog)
    : null;
  const plainReason = visibleFactors.length
    ? visibleFactors.join(isSimple ? " and " : ", ")
    : "seller, size, return, and dispatch evidence is stronger";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", textAlign: "left" }}>
      <div style={{
        backgroundColor: "var(--bg-surface-muted)",
        border: "1.5px solid var(--accent-primary)",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px" }}>
          <span style={{
            fontSize: "11px",
            fontWeight: 800,
            color: "var(--success)",
            textTransform: "uppercase",
            letterSpacing: "0.05em"
          }}>
            Best match for you
          </span>
          <span style={{
            backgroundColor: "var(--success)",
            color: "#fff",
            fontSize: "10px",
            fontWeight: 700,
            padding: "2px 6px",
            borderRadius: "4px",
            whiteSpace: "nowrap"
          }}>
            Evidence picked
          </span>
        </div>

        <div>
          <span style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "2px" }}>
            {winnerDetails.title}
          </span>
          <strong style={{ fontSize: "16px", color: "var(--text-primary)" }}>
            {winnerDetails.sellerName}
          </strong>
          <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "var(--text-secondary)", marginTop: "2px" }}>
            <span>Rs {winnerDetails.price}</span>
            <span>-</span>
            <span>Size: {fit.recommended_size}</span>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.45 }}>
          In simple words, Sarthi picked this because {plainReason}. It is not choosing only by cheapest price.
        </p>

        <div style={{ borderTop: "1px solid var(--border-subtle)", paddingTop: "8px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-primary)" }}>Why this one:</span>
          {visibleFactors.map((factor, idx) => (
            <div key={idx} style={{ display: "flex", gap: "6px", fontSize: "12px", color: "var(--text-secondary)", alignItems: "center" }}>
              <ShieldCheck size={13} style={{ color: "var(--success)", flexShrink: 0 }} />
              <span>{factor}</span>
            </div>
          ))}
        </div>
      </div>

      {!isSimple && ranking.alternative && alternativeDetails && (
        <div style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "12px",
          padding: "14px",
          display: "flex",
          flexDirection: "column",
          gap: "8px"
        }}>
          <span style={{
            fontSize: "11px",
            fontWeight: 800,
            color: "var(--text-secondary)",
            textTransform: "uppercase"
          }}>
            Also consider
          </span>

          <div>
            <span style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "2px" }}>
              {alternativeDetails.title}
            </span>
            <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>
              {alternativeDetails.sellerName}
            </strong>
            <div style={{ display: "flex", gap: "8px", fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
              <span>Rs {alternativeDetails.price}</span>
              <span>-</span>
              <span>Size: {fit.recommended_size}</span>
            </div>
          </div>
          <span style={{ fontSize: "11px", color: "var(--accent-secondary)", fontStyle: "italic" }}>
            Lower price can still be useful, but Sarthi separates price from return, color, dispatch, and fit proof.
          </span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <Info size={12} />
          <span>{isSimple ? t(language, "proofAvailable") : `Traversed ${comparison.graph_path.relationships.length} graph paths`}</span>
        </span>
        <button
          onClick={onOpenAudit}
          style={{ color: "var(--accent-primary-hover)", fontWeight: 700, textDecoration: "underline", display: "flex", alignItems: "center", gap: "3px" }}
        >
          <HelpCircle size={11} />
          <span>{isSimple ? "Proof" : "How Sarthi decided"}</span>
        </button>
      </div>

      <button
        onClick={onContinue}
        style={{
          width: "100%",
          backgroundColor: "var(--accent-primary)",
          color: "var(--text-on-accent)",
          border: "none",
          borderRadius: "8px",
          padding: "12px",
          fontSize: "14px",
          fontWeight: 700,
          marginTop: "8px",
          cursor: "pointer"
        }}
      >
        Choose this option
      </button>
    </div>
  );
}

function getProductDetailsForVariant(variantId: string, productCatalog: Product[]) {
  const product = [...productCatalog]
    .sort((a, b) => b.product_id.length - a.product_id.length)
    .find((item) => variantId === item.product_id || variantId.startsWith(`${item.product_id}_`));

  return {
    title: product?.title.split("-")[0].trim() ?? "Selected product",
    sellerName: product?.seller_name ?? "Mapped seller",
    price: product?.base_price ?? 0
  };
}
