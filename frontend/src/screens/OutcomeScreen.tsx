import { useState } from "react";
import { CheckCircle2, AlertTriangle, ArrowLeft, RotateCcw, Route, ShieldCheck, PackageSearch, RefreshCcw, FileCheck2 } from "lucide-react";
import { getReturnAlternative, simulateOutcome } from "../api/client";
import type { LanguageCode } from "../i18n";
import type { OutcomeResponse, ReturnAlternativeResponse } from "../types/api";

type Props = {
  buyerId: string;
  variantId: string;
  contractId: string | null;
  language?: LanguageCode;
  buyingForSomeoneElse?: boolean;
  wearerLabel?: string;
  onClose: () => void;
};

type SurveyStep = "status" | "keptConfirm" | "reason" | "assistant" | "confirm";
type ReturnReason = "too_small" | "too_large" | "color_different" | "fabric_different" | "damaged" | "delivery_late" | "wrong_item";
type ReturnSeverity = "minor" | "major";
type ReturnPreference = "exchange_ok" | "refund_only";

export function OutcomeScreen({
  buyerId,
  variantId,
  contractId,
  language = "english",
  buyingForSomeoneElse = false,
  wearerLabel = "Myself",
  onClose
}: Props) {
  const [step, setStep] = useState<SurveyStep>("status");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OutcomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosenReason, setChosenReason] = useState<string>("");
  const [assistant, setAssistant] = useState<ReturnAlternativeResponse | null>(null);
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);
  const [severity, setSeverity] = useState<ReturnSeverity>("minor");
  const [preference, setPreference] = useState<ReturnPreference>("exchange_ok");
  const copy = outcomeCopy(language);

  async function submitOutcome(status: "delivered_kept" | "returned" | "exchanged", reasonCode?: ReturnReason) {
    setLoading(true);
    setError(null);
    try {
      const response = await simulateOutcome({
        buyer_id: buyerId,
        variant_id: variantId,
        status,
        return_reason: status === "delivered_kept" ? undefined : (reasonCode || "too_small"),
        contract_id: contractId ?? undefined,
        buying_for_someone_else: buyingForSomeoneElse
      });
      setResult(response);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.saveOutcomeError);
    } finally {
      setLoading(false);
    }
  }

  async function loadReturnAssistant(
    reasonCode: ReturnReason,
    nextSeverity: ReturnSeverity = severity,
    nextPreference: ReturnPreference = preference
  ) {
    setAssistantLoading(true);
    setAssistantError(null);
    setAssistant(null);
    setSeverity(nextSeverity);
    setPreference(nextPreference);
    setStep("assistant");
    try {
      setAssistant(await getReturnAlternative({
        buyer_id: buyerId,
        variant_id: variantId,
        return_reason: reasonCode,
        severity: nextSeverity,
        buyer_preference: nextPreference
      }));
    } catch (err) {
      setAssistantError(err instanceof Error ? err.message : copy.returnOptionsError);
    } finally {
      setAssistantLoading(false);
    }
  }

  const reasons: Array<{ label: string; code: ReturnReason }> = [
    { label: outcomeReasonLabel("too_small", language), code: "too_small" },
    { label: outcomeReasonLabel("too_large", language), code: "too_large" },
    { label: outcomeReasonLabel("color_different", language), code: "color_different" },
    { label: outcomeReasonLabel("fabric_different", language), code: "fabric_different" },
    { label: outcomeReasonLabel("damaged", language), code: "damaged" },
    { label: outcomeReasonLabel("wrong_item", language), code: "wrong_item" },
    { label: outcomeReasonLabel("delivery_late", language), code: "delivery_late" }
  ];
  const selectedReason = reasons.find((reason) => reason.label === chosenReason);

  return (
    <div className="outcome-flow">
      {error && <div className="notice error">{error}</div>}

      {step === "status" && (
        <div className="outcome-step">
          <div className="outcome-contract-chip">
            <FileCheck2 size={15} />
            <span>{copy.returnContract}</span>
          </div>
          <div className="outcome-heading">
            <h4>{copy.didOrderWork}</h4>
            <p>
            {buyingForSomeoneElse
              ? copy.familyMemorySafe.replace("{wearer}", wearerLabel.toLowerCase())
              : copy.selfMemoryUse}
            </p>
          </div>

          <div className="outcome-choice-grid">
            <button
              className="outcome-choice-card kept"
              onClick={() => setStep("keptConfirm")}
              disabled={loading}
            >
              <CheckCircle2 size={24} />
              <span>{copy.keptIt}</span>
              <small>{copy.keptCardHelp}</small>
            </button>

            <button
              className="outcome-choice-card returned"
              onClick={() => setStep("reason")}
              disabled={loading}
            >
              <RotateCcw size={24} />
              <span>{copy.returnedIt}</span>
              <small>{copy.returnedCardHelp}</small>
            </button>
          </div>
        </div>
      )}

      {step === "keptConfirm" && (
        <div className="outcome-step">
          <div className="outcome-reason-header">
            <button
              onClick={() => setStep("status")}
              className="outcome-back-btn"
              aria-label={copy.backToReason}
            >
              <ArrowLeft size={16} />
            </button>
            <h4>{copy.keptConfirmTitle}</h4>
          </div>

          <div className="outcome-contract-preview kept">
            <span><FileCheck2 size={18} /></span>
            <div>
              <strong>{copy.contractFulfilled}</strong>
              <p>{copy.keptConfirmBody}</p>
            </div>
          </div>

          <div className="outcome-contract-checklist">
            <span><CheckCircle2 size={14} />{copy.keptCheckOne}</span>
            <span><ShieldCheck size={14} />{copy.keptCheckTwo}</span>
            <span><PackageSearch size={14} />{copy.keptCheckThree}</span>
          </div>

          <button
            className="outcome-submit-btn"
            onClick={() => submitOutcome("delivered_kept")}
            disabled={loading}
          >
            {loading ? copy.saving : copy.saveKept}
          </button>
        </div>
      )}

      {step === "reason" && (
        <div className="outcome-step">
          <div className="outcome-reason-header">
            <button
              onClick={() => setStep("status")}
              className="outcome-back-btn"
            >
              <ArrowLeft size={16} />
            </button>
            <h4>{copy.whatDidNotWork}</h4>
          </div>

          <div className="outcome-reason-grid">
            {reasons.map((r) => (
              <button
                key={r.label}
                onClick={() => {
                  setChosenReason(r.label);
                  setSeverity(defaultSeverityForReason(r.code));
                  setPreference(defaultPreferenceForReason(r.code));
                }}
                disabled={loading}
                className={chosenReason === r.label ? "selected" : ""}
              >
                <strong>{r.label}</strong>
                <span>{outcomeReasonHint(r.code, language)}</span>
              </button>
            ))}
          </div>

          <button
            className="outcome-submit-btn"
            onClick={() => selectedReason && loadReturnAssistant(selectedReason.code)}
            disabled={loading || !selectedReason}
          >
            {copy.checkBeforeReturn}
          </button>
        </div>
      )}

      {step === "assistant" && selectedReason && (
        <div className="outcome-step">
          <div className="outcome-reason-header">
            <button
              onClick={() => setStep("reason")}
              className="outcome-back-btn"
              aria-label={copy.backToReason}
            >
              <ArrowLeft size={16} />
            </button>
            <h4>{copy.beforeReturn}</h4>
          </div>

          <div className="return-assistant-quick-checks">
            <div>
              <span>{copy.issueSize}</span>
              <div>
                <button
                  type="button"
                  className={severity === "minor" ? "selected" : ""}
                  onClick={() => loadReturnAssistant(selectedReason.code, "minor", preference)}
                  disabled={assistantLoading}
                >
                  {copy.smallIssue}
                </button>
                <button
                  type="button"
                  className={severity === "major" ? "selected" : ""}
                  onClick={() => loadReturnAssistant(selectedReason.code, "major", preference)}
                  disabled={assistantLoading}
                >
                  {copy.cannotUse}
                </button>
              </div>
            </div>
            <div>
              <span>{copy.whatPrefer}</span>
              <div>
                <button
                  type="button"
                  className={preference === "exchange_ok" ? "selected" : ""}
                  onClick={() => loadReturnAssistant(selectedReason.code, severity, "exchange_ok")}
                  disabled={assistantLoading}
                >
                  {copy.exchangeOk}
                </button>
                <button
                  type="button"
                  className={preference === "refund_only" ? "selected" : ""}
                  onClick={() => loadReturnAssistant(selectedReason.code, severity, "refund_only")}
                  disabled={assistantLoading}
                >
                  {copy.refundOnly}
                </button>
              </div>
            </div>
          </div>

          {assistantError && <div className="notice error">{assistantError}</div>}
          {assistantLoading ? (
            <div className="return-assistant-card loading">
              <RefreshCcw size={18} className="spin-icon" />
              <strong>{copy.checkingBetterOption}</strong>
            </div>
          ) : assistant ? (
            <ReturnAssistantCard
              assistant={assistant}
              selectedReason={selectedReason.code}
              language={language}
              onRecommendedAction={() => submitOutcome(
                assistant.suggestion.type === "local_alteration" ? "delivered_kept" : "exchanged",
                selectedReason.code
              )}
              onReturn={() => submitOutcome("returned", selectedReason.code)}
              loading={loading}
            />
          ) : null}
        </div>
      )}

      {step === "confirm" && result && (
        <div className="outcome-confirm-card">
          <div className={`outcome-confirm-icon ${result.expectation_contract?.status === "broken" ? "caution" : "positive"}`}>
            {result.expectation_contract?.status === "broken" ? <AlertTriangle size={36} /> : <CheckCircle2 size={36} />}
          </div>

          <div className="outcome-confirm-copy">
            <strong>
              {result.outcome.status === "exchanged"
                ? copy.exchangeCaptured
                : result.expectation_contract?.status === "broken"
                ? copy.expectationGapCaptured
                : copy.outcomeSaved}
            </strong>
            <span>
              {copy.aggregateRefresh}
            </span>
          </div>

          <div className={`outcome-contract-result ${result.expectation_contract?.status === "broken" ? "broken" : "kept"}`}>
            <span>{result.expectation_contract?.status === "broken" ? <AlertTriangle size={18} /> : <FileCheck2 size={18} />}</span>
            <div>
              <small>{copy.returnContract}</small>
              <strong>{result.expectation_contract?.status === "broken" ? copy.contractBrokenResult : copy.contractKeptResult}</strong>
              <p>{result.expectation_contract?.status === "broken" ? copy.contractResultBrokenCopy : copy.contractResultKeptCopy}</p>
            </div>
          </div>

          <OutcomeLoopCard
            status={result.outcome.status}
            selectedReason={selectedReason?.label ?? chosenReason}
            memoryUpdated={result.outcome.memory_update.updated}
            graphSynced={result.graph_sync.available}
            language={language}
          />

          <div className="outcome-confirm-facts">
            <div className="kv-row">
              <span>{copy.outcomeId}</span>
              <strong><code>{result.outcome.fact_id}</code></strong>
            </div>
            <div className="kv-row">
              <span>{copy.fitMemory}</span>
              <strong>{result.outcome.memory_update.updated ? copy.updated : copy.noChangeNeeded}</strong>
            </div>
            <div className="kv-row">
              <span>{copy.expectationContract}</span>
              <strong className={`ui-badge ${result.expectation_contract?.status === "broken" ? "caution" : "positive"}`}>
                {result.expectation_contract
                  ? labelize(result.expectation_contract.status)
                  : copy.notAttached}
              </strong>
            </div>
            {result.expectation_contract?.broken_dimension && (
              <div className="kv-row">
                <span>{copy.brokenArea}</span>
                <strong>{labelize(result.expectation_contract.broken_dimension)}</strong>
              </div>
            )}
            <div className="kv-row">
              <span>{copy.evidenceMap}</span>
              <strong>{result.graph_sync.available ? copy.synced : copy.groundedFactsActive}</strong>
            </div>
          </div>

          <button
            className="outcome-done-btn"
            onClick={onClose}
          >
            {copy.done}
          </button>
        </div>
      )}
    </div>
  );
}

function ReturnAssistantCard({
  assistant,
  selectedReason,
  language,
  onRecommendedAction,
  onReturn,
  loading
}: {
  assistant: ReturnAlternativeResponse;
  selectedReason: ReturnReason;
  language: LanguageCode;
  onRecommendedAction: () => void;
  onReturn: () => void;
  loading: boolean;
}) {
  const recommended = assistant.suggestion.recommended;
  const canExchange = assistant.suggestion.type === "exchange_size" || assistant.suggestion.type === "local_alteration";
  const copy = outcomeCopy(language);
  const reasonTrace = returnAssistantReasonTrace(assistant, selectedReason);
  return (
    <div className={`return-assistant-card ${recommended ? "recommended" : "return-valid"}`}>
      <div className="return-assistant-head">
        <span className="return-assistant-icon">
          {recommended ? <Route size={18} /> : <ShieldCheck size={18} />}
        </span>
        <div>
          <span className="eyebrow">{copy.returnAssistant}</span>
          <strong>{assistant.suggestion.title}</strong>
          <p>{assistant.suggestion.summary}</p>
        </div>
      </div>

      <div className="return-agent-trace">
        <div><span>{copy.observe}</span><strong>{outcomeReasonLabel(selectedReason, language)}</strong></div>
        <div><span>{copy.reason}</span><strong>{reasonTrace}</strong></div>
        <div><span>{copy.act}</span><strong>{assistant.suggestion.primary_action}</strong></div>
      </div>

      <div className="return-assistant-reasons">
        {assistant.suggestion.reasons.slice(0, 3).map((reason) => (
          <p key={reason}><CheckCircle2 size={13} /> {reason}</p>
        ))}
      </div>

      {assistant.suggestion.caution && (
        <div className="return-assistant-caution">
          <AlertTriangle size={14} />
          <span>{assistant.suggestion.caution}</span>
        </div>
      )}

      <div className="return-assistant-actions">
        {recommended && canExchange && (
          <button type="button" className="outcome-submit-btn" onClick={onRecommendedAction} disabled={loading}>
            {loading ? copy.saving : assistant.suggestion.primary_action}
          </button>
        )}
        <button type="button" className="outcome-done-btn secondary" onClick={onReturn} disabled={loading}>
          {loading ? copy.saving : copy.continueReturn}
        </button>
      </div>
    </div>
  );
}

function OutcomeLoopCard({
  status,
  selectedReason,
  memoryUpdated,
  graphSynced,
  language
}: {
  status: string;
  selectedReason: string;
  memoryUpdated: boolean;
  graphSynced: boolean;
  language: LanguageCode;
}) {
  const returned = status === "returned" || status === "exchanged";
  const exchanged = status === "exchanged";
  const copy = outcomeCopy(language);
  const returnReason = selectedReason || copy.returnReason;
  const items = returned
    ? [
        {
          label: copy.buyerMemory,
          value: memoryUpdated
            ? copy.returnMemoryUpdated.replace("{reason}", returnReason)
            : copy.returnMemoryNoChange,
          icon: <ShieldCheck size={15} />
        },
        {
          label: copy.sellerSignal,
          value: copy.aggregateSellerSignal,
          icon: <PackageSearch size={15} />
        },
        {
          label: copy.returnRescue,
          value: exchanged
            ? copy.exchangeVisible
            : copy.returnRescueCopy,
          icon: <Route size={15} />
        }
      ]
    : [
        {
          label: copy.buyerMemory,
          value: memoryUpdated
            ? copy.keptMemoryUpdated
            : copy.keptMemoryNoPrivateData,
          icon: <ShieldCheck size={15} />
        },
        {
          label: copy.sellerSignal,
          value: copy.keptSellerSignal,
          icon: <PackageSearch size={15} />
        },
        {
          label: copy.graphLoop,
          value: graphSynced
            ? copy.graphSynced
            : copy.groundedFactsStayActive,
          icon: <Route size={15} />
        }
      ];

  return (
    <div className={`outcome-loop-card ${returned ? "returned" : "kept"}`}>
      <div className="outcome-loop-header">
        <span className="eyebrow">{exchanged ? copy.exchangeLoop : returned ? copy.returnLoop : copy.trustLoop}</span>
        <strong>{exchanged ? copy.afterExchange : returned ? copy.afterReturn : copy.afterKept}</strong>
      </div>
      <div className="outcome-loop-list">
        {items.map((item) => (
          <div key={item.label}>
            <span>{item.icon}{item.label}</span>
            <p>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

type OutcomeCopyKey =
  | "didOrderWork"
  | "familyMemorySafe"
  | "selfMemoryUse"
  | "keptIt"
  | "returnedIt"
  | "returnContract"
  | "keptCardHelp"
  | "returnedCardHelp"
  | "keptConfirmTitle"
  | "contractFulfilled"
  | "keptConfirmBody"
  | "keptCheckOne"
  | "keptCheckTwo"
  | "keptCheckThree"
  | "saveKept"
  | "whatDidNotWork"
  | "checkBeforeReturn"
  | "backToReason"
  | "beforeReturn"
  | "issueSize"
  | "smallIssue"
  | "cannotUse"
  | "whatPrefer"
  | "exchangeOk"
  | "refundOnly"
  | "checkingBetterOption"
  | "exchangeCaptured"
  | "expectationGapCaptured"
  | "outcomeSaved"
  | "aggregateRefresh"
  | "contractBrokenResult"
  | "contractKeptResult"
  | "contractResultBrokenCopy"
  | "contractResultKeptCopy"
  | "outcomeId"
  | "fitMemory"
  | "updated"
  | "noChangeNeeded"
  | "expectationContract"
  | "notAttached"
  | "brokenArea"
  | "evidenceMap"
  | "synced"
  | "groundedFactsActive"
  | "done"
  | "returnAssistant"
  | "observe"
  | "reason"
  | "act"
  | "saving"
  | "continueReturn"
  | "returnReason"
  | "buyerMemory"
  | "returnMemoryUpdated"
  | "returnMemoryNoChange"
  | "sellerSignal"
  | "aggregateSellerSignal"
  | "returnRescue"
  | "exchangeVisible"
  | "returnRescueCopy"
  | "keptMemoryUpdated"
  | "keptMemoryNoPrivateData"
  | "keptSellerSignal"
  | "graphLoop"
  | "graphSynced"
  | "groundedFactsStayActive"
  | "exchangeLoop"
  | "returnLoop"
  | "trustLoop"
  | "afterExchange"
  | "afterReturn"
  | "afterKept"
  | "saveOutcomeError"
  | "returnOptionsError";

const OUTCOME_COPY: Record<LanguageCode, Record<OutcomeCopyKey, string>> = {
  english: {
    didOrderWork: "Did this order work for you?",
    familyMemorySafe: "Marked for {wearer}. This helps product trust but will not change your size memory.",
    selfMemoryUse: "This feedback updates your fit memory and checks whether the pre-order promise was met.",
    keptIt: "Kept it",
    returnedIt: "Returned it",
    returnContract: "Return contract",
    keptCardHelp: "Promise matched. Update trust.",
    returnedCardHelp: "Find return, exchange, or refund path.",
    keptConfirmTitle: "Confirm kept outcome",
    contractFulfilled: "Contract fulfilled",
    keptConfirmBody: "Sarthi will close the pre-order promise and add a positive SKU outcome after quality checks.",
    keptCheckOne: "No return reason needed",
    keptCheckTwo: "Private buyer memory stays protected",
    keptCheckThree: "Seller sees only aggregate proof",
    saveKept: "Save kept outcome",
    whatDidNotWork: "What did not work?",
    checkBeforeReturn: "Check before return",
    backToReason: "Back to return reason",
    beforeReturn: "Before return",
    issueSize: "How serious is it?",
    smallIssue: "Can still use with a fix",
    cannotUse: "Cannot use as received",
    whatPrefer: "Preferred resolution",
    exchangeOk: "Replacement or exchange ok",
    refundOnly: "Refund only",
    checkingBetterOption: "Sarthi is checking a better option...",
    exchangeCaptured: "Exchange path captured.",
    expectationGapCaptured: "Expectation gap captured.",
    outcomeSaved: "Outcome saved and contract closed.",
    aggregateRefresh: "Product confidence refreshes after quality checks.",
    contractBrokenResult: "Contract gap recorded",
    contractKeptResult: "Promise marked as kept",
    contractResultBrokenCopy: "The issue is now attached to the original proof promise and shared only as aggregate seller feedback.",
    contractResultKeptCopy: "This kept order becomes evidence that future buyers can trust after quality checks.",
    outcomeId: "Outcome ID",
    fitMemory: "Fit memory",
    updated: "Updated",
    noChangeNeeded: "No change needed",
    expectationContract: "Expectation contract",
    notAttached: "Not attached",
    brokenArea: "Broken area",
    evidenceMap: "Evidence map",
    synced: "Synced",
    groundedFactsActive: "Grounded facts active",
    done: "Done",
    returnAssistant: "Sarthi return assistant",
    observe: "Observe",
    reason: "Reason",
    act: "Act",
    saving: "Saving...",
    continueReturn: "Continue return",
    returnReason: "Return reason",
    buyerMemory: "Buyer memory",
    returnMemoryUpdated: "{reason} will reduce similar mistakes in future recommendations.",
    returnMemoryNoChange: "No private fit-memory change was needed for this return.",
    sellerSignal: "Seller signal",
    aggregateSellerSignal: "Only aggregate reason counts are shared, so sellers can fix size, color, fabric, or packaging issues.",
    returnRescue: "Return help",
    exchangeVisible: "The exchange remains visible without counting like a normal kept order.",
    returnRescueCopy: "A clean return can move to exchange, nearby demand, or faster relisting.",
    keptMemoryUpdated: "Your retained size signal improves future fit decisions.",
    keptMemoryNoPrivateData: "This kept order strengthens confidence without exposing private buyer data.",
    keptSellerSignal: "A kept outcome adds positive SKU evidence after quality checks.",
    graphLoop: "Evidence loop",
    graphSynced: "Future decision evidence is refreshed with this outcome.",
    groundedFactsStayActive: "Grounded facts stay active until evidence sync is available.",
    exchangeLoop: "Exchange loop",
    returnLoop: "Return loop",
    trustLoop: "Trust loop",
    afterExchange: "What happens after this exchange",
    afterReturn: "What happens after this return",
    afterKept: "How this improves future checks",
    saveOutcomeError: "Could not save order outcome.",
    returnOptionsError: "Could not check return options."
  },
  hindi: {
    didOrderWork: "Order aapke kaam aaya?",
    familyMemorySafe: "{wearer} ke liye marked hai. Product trust improve hoga, par aapki size memory nahi badlegi.",
    selfMemoryUse: "Ye feedback aapki fit memory aur pre-order promise check ko update karta hai.",
    keptIt: "Rakh liya",
    returnedIt: "Return kiya",
    returnContract: "Return contract",
    keptCardHelp: "Promise match hua. Trust update hoga.",
    returnedCardHelp: "Return, exchange, ya refund path check karo.",
    keptConfirmTitle: "Kept outcome confirm karo",
    contractFulfilled: "Contract fulfilled",
    keptConfirmBody: "Sarthi pre-order promise close karega aur quality check ke baad positive SKU outcome add karega.",
    keptCheckOne: "Return reason nahi chahiye",
    keptCheckTwo: "Private buyer memory protected rahegi",
    keptCheckThree: "Seller ko sirf aggregate proof milega",
    saveKept: "Kept outcome save karo",
    whatDidNotWork: "Kya problem thi?",
    checkBeforeReturn: "Return se pehle check",
    backToReason: "Return reason par wapas",
    beforeReturn: "Return se pehle",
    issueSize: "Problem kitni serious hai?",
    smallIssue: "Fix ke baad use ho sakta hai",
    cannotUse: "Jaise mila use nahi ho sakta",
    whatPrefer: "Aap kya chahte ho?",
    exchangeOk: "Replacement/exchange theek hai",
    refundOnly: "Sirf refund",
    checkingBetterOption: "Sarthi better option check kar raha hai...",
    exchangeCaptured: "Exchange path save ho gaya.",
    expectationGapCaptured: "Promise gap save ho gaya.",
    outcomeSaved: "Feedback save ho gaya.",
    aggregateRefresh: "Quality check ke baad product confidence refresh hoga.",
    contractBrokenResult: "Contract gap record hua",
    contractKeptResult: "Promise kept mark hua",
    contractResultBrokenCopy: "Issue original proof promise se attach hua, seller ko sirf aggregate feedback milega.",
    contractResultKeptCopy: "Ye kept order quality check ke baad future buyers ke liye evidence banega.",
    outcomeId: "Outcome ID",
    fitMemory: "Fit memory",
    updated: "Updated",
    noChangeNeeded: "Change nahi chahiye",
    expectationContract: "Promise snapshot",
    notAttached: "Attach nahi hai",
    brokenArea: "Problem area",
    evidenceMap: "Proof map",
    synced: "Synced",
    groundedFactsActive: "Proof facts active",
    done: "Done",
    returnAssistant: "Sarthi return helper",
    observe: "Dekha",
    reason: "Socha",
    act: "Action",
    saving: "Saving...",
    continueReturn: "Return continue karo",
    returnReason: "Return reason",
    buyerMemory: "Buyer memory",
    returnMemoryUpdated: "{reason} future recommendations me same galti kam karega.",
    returnMemoryNoChange: "Is return me private fit-memory change nahi hua.",
    sellerSignal: "Seller signal",
    aggregateSellerSignal: "Seller ko sirf total reason counts milte hain, private memory nahi.",
    returnRescue: "Return help",
    exchangeVisible: "Exchange visible rahega, normal kept order jaisa count nahi hoga.",
    returnRescueCopy: "Clean return exchange, nearby demand, ya faster relisting me help kar sakta hai.",
    keptMemoryUpdated: "Aapka retained size signal future fit ko better karega.",
    keptMemoryNoPrivateData: "Kept order confidence badhata hai, private buyer data share nahi hota.",
    keptSellerSignal: "Kept outcome quality check ke baad SKU proof ko improve karta hai.",
    graphLoop: "Proof loop",
    graphSynced: "Future decision proof is outcome se refresh hoga.",
    groundedFactsStayActive: "Evidence sync tak grounded facts active rahenge.",
    exchangeLoop: "Exchange loop",
    returnLoop: "Return loop",
    trustLoop: "Trust loop",
    afterExchange: "Is exchange ke baad kya hoga",
    afterReturn: "Is return ke baad kya hoga",
    afterKept: "Future checks kaise better honge",
    saveOutcomeError: "Order feedback save nahi hua.",
    returnOptionsError: "Return options check nahi ho paye."
  },
  hinglish: {
    didOrderWork: "Order kaam aaya?",
    familyMemorySafe: "{wearer} ke liye marked. Product trust improve hoga, aapki size memory nahi badlegi.",
    selfMemoryUse: "Feedback aapki fit memory aur order promise check ko update karta hai.",
    keptIt: "Kept it",
    returnedIt: "Returned it",
    returnContract: "Return contract",
    keptCardHelp: "Promise matched. Trust update hoga.",
    returnedCardHelp: "Return, exchange, ya refund path check karo.",
    keptConfirmTitle: "Confirm kept outcome",
    contractFulfilled: "Contract fulfilled",
    keptConfirmBody: "Sarthi pre-order promise close karega and quality checks ke baad positive SKU outcome add karega.",
    keptCheckOne: "No return reason needed",
    keptCheckTwo: "Private buyer memory protected rahegi",
    keptCheckThree: "Seller sees aggregate proof only",
    saveKept: "Save kept outcome",
    whatDidNotWork: "Kya issue tha?",
    checkBeforeReturn: "Return se pehle check",
    backToReason: "Back to return reason",
    beforeReturn: "Before return",
    issueSize: "How serious?",
    smallIssue: "Can use with a fix",
    cannotUse: "Cannot use as received",
    whatPrefer: "Preference?",
    exchangeOk: "Replacement/exchange ok",
    refundOnly: "Refund only",
    checkingBetterOption: "Sarthi better option check kar raha hai...",
    exchangeCaptured: "Exchange path saved.",
    expectationGapCaptured: "Expectation gap saved.",
    outcomeSaved: "Outcome saved.",
    aggregateRefresh: "Quality checks ke baad product confidence refresh hoga.",
    contractBrokenResult: "Contract gap recorded",
    contractKeptResult: "Promise marked kept",
    contractResultBrokenCopy: "Issue original proof promise se attach ho gaya, seller ko aggregate feedback milega.",
    contractResultKeptCopy: "This kept order future buyers ke liye evidence banega after quality checks.",
    outcomeId: "Outcome ID",
    fitMemory: "Fit memory",
    updated: "Updated",
    noChangeNeeded: "No change",
    expectationContract: "Expectation snapshot",
    notAttached: "Not attached",
    brokenArea: "Issue area",
    evidenceMap: "Proof map",
    synced: "Synced",
    groundedFactsActive: "Grounded facts active",
    done: "Done",
    returnAssistant: "Sarthi return helper",
    observe: "Observe",
    reason: "Reason",
    act: "Act",
    saving: "Saving...",
    continueReturn: "Continue return",
    returnReason: "Return reason",
    buyerMemory: "Buyer memory",
    returnMemoryUpdated: "{reason} future recommendations me same mistake kam karega.",
    returnMemoryNoChange: "Private fit-memory change needed nahi tha.",
    sellerSignal: "Seller signal",
    aggregateSellerSignal: "Seller ko sirf aggregate reasons milte hain, private memory nahi.",
    returnRescue: "Return help",
    exchangeVisible: "Exchange visible rahega without counting like a normal kept order.",
    returnRescueCopy: "Clean return exchange, nearby demand, ya faster relisting me help karta hai.",
    keptMemoryUpdated: "Retained size signal future fit decisions improve karta hai.",
    keptMemoryNoPrivateData: "Kept order confidence badhata hai without private buyer data exposure.",
    keptSellerSignal: "Kept outcome quality checks ke baad SKU evidence improve karta hai.",
    graphLoop: "Evidence loop",
    graphSynced: "Future decision evidence refresh ho gaya.",
    groundedFactsStayActive: "Evidence sync tak grounded facts active rahenge.",
    exchangeLoop: "Exchange loop",
    returnLoop: "Return loop",
    trustLoop: "Trust loop",
    afterExchange: "Exchange ke baad kya hoga",
    afterReturn: "Return ke baad kya hoga",
    afterKept: "Future checks kaise improve honge",
    saveOutcomeError: "Order outcome save nahi hua.",
    returnOptionsError: "Return options check nahi hue."
  }
};

const OUTCOME_REASON_LABELS: Record<LanguageCode, Record<ReturnReason, string>> = {
  english: {
    too_small: "Wrong size - small",
    too_large: "Wrong size - large",
    color_different: "Item looked different",
    fabric_different: "Quality or material issue",
    damaged: "Damaged or defective",
    wrong_item: "Wrong item received",
    delivery_late: "Delivery issue"
  },
  hindi: {
    too_small: "Size chhota",
    too_large: "Size bada",
    color_different: "Item alag dikha",
    fabric_different: "Quality/material issue",
    damaged: "Damaged/defective",
    wrong_item: "Wrong item mila",
    delivery_late: "Delivery issue"
  },
  hinglish: {
    too_small: "Wrong size - small",
    too_large: "Wrong size - large",
    color_different: "Item looked different",
    fabric_different: "Quality/material issue",
    damaged: "Damaged/defective",
    wrong_item: "Wrong item received",
    delivery_late: "Delivery issue"
  }
};

function outcomeReasonHint(reason: ReturnReason, language: LanguageCode) {
  const english: Record<ReturnReason, string> = {
    too_small: "Size or capacity was smaller than expected.",
    too_large: "Size, fit, or dimensions did not work.",
    color_different: "Appearance did not match listing proof.",
    fabric_different: "Build, texture, or material quality felt different.",
    damaged: "Broken, defective, or unsafe to keep.",
    wrong_item: "The delivered item is not what you ordered.",
    delivery_late: "Timing or delivery promise failed."
  };
  const simple: Record<ReturnReason, string> = {
    too_small: "Size/capacity expected se small tha.",
    too_large: "Size, fit, ya dimensions kaam nahi aaye.",
    color_different: "Listing proof se appearance match nahi hua.",
    fabric_different: "Quality, texture, ya material different laga.",
    damaged: "Broken, defective, ya unsafe hai.",
    wrong_item: "Ordered item se different item mila.",
    delivery_late: "Delivery timing ya promise fail hua."
  };
  return language === "english" ? english[reason] : simple[reason];
}

function defaultSeverityForReason(reason: ReturnReason): ReturnSeverity {
  return ["damaged", "wrong_item", "delivery_late"].includes(reason) ? "major" : "minor";
}

function defaultPreferenceForReason(reason: ReturnReason): ReturnPreference {
  return reason === "delivery_late" ? "refund_only" : "exchange_ok";
}

function returnAssistantReasonTrace(assistant: ReturnAlternativeResponse, reason: ReturnReason) {
  if ((reason === "too_small" || reason === "too_large") && assistant.evidence.recommended_size) {
    return `${assistant.evidence.selected_size} to ${assistant.evidence.recommended_size}`;
  }
  if (reason === "wrong_item") return "Replacement or refund route";
  if (reason === "delivery_late") return "Delivery promise check";
  if (reason === "damaged") return "Return eligibility check";
  if (reason === "color_different") return "Listing match check";
  if (reason === "fabric_different") return "Quality proof check";
  return "Return guardrail check";
}

function outcomeCopy(language: LanguageCode) {
  return OUTCOME_COPY[language] ?? OUTCOME_COPY.english;
}

function outcomeReasonLabel(reason: ReturnReason, language: LanguageCode) {
  return OUTCOME_REASON_LABELS[language]?.[reason] ?? OUTCOME_REASON_LABELS.english[reason];
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}
