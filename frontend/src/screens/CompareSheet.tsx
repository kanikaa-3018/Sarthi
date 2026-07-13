import { ShieldCheck, Info, HelpCircle } from "lucide-react";
import { t, type LanguageCode } from "../i18n";
import type { CompareResponse } from "../types/api";

type Props = {
  comparison: CompareResponse;
  language: LanguageCode;
  experienceMode: "simple" | "standard";
  onContinue: () => void;
  onOpenAudit: () => void;
};

// Seed database mapping helper to fetch original name & price from variant IDs
function getSellerNameAndPrice(variantId: string) {
  const match = variantId.match(/kurti_(\d+)_(\d+)/);
  if (match) {
    const clusterIdx = Number(match[1]);
    const itemIdx = Number(match[2]);
    const sellers = ["NayiDisha Fashions", "RangSetu Styles", "Sakhi Wholesale"];
    const sellerName = sellers[(itemIdx + clusterIdx) % sellers.length];
    
    const basePrices: Record<number, number> = {
      1: 449, 2: 399, 3: 699, 4: 329, 5: 379, 6: 549, 7: 499, 8: 459
    };
    const base = basePrices[clusterIdx] || 449;
    const price = base + (itemIdx - 2) * 20;
    return { sellerName, price };
  }
  return { sellerName: "Trusted Seller", price: 449 };
}

export function CompareSheet({ comparison, language, experienceMode, onContinue, onOpenAudit }: Props) {
  const ranking = comparison.ranking;
  const fit = comparison.fit;
  const isSimple = experienceMode === "simple";
  const visibleFactors = isSimple ? ranking.top_factors.slice(0, 2) : ranking.top_factors;

  // Retrieve candidate details
  const winnerDetails = getSellerNameAndPrice(ranking.winner);
  const alternativeDetails = ranking.alternative ? getSellerNameAndPrice(ranking.alternative) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", textAlign: "left" }}>
      {/* 7.2 Best Match */}
      <div style={{
        backgroundColor: "var(--bg-surface-muted)",
        border: "1.5px solid var(--accent-primary)",
        borderRadius: "12px",
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
            borderRadius: "4px"
          }}>
            Highly Recommended
          </span>
        </div>
        
        <div>
          <strong style={{ fontSize: "16px", color: "var(--text-primary)" }}>
            {winnerDetails.sellerName}
          </strong>
          <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "var(--text-secondary)", marginTop: "2px" }}>
            <span>Rs {winnerDetails.price}</span>
            <span>•</span>
            <span>Size: {fit.recommended_size}</span>
          </div>
        </div>

        {/* Why this one bullets */}
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

      {/* 7.2 Also Consider Alternative */}
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
            <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>
              {alternativeDetails.sellerName}
            </strong>
            <div style={{ display: "flex", gap: "8px", fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
              <span>Rs {alternativeDetails.price}</span>
              <span>•</span>
              <span>Size: {fit.recommended_size}</span>
            </div>
          </div>
          <span style={{ fontSize: "11px", color: "var(--accent-secondary)", fontStyle: "italic" }}>
            Lower price option, but historical data shows less evidence about color correctness or longer dispatch.
          </span>
        </div>
      )}

      {/* Audit pathway timeline check link */}
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

      {/* Choose action CTA */}
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
