import { ShieldCheck, GitCompareArrows, HelpCircle, CheckCircle2 } from "lucide-react";
import { t, type ExperienceMode, type LanguageCode } from "../i18n";
import type { CompareResponse } from "../types/api";

type Props = {
  comparison: CompareResponse;
  language: LanguageCode;
  experienceMode: ExperienceMode;
  onContinue: () => void;
  onOpenAudit: () => void;
};

export function CompareSheet({ comparison, language, experienceMode, onContinue, onOpenAudit }: Props) {
  const ranking = comparison.ranking;
  const fit = comparison.fit;
  const winner = ranking.candidates.find((candidate) => candidate.variant_id === ranking.winner);

  return (
    <section className="card-surface">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <span className="eyebrow">Comparison Analysis</span>
          <h2 style={{ fontSize: "22px", marginTop: "4px" }}>Sarthi Curated Listings Match</h2>
        </div>
        <div className="system-status" style={{ background: "var(--sage-light)", color: "var(--forest-green)" }}>
          <ShieldCheck size={14} />
          <span>{winner ? `${Math.round(winner.score * 100)} Sarthi Score` : "Evidence Ready"}</span>
        </div>
      </div>

      <p style={{ marginTop: "-8px" }}>
        Sarthi analyzed matching catalog duplicates. By mapping seller ratings, dispatch speeds, and return frequency from identical SKUs, Sarthi ranked <strong>{ranking.winner}</strong> as the optimal keep-pick.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "20px", marginTop: "8px" }}>
        {/* Recommended Winner Block */}
        <div className="comparison-winner-tile" style={{ padding: "16px", background: "var(--bg-beige)", border: "1px dashed var(--moss-green)" }}>
          <span className="eyebrow" style={{ fontSize: "10px", color: "var(--moss-green)" }}>Winner Listing Option</span>
          <strong style={{ fontSize: "16px", color: "var(--forest-green)", marginTop: "4px" }}>{ranking.winner}</strong>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Recommended: Size <strong>{fit.recommended_size}</strong> &bull; {fit.confidence} fit predictability
          </span>
        </div>

        {/* Alternative Block */}
        <div className="comparison-winner-tile" style={{ padding: "16px", background: "var(--surface)", border: "1px solid var(--border-beige)" }}>
          <span className="eyebrow" style={{ fontSize: "10px", color: "var(--text-muted)" }}>Alternative Seller Option</span>
          <strong style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "4px" }}>
            {ranking.alternative ?? "No close matching alternative"}
          </strong>
          <span style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
            {ranking.alternative ? "Lower historical kept-rate score" : "No competing options fit criteria"}
          </span>
        </div>
      </div>

      {/* Deciding Factors */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", borderTop: "1px solid var(--border-beige)", paddingTop: "16px" }}>
        <strong style={{ fontSize: "13px", color: "var(--forest-green)" }}>{t(language, "agentChecks")}</strong>
        <div className="samvaad-suggestions" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {ranking.top_factors.map((factor) => (
            <div key={factor} style={{ display: "flex", alignItems: "center", gap: "8px", background: "var(--bg-beige)", padding: "10px", borderRadius: "8px", fontSize: "12px" }}>
              <CheckCircle2 size={14} style={{ color: "var(--moss-green)", flexShrink: 0 }} />
              <span style={{ color: "var(--text-secondary)" }}>{factor}</span>
            </div>
          ))}
        </div>
      </div>

      {experienceMode === "simple" && (
        <div className="compare-simple-note">
          <ShieldCheck size={15} />
          <span>{t(language, "checkOnce")}: Sarthi picked the listing with stronger kept-order and fit evidence, then keeps the offer check for checkout.</span>
        </div>
      )}

      {/* Traversal Proof Stats */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-beige)", paddingTop: "16px", fontSize: "12px", color: "var(--text-muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <GitCompareArrows size={14} />
          <span>Sarthi traversed {comparison.graph_path.relationships.length} Neo4j graph relationships to resolve listings</span>
        </span>
        <button className="btn-text-link" onClick={onOpenAudit}>
          <HelpCircle size={14} />
          <span>Decision paths proof</span>
        </button>
      </div>

      <button className="btn-buy-cod" style={{ marginTop: "8px" }} onClick={onContinue}>
        Go to Product details page
      </button>
    </section>
  );
}
