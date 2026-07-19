import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileText, Route, ShieldCheck, X } from "lucide-react";
import { getAudit } from "../api/client";
import type { LanguageCode } from "../i18n";
import type { AuditTrace, FactDetail, GraphPath } from "../types/api";

type Props = {
  traceId: string | null;
  onClose: () => void;
  language?: LanguageCode;
};

type ProofView = "simple" | "map";

type ProofCopy = {
  loadingTitle: string;
  loadingBody: string;
  errorTitle: string;
  heroEyebrow: string;
  readyTitle: string;
  cautionTitle: string;
  readyBody: string;
  cautionBody: string;
  simpleTab: string;
  mapTab: string;
  factsChecked: string;
  checksRun: string;
  safeClaims: string;
  simpleTitle: string;
  simpleBody: string;
  mapTitle: string;
  mapBody: string;
  nextStep: string;
  nextStepReady: string;
  nextStepCaution: string;
  reviewerDetails: string;
  factIds: string;
  graphRoutes: string;
  mostUsefulProof: string;
  noRoute: string;
  close: string;
  questionNode: string;
  evidenceNode: string;
  decisionNode: string;
};

const PROOF_COPY: Record<LanguageCode, ProofCopy> = {
  english: {
    loadingTitle: "Checking proof",
    loadingBody: "Sarthi is reading seller, order, review, size and offer facts.",
    errorTitle: "Proof could not load",
    heroEyebrow: "Buyer proof",
    readyTitle: "Sarthi checked this for you",
    cautionTitle: "Check one thing before buying",
    readyBody: "The answer is supported by real product and order evidence. You can use this proof to decide faster.",
    cautionBody: "Some evidence is limited or points to a return risk. Read the next safe step before paying.",
    simpleTab: "Simple",
    mapTab: "Proof map",
    factsChecked: "facts checked",
    checksRun: "checks run",
    safeClaims: "unsupported claims blocked",
    simpleTitle: "What was checked",
    simpleBody: "Plain-language proof, not technical logs.",
    mapTitle: "How Sarthi connected it",
    mapBody: "Tap this when you want to see the evidence path.",
    nextStep: "Next safe step",
    nextStepReady: "Use this proof with the product photo, size suggestion and checkout offer check.",
    nextStepCaution: "Do not rush. Check size or seller proof once more before paying.",
    reviewerDetails: "Reviewer details",
    factIds: "Fact IDs",
    graphRoutes: "Graph routes",
    mostUsefulProof: "Most useful proof",
    noRoute: "Direct fact match",
    close: "Done",
    questionNode: "Your question",
    evidenceNode: "Seller, size, return and offer facts",
    decisionNode: "Sarthi answer"
  },
  hindi: {
    loadingTitle: "Proof check ho raha hai",
    loadingBody: "Sarthi seller, order, review, size aur offer facts dekh raha hai.",
    errorTitle: "Proof load nahi hua",
    heroEyebrow: "Buyer proof",
    readyTitle: "Sarthi ne check kar diya",
    cautionTitle: "Buy se pehle ek cheez check karo",
    readyBody: "Answer real product aur order proof se supported hai. Isse decision fast ho sakta hai.",
    cautionBody: "Kuch proof limited hai ya return risk dikh raha hai. Payment se pehle next step dekho.",
    simpleTab: "Simple",
    mapTab: "Proof map",
    factsChecked: "facts checked",
    checksRun: "checks run",
    safeClaims: "unsupported claims blocked",
    simpleTitle: "Kya check hua",
    simpleBody: "Technical logs nahi, simple proof.",
    mapTitle: "Sarthi ne kaise connect kiya",
    mapBody: "Evidence path dekhna ho tab yahan dekho.",
    nextStep: "Safe next step",
    nextStepReady: "Product photo, size suggestion aur checkout offer check ke saath ye proof use karo.",
    nextStepCaution: "Rush mat karo. Payment se pehle size ya seller proof ek baar aur check karo.",
    reviewerDetails: "Reviewer details",
    factIds: "Fact IDs",
    graphRoutes: "Graph routes",
    mostUsefulProof: "Most useful proof",
    noRoute: "Direct fact match",
    close: "Done",
    questionNode: "Aapka sawaal",
    evidenceNode: "Seller, size, return aur offer facts",
    decisionNode: "Sarthi answer"
  },
  hinglish: {
    loadingTitle: "Proof check ho raha hai",
    loadingBody: "Sarthi seller, order, review, size aur offer facts read kar raha hai.",
    errorTitle: "Proof load nahi hua",
    heroEyebrow: "Buyer proof",
    readyTitle: "Sarthi ne ye check kiya",
    cautionTitle: "Buy se pehle ek check karo",
    readyBody: "Answer real product aur order proof se supported hai. Isse decision easy ho jayega.",
    cautionBody: "Kuch evidence limited hai ya return risk dikh raha hai. Payment se pehle next safe step dekho.",
    simpleTab: "Simple",
    mapTab: "Proof map",
    factsChecked: "facts checked",
    checksRun: "checks run",
    safeClaims: "unsupported claims blocked",
    simpleTitle: "Kya check hua",
    simpleBody: "Technical logs nahi, buyer-friendly proof.",
    mapTitle: "Sarthi ne proof kaise joda",
    mapBody: "Evidence path dekhna ho toh yahan dekho.",
    nextStep: "Safe next step",
    nextStepReady: "Product photo, size suggestion aur checkout offer check ke saath ye proof use karo.",
    nextStepCaution: "Rush mat karo. Payment se pehle size ya seller proof ek baar aur check karo.",
    reviewerDetails: "Reviewer details",
    factIds: "Fact IDs",
    graphRoutes: "Graph routes",
    mostUsefulProof: "Most useful proof",
    noRoute: "Direct fact match",
    close: "Done",
    questionNode: "Aapka question",
    evidenceNode: "Seller, size, return aur offer facts",
    decisionNode: "Sarthi answer"
  }
};

export function AuditDrawer({ traceId, onClose, language = "english" }: Props) {
  const [trace, setTrace] = useState<AuditTrace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ProofView>("simple");

  useEffect(() => {
    if (!traceId) {
      setTrace(null);
      setError(null);
      setView("simple");
      return;
    }
    setView("simple");
    getAudit(traceId)
      .then((payload) => {
        setTrace(payload);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [traceId]);

  if (!traceId) return null;

  const copy = PROOF_COPY[language];

  return (
    <div className="audit-drawer proof-popup">
      {error && (
        <div className="proof-popup-state error">
          <X size={18} />
          <div>
            <strong>{copy.errorTitle}</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {trace ? (
        <ProofContent trace={trace} onClose={onClose} copy={copy} view={view} setView={setView} />
      ) : (
        <div className="proof-popup-state loading">
          <CheckCircle2 size={18} />
          <div>
            <strong>{copy.loadingTitle}</strong>
            <span>{copy.loadingBody}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ProofContent({
  trace,
  onClose,
  copy,
  view,
  setView
}: {
  trace: AuditTrace;
  onClose: () => void;
  copy: ProofCopy;
  view: ProofView;
  setView: (view: ProofView) => void;
}) {
  const insight = useMemo(() => buildProofInsight(trace), [trace]);
  const tone = insight.needsCaution ? "attention" : "safe";
  const createdAt = new Date(trace.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <section className={`proof-popup-hero ${tone}`}>
        <span className="proof-popup-hero-icon" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <span className="eyebrow">{copy.heroEyebrow}</span>
          <h4>{insight.needsCaution ? copy.cautionTitle : copy.readyTitle}</h4>
          <p>{insight.needsCaution ? copy.cautionBody : copy.readyBody}</p>
        </div>
        <span className={`proof-status-pill ${tone}`}>{createdAt}</span>
      </section>

      <div className="proof-popup-summary-row" aria-label="Proof summary">
        <span><strong>{trace.fact_details.length}</strong> {copy.factsChecked}</span>
        <span><strong>{trace.tools_used.length}</strong> {copy.checksRun}</span>
        <span><strong>0</strong> {copy.safeClaims}</span>
      </div>

      <div className="proof-view-switch" role="tablist" aria-label="Proof view">
        <button type="button" className={view === "simple" ? "active" : ""} onClick={() => setView("simple")}>
          {copy.simpleTab}
        </button>
        <button type="button" className={view === "map" ? "active" : ""} onClick={() => setView("map")}>
          {copy.mapTab}
        </button>
      </div>

      {view === "simple" ? (
        <SimpleProof trace={trace} insight={insight} copy={copy} />
      ) : (
        <ProofMap trace={trace} insight={insight} copy={copy} />
      )}

      <div className={`proof-popup-callout ${tone}`}>
        <CheckCircle2 size={18} />
        <div>
          <strong>{copy.nextStep}</strong>
          <p>{insight.needsCaution ? copy.nextStepCaution : copy.nextStepReady}</p>
        </div>
      </div>

      <details className="proof-advanced-details">
        <summary>
          <FileText size={16} />
          <span>{copy.reviewerDetails}</span>
          <em>{trace.fact_details.length} {copy.factIds}</em>
        </summary>
        <div className="proof-simple-fact-list">
          {trace.fact_details.slice(0, 8).map((fact) => (
            <FactRow fact={fact} key={fact.fact_id} />
          ))}
        </div>
        <div className="proof-simple-path-list">
          <strong>{copy.graphRoutes}</strong>
          {trace.graph_paths.length ? trace.graph_paths.map((path) => (
            <PathRow copy={copy} key={`${path.path_type}-${path.summary}`} path={path} />
          )) : (
            <p className="proof-empty-detail">{copy.noRoute}</p>
          )}
        </div>
      </details>

      <button type="button" className="proof-popup-done" onClick={onClose}>
        {copy.close}
      </button>
    </>
  );
}

function SimpleProof({ trace, insight, copy }: { trace: AuditTrace; insight: ProofInsight; copy: ProofCopy }) {
  const checks = [
    {
      label: "Seller",
      title: insight.sellerChecked ? "Seller and listing checked" : "Seller proof needs a check",
      body: insight.sellerChecked
        ? "Sarthi looked at seller/listing signals before answering."
        : "Seller-specific proof was not strong in this trace.",
      tone: insight.sellerChecked ? "safe" : "attention"
    },
    {
      label: "Size",
      title: insight.returnRisk ? "Size return signal found" : "Size and return history checked",
      body: insight.returnRisk
        ? "Some past orders mention size returns. Recheck the recommended size."
        : "Order outcomes were used to reduce size guesswork.",
      tone: insight.returnRisk ? "attention" : "safe"
    },
    {
      label: "Reviews",
      title: insight.reviewChecked ? "Review evidence checked" : "Review proof was limited",
      body: insight.reviewChecked
        ? "Relevant reviews were part of the answer."
        : "Use product photos and seller proof carefully.",
      tone: insight.reviewChecked ? "safe" : "attention"
    },
    {
      label: "Offer",
      title: insight.offerChecked ? "Offer or price facts checked" : "Offer proof not used here",
      body: insight.offerChecked
        ? "Sarthi included offer/price evidence where available."
        : "Run checkout offer check before prepaid payment.",
      tone: insight.offerChecked ? "safe" : "attention"
    }
  ];

  return (
    <section className="proof-popup-section">
      <div className="proof-popup-section-title">
        <Route size={18} />
        <div>
          <h4>{copy.simpleTitle}</h4>
          <p>{copy.simpleBody}</p>
        </div>
      </div>
      <div className="proof-popup-check-grid">
        {checks.map((check) => (
          <article className={`proof-popup-check-card ${check.tone}`} key={check.label}>
            <b className="proof-popup-check-icon" aria-hidden="true">
              <CheckCircle2 size={17} />
            </b>
            <div>
              <span>{check.label}</span>
              <strong>{check.title}</strong>
              <p>{check.body}</p>
            </div>
          </article>
        ))}
      </div>
      <div className="proof-simple-path-list">
        <strong>{copy.mostUsefulProof}</strong>
        {trace.fact_details.slice(0, 3).map((fact) => (
          <FactRow fact={fact} key={fact.fact_id} hideCode />
        ))}
      </div>
    </section>
  );
}

function ProofMap({ trace, insight, copy }: { trace: AuditTrace; insight: ProofInsight; copy: ProofCopy }) {
  const primaryPath = trace.graph_paths[0];

  return (
    <section className="proof-graph-panel">
      <div className="proof-popup-section-title">
        <Route size={18} />
        <div>
          <h4>{copy.mapTitle}</h4>
          <p>{copy.mapBody}</p>
        </div>
      </div>
      <div className="proof-graph-map">
        <article className="proof-graph-node start safe">
          <b className="proof-graph-node-icon" aria-hidden="true">1</b>
          <div>
            <span>Start</span>
            <strong>{copy.questionNode}</strong>
            <p>{trace.intent.join(", ") || "Purchase confidence"}</p>
          </div>
        </article>
        <div className="proof-graph-evidence-column">
          <article className={`proof-graph-node ${insight.needsCaution ? "attention" : "safe"}`}>
            <b className="proof-graph-node-icon" aria-hidden="true">2</b>
            <div>
              <span>Checked</span>
              <strong>{copy.evidenceNode}</strong>
              <p>{trace.fact_details.length} records used</p>
            </div>
          </article>
        </div>
        <article className={`proof-graph-node decision ${insight.needsCaution ? "attention" : "safe"}`}>
          <b className="proof-graph-node-icon" aria-hidden="true">3</b>
          <div>
            <span>Answer</span>
            <strong>{copy.decisionNode}</strong>
            <p>{primaryPath?.summary ?? "Decision used direct product facts."}</p>
          </div>
        </article>
      </div>
      <div className="proof-graph-paths-simple">
        <strong>{copy.graphRoutes}</strong>
        {trace.graph_paths.slice(0, 2).map((path) => (
          <PathRow copy={copy} key={`${path.path_type}-${path.summary}`} path={path} />
        ))}
      </div>
    </section>
  );
}

function FactRow({ fact, hideCode = false }: { fact: FactDetail; hideCode?: boolean }) {
  return (
    <div className="proof-simple-fact-row">
      <div>
        <strong>{cleanFactSummary(fact.summary)}</strong>
        <span>{labelize(fact.source_table)} proof</span>
      </div>
      {!hideCode && <code>{fact.fact_id}</code>}
    </div>
  );
}

function PathRow({ path, copy }: { path: GraphPath; copy: ProofCopy }) {
  return (
    <div className="proof-simple-path-row">
      <strong>{cleanFactSummary(path.summary)}</strong>
      <span>{labelize(path.path_type)}</span>
      <small>{path.relationships.length ? path.relationships.join(" -> ") : copy.noRoute}</small>
    </div>
  );
}

type ProofInsight = {
  sellerChecked: boolean;
  reviewChecked: boolean;
  offerChecked: boolean;
  returnRisk: boolean;
  needsCaution: boolean;
};

function buildProofInsight(trace: AuditTrace): ProofInsight {
  const text = [
    ...trace.intent,
    ...trace.tools_used,
    ...trace.fact_details.flatMap((fact) => [fact.summary, fact.source_table, fact.source_type]),
    ...trace.graph_paths.flatMap((path) => [path.summary, path.path_type, ...path.relationships])
  ].join(" ").toLowerCase();

  const returnRisk = /\b(returned|return|too_small|too small|mismatch|risk)\b/.test(text);
  const sellerChecked = /\b(seller|dispatch|listing|verification)\b/.test(text);
  const reviewChecked = /\b(review|rating|fabric|color)\b/.test(text);
  const offerChecked = /\b(offer|price|campaign|inventory)\b/.test(text);

  return {
    sellerChecked,
    reviewChecked,
    offerChecked,
    returnRisk,
    needsCaution: returnRisk || trace.fact_details.length < 4
  };
}

function cleanFactSummary(summary: string) {
  return summary
    .replace(/_/g, " ")
    .replace(/\bkurti\s+3\s+3\s+l\b/gi, "this size")
    .replace(/\border outcome\b/gi, "order result")
    .trim();
}

function labelize(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
