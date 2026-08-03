import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileSearch,
  Maximize2,
  MessageCircle,
  Minimize2,
  PackageCheck,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  Star,
  UserCheck,
  UsersRound,
  X,
  type LucideIcon
} from "lucide-react";
import type {
  ClusterKnowledgeGraph,
  KnowledgeGraphChatResponse,
  KnowledgeGraphEdge,
  KnowledgeGraphEvidencePath,
  KnowledgeGraphNode
} from "../types/api";

type Props = {
  graph: ClusterKnowledgeGraph | null;
  answer: KnowledgeGraphChatResponse | null;
  query: string;
  loading: boolean;
  asking: boolean;
  error: string | null;
  onQueryChange: (value: string) => void;
  onAsk: (query: string) => void;
  onOpenProof: (traceId: string) => void;
  onRequestProof?: () => void;
  proofRequestState?: "idle" | "loading" | "sent";
  onRetry?: () => void;
};

type SellerContext = ClusterKnowledgeGraph["seller_context"][number];
type EvidenceTone = "safe" | "watch" | "danger" | "private";
type GraphNodeCategory = "product" | "seller" | "evidence" | "cohort";
type TrustGuideKey = "score" | "proof" | "reviews" | "fit" | "offer";

type ViewNode = KnowledgeGraphNode & {
  x: number;
  y: number;
  title: string;
  value: string;
  tone: EvidenceTone;
  category: GraphNodeCategory;
  Icon: LucideIcon;
};

type ViewEdge = KnowledgeGraphEdge & {
  sourceNode: ViewNode;
  targetNode: ViewNode;
  labelShort: string;
  tone: EvidenceTone;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  path: string;
  showLabel: boolean;
};

type GraphView = {
  nodes: ViewNode[];
  edges: ViewEdge[];
};

type TrustGuideCard = {
  key: TrustGuideKey;
  label: string;
  value: string;
  detail: string;
  chips: string[];
  question: string;
  tone: EvidenceTone;
  Icon: LucideIcon;
  nodeIds: string[];
  edgeIds: string[];
  pathId?: string | null;
  filter: "all" | GraphNodeCategory;
};

type GraphAnswerAction = {
  key: string;
  label: string;
  detail: string;
  tone: "primary" | "secondary" | "neutral";
  disabled?: boolean;
  Icon: LucideIcon;
  onClick: () => void;
};

type ProofMapPreviewItem = {
  key: string;
  label: string;
  detail: string;
  pathId?: string | null;
  edgeId?: string | null;
};

type GraphEmptyCopy = {
  title: string;
  body: string;
  detail: string;
  primaryAction: string;
};

const COMPACT_NODE_LAYOUT: Array<{ key: string; x: number; y: number }> = [
  { key: "seller", x: 13, y: 28 },
  { key: "sku", x: 13, y: 68 },
  { key: "returns", x: 39, y: 28 },
  { key: "reviews", x: 39, y: 68 },
  { key: "proof", x: 66, y: 28 },
  { key: "offer", x: 66, y: 68 },
  { key: "score", x: 88, y: 48 }
];

const FULL_NODE_LAYOUT: Array<{ key: string; x: number; y: number }> = [
  { key: "product", x: 9, y: 16 },
  { key: "seller", x: 9, y: 42 },
  { key: "buyer_fit", x: 9, y: 72 },
  { key: "sku", x: 29, y: 46 },
  { key: "returns", x: 48, y: 22 },
  { key: "reviews", x: 48, y: 62 },
  { key: "proof", x: 69, y: 20 },
  { key: "offer", x: 69, y: 56 },
  { key: "price", x: 69, y: 82 },
  { key: "score", x: 91, y: 48 }
];

export function KnowledgeGraphExplorer({
  graph,
  answer,
  query,
  loading,
  asking,
  error,
  onQueryChange,
  onAsk,
  onOpenProof,
  onRequestProof,
  proofRequestState = "idle",
  onRetry
}: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | GraphNodeCategory>("all");
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [answerPulse, setAnswerPulse] = useState(false);
  const [activeGuide, setActiveGuide] = useState<TrustGuideKey>("score");
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    if (!answer) return;
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedPathId(null);
    setAnswerPulse(true);
    const timeout = window.setTimeout(() => setAnswerPulse(false), 2400);
    return () => window.clearTimeout(timeout);
  }, [answer?.trace_id]);

  if (loading) {
    return (
      <div className="kg-card loading">
        <div className="kg-card-header">
          <div>
            <span className="eyebrow">Proof check</span>
            <h3>Checking facts</h3>
          </div>
          <span className="kg-live-pill">Live</span>
        </div>
        <div className="kg-loading-grid">
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  if (error && !graph) {
    return (
      <div className="kg-card error">
        <div className="kg-card-header">
          <div>
            <span className="eyebrow">Proof check</span>
            <h3>Could not load facts</h3>
          </div>
        </div>
        <p>{error}</p>
        {onRetry && (
          <button type="button" className="kg-retry-button" onClick={onRetry}>
            <RefreshCw size={14} />
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!graph) return null;

  const evidencePathSource = answer?.evidence_paths?.length ? answer.evidence_paths : graph.evidence_paths ?? [];
  const visibleEvidencePaths = evidencePathSource.slice(0, expanded ? 3 : 3);
  const matchedPathIds = new Set(answer?.answer.matched_path_ids ?? []);
  const winnerContext = selectedSellerContext(graph);
  const trustGuides = buildTrustGuideCards(graph, winnerContext, visibleEvidencePaths, answer);
  const activeTrustGuide = trustGuides.find((guide) => guide.key === activeGuide) ?? trustGuides[0];
  const activePathId = selectedPathId ?? activeTrustGuide?.pathId ?? null;
  const selectedPath = activePathId
    ? visibleEvidencePaths.find((path) => path.path_id === activePathId) ?? null
    : null;
  const pathNodeIds = new Set([...(selectedPath?.node_ids ?? []), ...(activeTrustGuide?.nodeIds ?? [])]);
  const pathEdgeIds = new Set([...(selectedPath?.edge_ids ?? []), ...(activeTrustGuide?.edgeIds ?? [])]);
  const matchedNodeIds = new Set([...(answer?.answer.matched_node_ids ?? []), ...pathNodeIds]);
  const highlightedEdgeIds = new Set([...(answer?.answer.highlighted_edge_ids ?? []), ...pathEdgeIds]);
  const graphView = buildGraphView(graph, winnerContext, highlightedEdgeIds, expanded);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleNodes = graphView.nodes.filter((node) => {
    const typeMatch = typeFilter === "all" || node.category === typeFilter;
    const textMatch = !normalizedSearch || `${node.title} ${node.value} ${node.subtitle}`.toLowerCase().includes(normalizedSearch);
    return typeMatch && textMatch;
  });
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graphView.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
  const proofMapPreview = buildProofMapPreview(visibleEvidencePaths, visibleEdges, activeTrustGuide);
  const graphEmptyState = mapOpen && (visibleNodes.length === 0 || visibleEdges.length === 0)
    ? graphEmptyCopy(activeTrustGuide, visibleNodes.length, searchTerm)
    : null;
  const ActiveGuideIcon = activeTrustGuide?.Icon ?? ShieldCheck;
  const selectedNode = selectedNodeId
    ? visibleNodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const selectedEdge = selectedEdgeId
    ? visibleEdges.find((edge) => edge.id === selectedEdgeId) ?? null
    : null;
  const selectedNodeConnections = selectedNode
    ? visibleEdges.filter((edge) => edge.source === selectedNode.id || edge.target === selectedNode.id).slice(0, 5)
    : [];
  const focus = buildGraphFocus({
    selectedNodeId,
    selectedEdgeId,
    selectedEdge,
    matchedNodeIds,
    highlightedEdgeIds,
    visibleNodes,
    visibleEdges,
    answerText: answer
      ? [answer.answer.query, answer.answer.title, answer.answer.summary, ...answer.answer.reasons, answer.answer.caution ?? ""].join(" ")
      : "",
    answerActive: Boolean(answer)
  });
  const engineLabel = "Evidence map";
  const similarity = graph.summary.similarity;
  const aiLabel = answer?.agent?.provider === "bedrock" || answer?.agent?.provider === "gemini"
    ? "AI answer"
    : answer
      ? "Proof answer"
      : "Ask Sarthi";
  const similarityLabel = similarity?.agent?.provider === "bedrock" || similarity?.agent?.provider === "gemini"
    ? similarity.agent.used
      ? similarity.agent.image_inputs > 0
        ? `Image match ${similarity.agent.image_inputs} photos`
        : "Image match ready"
      : `Image match ${similarity.agent.status}`
    : similarity
      ? `${similarity.distinct_seller_count} similar sellers`
      : null;
  const followUpSuggestions = (answer?.answer.follow_up_questions?.length ? answer.answer.follow_up_questions : graph.chat_suggestions).slice(0, 3);
  const answerFacts = answer?.answer.fact_ids?.length ?? 0;
  const answerPaths = answer?.answer.matched_path_ids?.length ?? 0;
  const answerActions = answer
    ? buildGraphAnswerActions(answer, followUpSuggestions, {
        openProof: () => onOpenProof(answer.trace_id),
        requestProof: onRequestProof,
        proofRequestState,
        askFollowUp: (suggestion) => {
          onQueryChange(suggestion);
          onAsk(suggestion);
        }
      })
    : [];

  return (
    <>
      {expanded && (
        <button
          type="button"
          className="kg-expanded-scrim"
          onClick={() => setExpanded(false)}
          aria-label="Close full graph"
        />
      )}
      <div className={`kg-card kg-simple-card ${mapOpen ? "map-open" : ""} ${expanded ? "graph-expanded" : ""}`}>
      <div className="kg-card-header kg-simple-header">
        <div>
          <span className="eyebrow">Proof graph</span>
          <h3>What affects trust</h3>
          <p>{graph.summary.body}</p>
        </div>
        <span className="kg-live-pill">{graph.summary.fact_count} facts</span>
      </div>

      <div className="kg-system-strip" aria-label="Runtime status">
        <span><ShieldCheck size={13} /> {engineLabel}</span>
        <span><MessageCircle size={13} /> {aiLabel}</span>
        {similarityLabel && (
          <span><PackageCheck size={13} /> {similarityLabel}</span>
        )}
      </div>

      <section className={`kg-guide-panel ${activeTrustGuide?.tone ?? "watch"}`} aria-label="Tap a concern to inspect trust evidence">
        <div className="kg-guide-score">
          <span>{activeTrustGuide?.label ?? "Trust"}</span>
          <strong>{activeTrustGuide?.value ?? "--"}</strong>
          <small>{activeTrustGuide?.detail ?? "Tap a check to see connected proof."}</small>
        </div>
        <div className="kg-guide-actions" role="list" aria-label="Trust concerns">
          {trustGuides.map((guide) => {
            const Icon = guide.Icon;
            const active = guide.key === activeTrustGuide?.key;
            return (
              <button
                key={guide.key}
                type="button"
                className={`kg-guide-action ${guide.tone} ${active ? "active" : ""}`}
                onClick={() => {
                  setActiveGuide(guide.key);
                  setTypeFilter(guide.filter);
                  setSelectedPathId(guide.pathId ?? null);
                  setSelectedEdgeId(null);
                  setSelectedNodeId(null);
                  onQueryChange(guide.question);
                }}
                aria-pressed={active}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{guide.label}</span>
                <b>{guide.value}</b>
              </button>
            );
          })}
        </div>
        {activeTrustGuide && activeGuide !== "score" && (
          <div className={`kg-guide-result ${activeTrustGuide.tone}`} aria-live="polite">
            <span className="kg-guide-result-icon" aria-hidden="true">
              <ActiveGuideIcon size={15} />
            </span>
            <div className="kg-guide-copy">
              <strong>{guideHeadline(activeTrustGuide)}</strong>
              <span>{activeTrustGuide.detail}</span>
            </div>
            <div className="kg-guide-chips">
              {activeTrustGuide.chips.slice(0, 2).map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="kg-chat-box kg-chat-priority">
        <div className={`kg-chat-status ${answer?.answer.unsupported ? "unsupported" : ""}`} aria-live="polite">
          <MessageCircle size={13} />
          <span>{asking ? "Checking evidence" : answer ? "Answer grounded in proof" : "Ask about this item"}</span>
          <b>{answer ? `${answerFacts} facts` : `${graph.summary.fact_count} facts ready`}</b>
        </div>

        <form
          className="kg-chat-input"
          onSubmit={(event) => {
            event.preventDefault();
            const prompt = query.trim();
            if (prompt) onAsk(prompt);
          }}
        >
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Ask in simple words"
          />
          <button type="submit" disabled={asking || !query.trim()} aria-label="Ask Sarthi">
            {asking ? <MessageCircle size={14} /> : <Send size={14} />}
            <span>{asking ? "Checking" : "Ask"}</span>
          </button>
        </form>

        <div className="kg-suggestion-row compact">
          {followUpSuggestions.slice(0, 2).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              disabled={asking}
              onClick={() => {
                onQueryChange(suggestion);
                onAsk(suggestion);
              }}
            >
              {shortSuggestion(suggestion)}
            </button>
          ))}
        </div>

        {answer && (
          <div className={`kg-answer-card kg-simple-answer ${answer.answer.unsupported ? "unsupported" : ""}`}>
            <div className="kg-answer-top">
              <div>
                <strong>{answer.answer.title}</strong>
                <p>{answer.answer.summary}</p>
              </div>
              <button type="button" onClick={() => onOpenProof(answer.trace_id)}>
                {answer.answer.unsupported ? "Trace" : "Proof"}
              </button>
            </div>
            <div className="kg-answer-reasons compact">
              {answer.answer.reasons.slice(0, 3).map((reason) => {
                const warning = answer.answer.unsupported || answerReasonNeedsCare(reason);
                const ReasonIcon = warning ? CircleAlert : CheckCircle2;
                return (
                <span key={reason} className={warning ? "watch" : "safe"}>
                  <ReasonIcon size={12} />
                  {buyerReasonLabel(reason)}
                </span>
                );
              })}
            </div>
            {answerActions.length > 0 && (
              <div className="kg-answer-actions" aria-label="Recommended next steps">
                {answerActions.map((action) => {
                  const Icon = action.Icon;
                  return (
                    <button
                      key={action.key}
                      type="button"
                      className={`kg-answer-action ${action.tone}`}
                      onClick={action.onClick}
                      disabled={action.disabled}
                    >
                      <Icon size={15} aria-hidden="true" />
                      <span>
                        <b>{action.label}</b>
                        <small>{action.detail}</small>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <details className="kg-proof-receipt">
              <summary>Proof receipt</summary>
              <div className="kg-answer-grounding">
                <span>
                  <b>Agent</b>
                  <small>{agentProviderLabel(answer)}</small>
                </span>
                <span>
                  <b>Retrieval</b>
                  <small>{retrievalLabel(answer)}</small>
                </span>
                <span>
                  <b>Evidence</b>
                  <small>{answerFacts} facts, {answerPaths} path{answerPaths === 1 ? "" : "s"}</small>
                </span>
                <span>
                  <b>Cache</b>
                  <small>{answer.cache?.hit ? "Reused answer" : "Fresh run"}</small>
                </span>
              </div>
            </details>
            {answer.answer.caution && (
              <div className="kg-answer-caution">
                <CircleAlert size={13} />
                <span>{answer.answer.caution}</span>
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="kg-answer-fallback" role="alert">
            <CircleAlert size={16} />
            <div>
              <strong>No verified answer yet</strong>
              <p>I could not ground an answer in the available facts. Your current trust result has not changed.</p>
            </div>
            {onRetry && (
              <button type="button" onClick={onRetry}>
                <RefreshCw size={13} />
                Check facts again
              </button>
            )}
          </div>
        )}
      </div>

      <section className="kg-map-reveal-card" aria-label="Proof map controls">
        <div className="kg-map-reveal-copy">
          <strong>Proof map</strong>
          <small>{mapOpen ? "Showing linked evidence" : "Quick proof links from this item"}</small>
          {!mapOpen && proofMapPreview.length > 0 && (
            <div className="kg-map-preview-list" aria-label="Proof map preview">
              {proofMapPreview.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setMapOpen(true);
                    if (item.pathId) {
                      setSelectedPathId(item.pathId);
                      setSelectedEdgeId(null);
                    } else if (item.edgeId) {
                      setSelectedEdgeId(item.edgeId);
                      setSelectedPathId(null);
                    }
                    setSelectedNodeId(null);
                  }}
                >
                  <b>{item.label}</b>
                  <em>{item.detail}</em>
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={() => setMapOpen((open) => !open)} aria-expanded={mapOpen}>
          {mapOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          <span>{mapOpen ? "Hide map" : "View map"}</span>
        </button>
      </section>

      {mapOpen && (
        <>
      <div className="kg-graph-controls" aria-label="Graph controls">
        <label className="kg-search-control">
          <Search size={14} aria-hidden="true" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search seller, return, review..."
            aria-label="Find a graph node"
          />
        </label>
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as "all" | GraphNodeCategory)}
          aria-label="Filter graph node type"
        >
          <option value="all">All checks</option>
          <option value="product">Products</option>
          <option value="seller">Sellers</option>
          <option value="evidence">Evidence</option>
          <option value="cohort">Buyer and review groups</option>
        </select>
      </div>

      <div className="kg-legend" aria-label="Graph legend">
        <span className="product"><Boxes size={13} /> Product or SKU</span>
        <span className="seller"><UserCheck size={13} /> Seller</span>
        <span className="evidence"><FileCheck2 size={13} /> Evidence</span>
        <span className="cohort"><UsersRound size={13} /> Buyer or reviews</span>
      </div>

      {focus.label && (
        <div className={`kg-focus-strip ${answerPulse ? "pulse" : ""}`} aria-live="polite">
          <FileSearch size={14} />
          <span>{plainFocusLabel(focus.label)}</span>
          {(selectedNodeId || selectedEdgeId) && (
            <button
              type="button"
              onClick={() => {
                setSelectedNodeId(null);
                setSelectedEdgeId(null);
                  setSelectedPathId(null);
                }}
              >
                Clear
              </button>
          )}
        </div>
      )}

      {visibleEvidencePaths.length > 0 && (
        <EvidencePathRail
          paths={visibleEvidencePaths}
          matchedPathIds={matchedPathIds}
          activePathId={activePathId}
          onSelect={(path) => {
            const nextPathId = selectedPathId === path.path_id ? null : path.path_id;
            setSelectedPathId(nextPathId);
            setSelectedEdgeId(null);
            setSelectedNodeId(null);
          }}
        />
      )}

      <div className="kg-graph-toolbar">
        <div className="kg-graph-toolbar-copy">
          <strong>{visibleEdges.length} links drawn</strong>
        </div>
        <div className="kg-map-actions">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-pressed={expanded}
          >
            {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            <span>{expanded ? "Small" : "Full"}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            aria-label="Fit graph to view"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <RelationshipStrip
        edges={visibleEdges}
        highlightedEdgeIds={highlightedEdgeIds}
        focusEdgeIds={focus.edgeIds}
        selectedEdgeId={selectedEdgeId}
        expanded={expanded}
        onSelect={(edge) => {
          setSelectedNodeId(null);
          setSelectedPathId(null);
          setSelectedEdgeId(selectedEdgeId === edge.id ? null : edge.id);
        }}
      />

      {graphEmptyState ? (
        <GraphEmptyExplanation
          state={graphEmptyState}
          guide={activeTrustGuide}
          canRequestProof={Boolean(onRequestProof)}
          onShowAll={() => {
            setSearchTerm("");
            setTypeFilter("all");
            setSelectedPathId(null);
          }}
          onUseScore={() => {
            const scoreGuide = trustGuides.find((guide) => guide.key === "score");
            setActiveGuide("score");
            setSearchTerm("");
            setTypeFilter("all");
            setSelectedPathId(scoreGuide?.pathId ?? null);
            setSelectedEdgeId(null);
            setSelectedNodeId(null);
          }}
          onRequestProof={onRequestProof}
        />
      ) : visibleNodes.length === 0 ? (
        <div className="kg-empty-state">
          <FileSearch size={22} />
          <strong>No connected evidence yet</strong>
          <span>Try another search or clear the node filter.</span>
          <button type="button" onClick={() => { setSearchTerm(""); setTypeFilter("all"); }}>
            Show all facts
          </button>
        </div>
      ) : (
        <div className={`kg-graph-layout ${(selectedNode || selectedEdge) ? "has-selection" : ""}`}>
          <div
            className={`kg-real-graph ${dragStart ? "is-panning" : ""}`}
            aria-label="Knowledge graph relationships"
            onPointerDown={(event) => {
              if (event.target instanceof Element && event.target.closest("button, input, select")) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragStart({ x: event.clientX - pan.x, y: event.clientY - pan.y });
            }}
            onPointerMove={(event) => {
              if (!dragStart) return;
              setPan({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y });
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
              setDragStart(null);
            }}
            onPointerCancel={() => setDragStart(null)}
          >
            <div
              className="kg-graph-zoom-surface"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
            >
              <svg className="kg-real-edges" viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
                {visibleEdges.map((edge) => {
                  const highlighted = highlightedEdgeIds.has(edge.id);
                  const selected = selectedEdgeId === edge.id;
                  const connected = focus.edgeIds.has(edge.id);
                  const dimmed = focus.active && !connected;
                  return (
                    <path
                      key={edge.id}
                      className={`kg-real-edge ${edge.tone} ${highlighted ? "highlighted" : ""} ${selected ? "selected" : ""} ${connected ? "connected" : ""} ${dimmed ? "dimmed" : ""} ${answerPulse && highlighted ? "answer-pulse" : ""}`}
                      d={edge.path}
                    />
                  );
                })}
              </svg>

              {visibleEdges.filter((edge) => edge.showLabel || selectedEdgeId === edge.id).map((edge) => {
                const highlighted = highlightedEdgeIds.has(edge.id);
                const selected = selectedEdgeId === edge.id;
                const connected = focus.edgeIds.has(edge.id);
                const dimmed = focus.active && !connected;
                return (
                  <button
                    key={`label-${edge.id}`}
                    type="button"
                    className={`kg-real-edge-label ${edge.tone} ${highlighted ? "highlighted" : ""} ${selected ? "selected" : ""} ${connected ? "connected" : ""} ${dimmed ? "dimmed" : ""} ${answerPulse && highlighted ? "answer-pulse" : ""}`}
                    style={{ left: `${edge.mx}%`, top: `${edge.my}%` }}
                    onClick={() => {
                      setSelectedNodeId(null);
                      setSelectedPathId(null);
                      setSelectedEdgeId(selected ? null : edge.id);
                    }}
                    aria-pressed={selected}
                    aria-label={`${edge.sourceNode.title} to ${edge.targetNode.title}: ${edge.label}`}
                  >
                    {edge.labelShort}
                  </button>
                );
              })}

              {visibleNodes.map((node) => {
                const Icon = node.Icon;
                const highlighted = matchedNodeIds.has(node.id);
                const selected = selectedNodeId === node.id;
                const connected = focus.nodeIds.has(node.id);
                const dimmed = focus.active && !connected;
                return (
                  <button
                    key={node.id}
                    type="button"
                    data-category={node.category}
                    className={`kg-real-node ${node.type} ${node.tone} ${highlighted ? "highlighted" : ""} ${selected ? "selected" : ""} ${connected ? "connected" : ""} ${dimmed ? "dimmed" : ""} ${answerPulse && highlighted ? "answer-pulse" : ""}`}
                    style={{ left: `${node.x}%`, top: `${node.y}%` }}
                    onClick={() => {
                      setSelectedEdgeId(null);
                      setSelectedPathId(null);
                      setSelectedNodeId(selected ? null : node.id);
                    }}
                    aria-pressed={selected}
                    aria-label={`${node.title}: ${node.value}. ${node.subtitle}`}
                  >
                    <span className="kg-real-node-icon"><Icon size={17} /></span>
                    <span className="kg-real-node-copy">
                      <strong>{node.title}</strong>
                      <small>{node.value}</small>
                    </span>
                    <span className="kg-node-hover-tip" role="tooltip">{node.subtitle}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="kg-mobile-tree" aria-label="Evidence relationship list">
            {visibleEdges.length ? visibleEdges.map((edge) => (
              <button
                key={`mobile-${edge.id}`}
                type="button"
                className={edge.tone}
                onClick={() => {
                  setSelectedNodeId(null);
                  setSelectedPathId(null);
                  setSelectedEdgeId(edge.id);
                }}
              >
                <strong>{edge.sourceNode.title}</strong>
                <span>{edgeLabelShort(edge.label)}</span>
                <strong>{edge.targetNode.title}</strong>
              </button>
            )) : visibleNodes.map((node) => (
              <button
                key={`mobile-${node.id}`}
                type="button"
                onClick={() => {
                  setSelectedPathId(null);
                  setSelectedNodeId(node.id);
                }}
              >
                <strong>{node.title}</strong>
                <span>{node.value}</span>
              </button>
            ))}
          </div>

          {(selectedNode || selectedEdge) && (
            <aside className={`kg-node-details-card kg-simple-details kg-node-side-panel ${(selectedNode?.tone ?? selectedEdge?.tone) || "watch"}`}>
              <div className="kg-node-details-top">
                <div>
                  <span className="eyebrow">{selectedEdge ? "Relationship" : "Fact node"}</span>
                  <h4>{selectedEdge ? `${selectedEdge.sourceNode.title} -> ${selectedEdge.targetNode.title}` : selectedNode?.value}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedNodeId(null);
                    setSelectedEdgeId(null);
                    setSelectedPathId(null);
                  }}
                  className="kg-node-close"
                  aria-label="Close evidence detail"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="kg-node-subtitle">{selectedEdge ? labelize(selectedEdge.label) : selectedNode?.subtitle}</p>
              <div className="kg-node-fact-grid">
                {nodeDetailRows(selectedNode, selectedEdge).map((row) => (
                  <span key={row.label}>
                    <b>{row.label}</b>
                    <small>{row.value}</small>
                  </span>
                ))}
              </div>
              {selectedNode && selectedNodeConnections.length > 0 && (
                <div className="kg-connected-list">
                  <strong>Connected to</strong>
                  {selectedNodeConnections.map((edge) => {
                    const other = edge.source === selectedNode.id ? edge.targetNode : edge.sourceNode;
                    return (
                      <button
                        key={edge.id}
                        type="button"
                        className={edge.tone}
                        onClick={() => {
                          setSelectedNodeId(null);
                          setSelectedPathId(null);
                          setSelectedEdgeId(edge.id);
                        }}
                      >
                        <span>{other.title}</span>
                        <small>{edgeLabelShort(edge.label)}</small>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="kg-grounding-box">
                <strong>Fact used</strong>
                <div>
                  <span>{factLine(selectedNode ?? selectedEdge)}</span>
                  <span>Reference: <code>{firstFactId(selectedNode ?? selectedEdge)}</code></span>
                  <span>Private fit is buyer-only.</span>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}
        </>
      )}
    </div>
    </>
  );
}

function GraphEmptyExplanation({
  state,
  guide,
  canRequestProof,
  onShowAll,
  onUseScore,
  onRequestProof
}: {
  state: GraphEmptyCopy;
  guide: TrustGuideCard | undefined;
  canRequestProof: boolean;
  onShowAll: () => void;
  onUseScore: () => void;
  onRequestProof?: () => void;
}) {
  const Icon = guide?.Icon ?? FileSearch;
  return (
    <section className={`kg-empty-explainer ${guide?.tone ?? "watch"}`} aria-label="No graph relationship explanation">
      <span className="kg-empty-explainer-icon">
        <Icon size={18} />
      </span>
      <div className="kg-empty-explainer-copy">
        <strong>{state.title}</strong>
        <p>{state.body}</p>
        <small>{state.detail}</small>
      </div>
      <div className="kg-empty-explainer-actions">
        <button type="button" className="primary" onClick={onShowAll}>
          <FileSearch size={14} />
          {state.primaryAction}
        </button>
        <button type="button" onClick={onUseScore}>
          <ShieldCheck size={14} />
          Score path
        </button>
        {canRequestProof && (
          <button type="button" onClick={onRequestProof}>
            <FileCheck2 size={14} />
            Ask proof
          </button>
        )}
      </div>
    </section>
  );
}

function RelationshipStrip({
  edges,
  highlightedEdgeIds,
  focusEdgeIds,
  selectedEdgeId,
  expanded,
  onSelect
}: {
  edges: ViewEdge[];
  highlightedEdgeIds: Set<string>;
  focusEdgeIds: Set<string>;
  selectedEdgeId: string | null;
  expanded: boolean;
  onSelect: (edge: ViewEdge) => void;
}) {
  if (!edges.length) return null;

  const rankedEdges = edges
    .map((edge, index) => ({
      edge,
      index,
      rank:
        (selectedEdgeId === edge.id ? 12 : 0) +
        (highlightedEdgeIds.has(edge.id) ? 8 : 0) +
        (focusEdgeIds.has(edge.id) ? 5 : 0) +
        (edge.targetNode.type === "evidence" ? 2 : 0)
    }))
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map(({ edge }) => edge);
  const visibleRailEdges = rankedEdges.slice(0, expanded ? 7 : 5);
  const hiddenRailCount = Math.max(0, rankedEdges.length - visibleRailEdges.length);

  return (
    <section className="kg-relationship-strip" aria-label="Evidence relationships">
      <div className="kg-relationship-head">
        <span>Key links</span>
        <strong>{edges.length} total on map</strong>
      </div>
      <div className="kg-relationship-list">
        {visibleRailEdges.map((edge) => {
          const selected = selectedEdgeId === edge.id;
          const highlighted = highlightedEdgeIds.has(edge.id);
          const focused = focusEdgeIds.has(edge.id);
          return (
            <button
              key={`relationship-${edge.id}`}
              type="button"
              className={`kg-relationship-chip ${edge.tone} ${selected ? "selected" : ""} ${highlighted ? "highlighted" : ""} ${focused ? "focused" : ""}`}
              onClick={() => onSelect(edge)}
              aria-pressed={selected}
              aria-label={`${edge.sourceNode.title} to ${edge.targetNode.title}: ${edge.label}`}
            >
              <span className="kg-relationship-node">{edge.sourceNode.title}</span>
              <span className="kg-relationship-label">{relationshipActionLabel(edge.label)}</span>
              <span className="kg-relationship-node">{edge.targetNode.title}</span>
            </button>
          );
        })}
        {hiddenRailCount > 0 && (
          <span className="kg-relationship-more" aria-label={`${hiddenRailCount} more evidence links are visible in the map`}>
            +{hiddenRailCount} more in map
          </span>
        )}
      </div>
    </section>
  );
}

function EvidencePathRail({
  paths,
  matchedPathIds,
  activePathId,
  onSelect
}: {
  paths: KnowledgeGraphEvidencePath[];
  matchedPathIds: Set<string>;
  activePathId: string | null;
  onSelect: (path: KnowledgeGraphEvidencePath) => void;
}) {
  return (
    <section className="kg-evidence-paths" aria-label="Simple evidence paths">
      <div className="kg-paths-head">
        <span>Proof path</span>
        <strong>Tap a path to highlight it</strong>
      </div>
      <div className="kg-path-card-row">
        {paths.map((path) => {
          const active = activePathId === path.path_id || matchedPathIds.has(path.path_id);
          return (
            <button
              key={path.path_id}
              type="button"
              className={`kg-path-card ${active ? "active" : ""}`}
              onClick={() => onSelect(path)}
              aria-pressed={active}
            >
              <span>{pathStatusLabel(path.status)}</span>
              <strong>{path.title}</strong>
              {active ? (
                <div className="kg-path-steps compact" aria-label={`${path.title} steps`}>
                  {path.steps.slice(0, 4).map((step) => (
                    <em key={`${path.path_id}-${step.label}-${step.node_id}`}>
                      <b>{step.label}</b>
                      <small>{step.detail}</small>
                    </em>
                  ))}
                </div>
              ) : (
                <small className="kg-path-hint">{shortPathSummary(path.summary)}</small>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function buildGraphAnswerActions(
  answer: KnowledgeGraphChatResponse,
  suggestions: string[],
  handlers: {
    openProof: () => void;
    requestProof?: () => void;
    proofRequestState: "idle" | "loading" | "sent";
    askFollowUp: (suggestion: string) => void;
  }
): GraphAnswerAction[] {
  const answerText = graphAnswerText(answer);
  const proofMissing = hasMissingProofSignal(answerText);
  const actions: GraphAnswerAction[] = [];
  const followUp = suggestions.find((suggestion) => normalizeInline(suggestion) !== normalizeInline(answer.answer.query)) ?? suggestions[0];

  if (proofMissing) {
    actions.push({
      key: "request-proof",
      label: handlers.proofRequestState === "sent"
        ? "Proof requested"
        : handlers.proofRequestState === "loading"
          ? "Requesting"
          : "Ask for proof",
      detail: handlers.proofRequestState === "sent"
        ? "Seller demand is logged"
        : handlers.requestProof
          ? "Send aggregate seller demand"
          : "Open proof trail",
      tone: "primary",
      disabled: handlers.proofRequestState === "loading" || handlers.proofRequestState === "sent",
      Icon: FileCheck2,
      onClick: handlers.requestProof ?? handlers.openProof
    });
    actions.push({
      key: "proof-trail",
      label: "See proof trail",
      detail: "Facts used for this answer",
      tone: "secondary",
      Icon: FileSearch,
      onClick: handlers.openProof
    });
    return actions;
  }

  actions.push({
    key: answer.answer.unsupported ? "trace" : "proof-trail",
    label: answer.answer.unsupported ? "See trace" : "See proof",
    detail: answer.answer.unsupported ? "Why Sarthi refused" : "Facts used for this answer",
    tone: "secondary",
    Icon: FileSearch,
    onClick: handlers.openProof
  });

  if (followUp && !answer.answer.unsupported) {
    actions.push({
      key: "follow-up",
      label: "Ask follow-up",
      detail: shortSuggestion(followUp),
      tone: "neutral",
      Icon: MessageCircle,
      onClick: () => handlers.askFollowUp(followUp)
    });
  }

  return actions.slice(0, 2);
}

function graphAnswerText(answer: KnowledgeGraphChatResponse) {
  return [
    answer.answer.query,
    answer.answer.title,
    answer.answer.summary,
    ...answer.answer.reasons,
    answer.answer.caution ?? ""
  ].join(" ");
}

function hasMissingProofSignal(value: string) {
  const normalized = normalizeInline(value);
  return normalized.includes("proof") && (
    normalized.includes("missing") ||
    normalized.includes("gap") ||
    normalized.includes("ask for") ||
    normalized.includes("not proven") ||
    normalized.includes("not fully proven") ||
    normalized.includes("pending") ||
    normalized.includes("uploaded and reviewed")
  );
}

function answerReasonNeedsCare(reason: string) {
  const normalized = normalizeInline(reason);
  return [
    "missing",
    "not proven",
    "not fully proven",
    "risk",
    "return",
    "caution",
    "avoid",
    "pending",
    "unsafe",
    "cannot",
    "should not",
    "can still go wrong",
    "ask for"
  ].some((term) => normalized.includes(term));
}

function buyerReasonLabel(reason: string) {
  const normalized = normalizeInline(reason);
  if (normalized.includes("transparent") || normalized.includes("transparency")) return "Transparency not proven";
  if (normalized.includes("fabric") && (normalized.includes("missing") || normalized.includes("not proven") || normalized.includes("proof"))) return "Fabric proof missing";
  if (normalized.includes("size") || normalized.includes("fit") || normalized.includes("tight")) return "Size risk remains";
  if (normalized.includes("seller") && normalized.includes("proof")) return "Seller proof needed";
  if (normalized.includes("review") || normalized.includes("rating")) return "Reviews weighted";
  if (normalized.includes("offer") || normalized.includes("price") || normalized.includes("timer")) return "Offer checked";
  if (normalized.includes("return")) return "Return risk checked";
  if (normalized.includes("fresh") || normalized.includes("stale")) return "Data freshness checked";
  if (normalized.includes("unsupported") || normalized.includes("no evidence")) return "No proof found";
  return reason.length > 42 ? `${reason.slice(0, 39).trim()}...` : reason;
}

function normalizeInline(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildTrustGuideCards(
  graph: ClusterKnowledgeGraph,
  context: SellerContext | null,
  paths: KnowledgeGraphEvidencePath[],
  answer: KnowledgeGraphChatResponse | null
): TrustGuideCard[] {
  const score = typeof context?.candidate?.score === "number" ? context.candidate.score : null;
  const factors = context?.candidate?.factors ?? null;
  const proofGaps = proofGapCount(context?.proof_coverage);
  const sourceStatus = graph.summary.source_health?.overall_status ?? "unknown";
  const sourceBlocking = Boolean(graph.summary.source_health?.blocking);
  const reviewSignal = typeof factors?.review_credibility === "number"
    ? factors.review_credibility
    : typeof factors?.review_signal === "number"
      ? factors.review_signal
      : null;
  const fitNode = context?.node_ids.buyer_fit ?? context?.node_ids.sku;
  const offerNode = context?.node_ids.offer ?? context?.node_ids.price;
  const reviewCount = context?.reviews.length ?? 0;
  const topReturn = context?.top_return_reason?.return_reason
    ? labelize(context.top_return_reason.return_reason)
    : "return history checked";
  const fitLabel = context?.fit?.recommended_size
    ? `Size ${context.fit.recommended_size}`
    : "Fit check";
  const offerStatus = context?.price_context?.offer?.status
    ? offerStatusLabel(context.price_context.offer.status)
    : sourceBlocking
      ? "Paused"
      : "Checked";
  const productPath = paths.find((path) => path.path_id === "product_score_path") ?? paths[0] ?? null;
  const fitPath = paths.find((path) => path.path_id === "buyer_fit_path") ?? productPath;
  const offerPath = paths.find((path) => path.path_id === "offer_timer_path") ?? productPath;

  return [
    {
      key: "score",
      label: "Score",
      value: score === null ? "--" : `${Math.round(score * 100)}/100`,
      detail: score === null
        ? "Not enough connected facts yet."
        : score >= 0.72
          ? "Good to consider. Still check proof before paying."
          : score >= 0.58
            ? "Some checks need attention before buying."
            : "Risk is high. Ask for proof first.",
      chips: [
        `${graph.summary.fact_count} facts`,
        sourceBlocking ? "Freshness issue" : "Fresh sources",
        context?.seller.verification.verification_status ? labelize(context.seller.verification.verification_status) : "Seller checked"
      ],
      question: "Why is this trust score high or low?",
      tone: scoreTone(score),
      Icon: ShieldCheck,
      nodeIds: compactIds([context?.node_ids.score, context?.node_ids.seller, context?.node_ids.sku]),
      edgeIds: productPath?.edge_ids ?? [],
      pathId: productPath?.path_id ?? null,
      filter: "all"
    },
    {
      key: "proof",
      label: "Proof",
      value: proofGaps > 0 ? `${proofGaps} missing` : "Ready",
      detail: proofGaps > 0
        ? "Seller proof can still improve buyer confidence."
        : "Major proof checks are covered for this item.",
      chips: [
        proofGaps > 0 ? "Ask seller proof" : "Proof covered",
        context?.proof_coverage ? `${Object.keys(context.proof_coverage).length} claims` : "Claims checked",
        answer?.answer.unsupported ? "Unsupported claim refused" : "Graph grounded"
      ],
      question: "Which proof is missing before I buy this?",
      tone: proofGaps > 0 ? "watch" : "safe",
      Icon: FileCheck2,
      nodeIds: compactIds([context?.node_ids.proof, context?.node_ids.seller, context?.node_ids.score]),
      edgeIds: productPath?.edge_ids ?? [],
      pathId: productPath?.path_id ?? null,
      filter: "evidence"
    },
    {
      key: "reviews",
      label: "Reviews",
      value: reviewSignal === null ? `${reviewCount}` : `${Math.round(reviewSignal * 100)}%`,
      detail: reviewGuideDetail(reviewSignal, reviewCount, topReturn),
      chips: [
        `${reviewCount} reviews`,
        topReturn,
        "fake patterns reduced"
      ],
      question: "Are these reviews trustworthy or suspicious?",
      tone: reviewSignal === null ? "watch" : scoreTone(reviewSignal),
      Icon: Star,
      nodeIds: compactIds([context?.node_ids.reviews, context?.node_ids.returns, context?.node_ids.score]),
      edgeIds: productPath?.edge_ids ?? [],
      pathId: productPath?.path_id ?? null,
      filter: "cohort"
    },
    {
      key: "fit",
      label: "Fit",
      value: fitLabel,
      detail: context?.fit?.confidence
        ? `${labelize(context.fit.confidence)} confidence from size outcomes.`
        : "Fit check needs more kept or returned orders.",
      chips: [
        context?.fit?.confidence ? `${labelize(context.fit.confidence)} confidence` : "Limited evidence",
        context?.evidence?.fit_as_expected_rate !== undefined ? `${Math.round(context.evidence.fit_as_expected_rate * 100)}% fit kept` : "Fit outcomes checked",
        "private to buyer"
      ],
      question: "Which size is safer for my fit?",
      tone: context?.fit?.confidence === "high" ? "safe" : context?.fit?.confidence === "low" ? "danger" : "watch",
      Icon: UsersRound,
      nodeIds: compactIds([fitNode, context?.node_ids.sku, context?.node_ids.returns]),
      edgeIds: fitPath?.edge_ids ?? [],
      pathId: fitPath?.path_id ?? null,
      filter: "cohort"
    },
    {
      key: "offer",
      label: "Offer",
      value: offerStatus,
      detail: sourceBlocking
        ? "Sarthi will not push high confidence while source data is stale."
        : "Price, timer, and offer evidence are checked together.",
      chips: [
        context?.price_context?.latest_price ? `Rs ${context.price_context.latest_price}` : "Price checked",
        context?.price_context?.inventory ? "Stock checked" : "Inventory pending",
        labelize(sourceStatus)
      ],
      question: "Is this offer verified for current price?",
      tone: sourceBlocking ? "watch" : sourceStatus === "unavailable" ? "danger" : "safe",
      Icon: Clock3,
      nodeIds: compactIds([offerNode, context?.node_ids.price, context?.node_ids.score]),
      edgeIds: offerPath?.edge_ids ?? [],
      pathId: offerPath?.path_id ?? null,
      filter: "evidence"
    }
  ];
}

function buildProofMapPreview(
  paths: KnowledgeGraphEvidencePath[],
  edges: ViewEdge[],
  activeGuide?: TrustGuideCard | null
): ProofMapPreviewItem[] {
  const pathItems = paths.slice(0, 3).map((path) => ({
    key: `path-${path.path_id}`,
    label: proofMapPathLabel(path),
    detail: compactPathSteps(path),
    pathId: path.path_id
  }));
  if (pathItems.length) return pathItems;

  const edgeItems = edges.slice(0, 3).map((edge) => ({
    key: `edge-${edge.id}`,
    label: edgeLabelShort(edge.label),
    detail: `${edge.sourceNode.title} -> ${edge.targetNode.title}`,
    edgeId: edge.id
  }));
  if (edgeItems.length) return edgeItems;

  if (activeGuide) {
    return [{
      key: `guide-${activeGuide.key}`,
      label: `${activeGuide.label} check`,
      detail: activeGuide.detail,
      pathId: activeGuide.pathId
    }];
  }
  return [];
}

function proofMapPathLabel(path: KnowledgeGraphEvidencePath) {
  if (path.path_id === "product_score_path") return "Score";
  if (path.path_id === "buyer_fit_path") return "Fit";
  if (path.path_id === "offer_timer_path") return "Price";
  return path.title;
}

function compactPathSteps(path: KnowledgeGraphEvidencePath) {
  if (path.path_id === "product_score_path") return "Seller, returns, proof";
  if (path.path_id === "buyer_fit_path") return "Size outcomes checked";
  if (path.path_id === "offer_timer_path") return "Price history checked";
  const labels = path.steps.slice(0, 3).map((step) => step.label).filter(Boolean);
  return labels.length ? labels.join(" -> ") : shortPathSummary(path.summary);
}

function guideHeadline(guide: TrustGuideCard) {
  const label = guideHeadlineLabel(guide.key, guide.label);
  if (guide.tone === "safe") return `${label} looks okay`;
  if (guide.tone === "danger") return `${label} needs care`;
  return `${label} needs one check`;
}

function guideHeadlineLabel(key: TrustGuideKey, fallback: string) {
  if (key === "reviews") return "Review signal";
  if (key === "fit") return "Fit confidence";
  if (key === "offer") return "Offer check";
  if (key === "proof") return "Seller proof";
  return fallback;
}

function offerStatusLabel(status: string) {
  if (status === "no_need_to_rush") return "Price proof checked";
  return labelize(status);
}

function reviewGuideDetail(reviewSignal: number | null, reviewCount: number, topReturn: string) {
  const returnSignal = reviewReturnSignal(topReturn);
  if (reviewCount <= 0) {
    return "No review evidence is connected yet, so reviews cannot push the score up.";
  }
  if (reviewSignal === null) {
    return `${reviewCount} reviews exist, but Sarthi still needs enough trusted buyers before using them strongly.`;
  }
  const percent = Math.round(reviewSignal * 100);
  if (percent < 55) {
    return `Only ${percent}% is trusted after purchase history, account age, repeated text, and ${returnSignal}.`;
  }
  if (percent < 72) {
    return `${percent}% is usable. Sarthi still checks returns before trusting the rating.`;
  }
  return `${percent}% is trusted after fraud, purchase, and return-pattern checks.`;
}

function reviewReturnSignal(labelText: string) {
  const normalized = labelText.trim().toLowerCase();
  if (!normalized) return "return history";
  if (normalized.endsWith("checked")) return normalized;
  if (normalized.includes("return")) return normalized;
  return `${normalized} return pattern`;
}

function graphEmptyCopy(guide: TrustGuideCard | undefined, visibleNodeCount: number, searchTerm: string): GraphEmptyCopy {
  if (searchTerm.trim()) {
    return {
      title: "No match for this search",
      body: "The graph has evidence, but nothing matched the word you searched.",
      detail: "Clear the search to return to the full evidence path.",
      primaryAction: "Clear search"
    };
  }

  if (guide?.key === "reviews") {
    return {
      title: "No review relationship drawn",
      body: visibleNodeCount > 0
        ? "Review facts are present, but they are not strongly connected enough to this seller/SKU path after credibility weighting."
        : "No trusted review nodes are available for this lens yet.",
      detail: "Sarthi hides weak review links instead of drawing a misleading graph.",
      primaryAction: "Show all facts"
    };
  }

  if (guide?.key === "fit") {
    return {
      title: "No fit path for this lens",
      body: "Fit confidence needs size outcomes connected to this SKU and buyer profile. That path is limited here.",
      detail: "Use the score path or ask the seller for measurement proof.",
      primaryAction: "Show all facts"
    };
  }

  if (guide?.key === "offer") {
    return {
      title: "No offer relationship drawn",
      body: "Offer checks need price history, campaign timer, and inventory links. This view does not have a complete path.",
      detail: "Sarthi will not show a fake offer graph without linked source evidence.",
      primaryAction: "Show all facts"
    };
  }

  if (guide?.key === "proof") {
    return {
      title: "No proof path drawn yet",
      body: "Seller proof is missing or still pending review, so the graph cannot connect it to score improvement.",
      detail: "Ask for proof to create aggregate seller demand.",
      primaryAction: "Show all facts"
    };
  }

  return {
    title: "No relationship path found",
    body: "This lens has facts, but no reliable relationship path to draw for the selected item.",
    detail: "Sarthi avoids visualising weak or unsupported links.",
    primaryAction: "Show all facts"
  };
}

function compactIds(ids: Array<string | undefined | null>) {
  return ids.filter((id): id is string => Boolean(id));
}

function graphProofSummary(
  graph: ClusterKnowledgeGraph,
  context: SellerContext | null,
  paths: KnowledgeGraphEvidencePath[],
  answer: KnowledgeGraphChatResponse | null
) {
  const score = typeof context?.candidate?.score === "number" ? context.candidate.score : null;
  const proofGaps = proofGapCount(context?.proof_coverage);
  const sourceStatus = graph.summary.source_health?.overall_status ?? "unknown";
  const sourceBlocking = Boolean(graph.summary.source_health?.blocking);
  const answerValue = answer
    ? answer.answer.unsupported
      ? "Refused"
      : agentProviderLabel(answer)
    : graph.summary.graph_engine === "neo4j_projection"
      ? "Neo4j"
      : "Ready";

  return [
    {
      label: "Trust score",
      value: score === null ? "--" : `${Math.round(score * 100)}/100`,
      detail: "Seller, SKU, proof, review, offer, fit",
      tone: scoreTone(score)
    },
    {
      label: "Proof gaps",
      value: proofGaps > 0 ? `${proofGaps} open` : "Covered",
      detail: proofGaps > 0 ? "Seller proof can improve confidence" : "No major proof block in this path",
      tone: proofGaps > 0 ? "watch" as const : "safe" as const
    },
    {
      label: "Freshness",
      value: labelize(sourceStatus),
      detail: sourceBlocking ? "High confidence is paused" : "Source health allows recommendations",
      tone: sourceStatus === "operational" ? "safe" as const : sourceStatus === "unavailable" ? "danger" as const : "watch" as const
    },
    {
      label: "Graph answer",
      value: answerValue,
      detail: answer ? retrievalLabel(answer) : `${paths.length} guided evidence paths`,
      tone: answer?.answer.unsupported ? "watch" as const : "safe" as const
    }
  ];
}

function scoreTone(score: number | null): EvidenceTone {
  if (score === null) return "watch";
  if (score >= 0.72) return "safe";
  if (score >= 0.58) return "watch";
  return "danger";
}

function proofGapCount(coverage: SellerContext["proof_coverage"] | undefined) {
  return Object.values(coverage ?? {}).filter((item: any) => item && item.sufficient === false).length;
}

function nodeDetailRows(node: ViewNode | null, edge: ViewEdge | null) {
  if (edge) {
    return [
      { label: "Relationship", value: edgeLabelShort(edge.label) },
      { label: "Weight", value: `${Math.round(edge.weight * 100)} / 100` },
      { label: "Evidence", value: factLine(edge) },
      { label: "Source", value: firstFactId(edge) }
    ];
  }
  if (!node) return [];
  return [
    { label: "Status", value: nodeStatusLabel(node) },
    { label: "Signal", value: typeof node.score === "number" ? `${Math.round(node.score * 100)} / 100` : "Context only" },
    { label: "Evidence", value: factLine(node) },
    { label: "Scope", value: node.type === "buyer_context" ? "Private to buyer" : "Product graph" }
  ];
}

function nodeStatusLabel(node: ViewNode) {
  if (node.type === "buyer_context") return "Buyer private";
  return labelize(node.status || node.tone);
}

function agentProviderLabel(answer: KnowledgeGraphChatResponse) {
  const provider = answer.agent?.provider;
  if (provider === "bedrock") return "Bedrock AI";
  if (provider === "gemini") return "Gemini AI";
  if (provider === "fallback_after_llm_error") return "Rule fallback";
  return "Rule-grounded";
}

function retrievalLabel(answer: KnowledgeGraphChatResponse) {
  const source = answer.retrieval?.source;
  if (answer.cache?.hit) return "Cached answer";
  if (source === "atlas_vector_search") return "Atlas vector search";
  if (source === "local_embedding_fallback") return "Local vector fallback";
  if (source === "lexical_fallback_after_vector_error") return "Lexical after vector error";
  if (source === "disabled_no_ai_provider") return "Lexical, AI disabled";
  if (source === "disabled_no_gemini_key") return "Lexical, key missing";
  if (source === "lexical_fallback") return "Lexical evidence match";
  return "Evidence retrieval";
}

function selectedSellerContext(graph: ClusterKnowledgeGraph) {
  if (!graph.selected_product_id) return graph.seller_context[0] ?? null;
  return graph.seller_context.find((context) => context.product.product_id === graph.selected_product_id) ??
    graph.seller_context[0] ??
    null;
}

function buildGraphView(
  graph: ClusterKnowledgeGraph,
  context: SellerContext | null,
  highlightedEdgeIds: Set<string>,
  expanded: boolean
): GraphView {
  if (!context) return buildFallbackGraphView(graph);

  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const scoreId = context.node_ids.score ?? `score:${context.variant.variant_id}`;
  if (!nodesById.has(scoreId)) {
    nodesById.set(scoreId, fallbackNode(
      scoreId,
      "evidence",
      `${Math.floor((context.candidate?.score ?? 0) * 100)}/100 trust`,
      "Weighted score from seller, SKU, proof, review, offer, and fit signals",
      context.candidate?.score ?? null
    ));
  }

  const nodeIdsByKey: Record<string, string | undefined> = {
    ...context.node_ids,
    score: scoreId
  };
  const layout = expanded ? FULL_NODE_LAYOUT : COMPACT_NODE_LAYOUT;
  const nodes = layout
    .map((layout) => {
      const id = nodeIdsByKey[layout.key];
      const node = id ? nodesById.get(id) : null;
      return node ? toViewNode(node, layout.x, layout.y) : null;
    })
    .filter(Boolean) as ViewNode[];
  const viewNodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = graph.edges
    .filter((edge) => viewNodesById.has(edge.source) && viewNodesById.has(edge.target))
    .sort((left, right) => edgePriority(right, highlightedEdgeIds) - edgePriority(left, highlightedEdgeIds))
    .slice(0, 22)
    .map((edge) => toViewEdge(edge, viewNodesById.get(edge.source)!, viewNodesById.get(edge.target)!, expanded, highlightedEdgeIds.has(edge.id)));

  return { nodes, edges };
}

function buildFallbackGraphView(graph: ClusterKnowledgeGraph): GraphView {
  const fallbackLayouts = [
    { x: 16, y: 24 },
    { x: 38, y: 42 },
    { x: 60, y: 24 },
    { x: 60, y: 66 },
    { x: 82, y: 44 }
  ];
  const nodes = graph.nodes.slice(0, 5).map((node, index) =>
    toViewNode(node, fallbackLayouts[index]?.x ?? 50, fallbackLayouts[index]?.y ?? 50)
  );
  const viewNodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = graph.edges
    .filter((edge) => viewNodesById.has(edge.source) && viewNodesById.has(edge.target))
    .slice(0, 8)
    .map((edge) => toViewEdge(edge, viewNodesById.get(edge.source)!, viewNodesById.get(edge.target)!, false, false));
  return { nodes, edges };
}

function buildGraphFocus({
  selectedNodeId,
  selectedEdgeId,
  selectedEdge,
  matchedNodeIds,
  highlightedEdgeIds,
  visibleNodes,
  visibleEdges,
  answerText,
  answerActive
}: {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  selectedEdge: ViewEdge | null;
  matchedNodeIds: Set<string>;
  highlightedEdgeIds: Set<string>;
  visibleNodes: ViewNode[];
  visibleEdges: ViewEdge[];
  answerText: string;
  answerActive: boolean;
}) {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  let label = "";

  if (selectedNodeId) {
    nodeIds.add(selectedNodeId);
    visibleEdges.forEach((edge) => {
      if (edge.source === selectedNodeId || edge.target === selectedNodeId) {
        edgeIds.add(edge.id);
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }
    });
    const connectedCount = Math.max(0, nodeIds.size - 1);
    label = `Showing ${connectedCount} direct connection${connectedCount === 1 ? "" : "s"} for this node.`;
  } else if (selectedEdgeId && selectedEdge) {
    edgeIds.add(selectedEdgeId);
    nodeIds.add(selectedEdge.source);
    nodeIds.add(selectedEdge.target);
    label = `Showing how ${selectedEdge.sourceNode.title} affects ${selectedEdge.targetNode.title}.`;
  } else if (answerActive && (matchedNodeIds.size || highlightedEdgeIds.size || answerText.trim())) {
    const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
    matchedNodeIds.forEach((nodeId) => {
      if (visibleNodeIds.has(nodeId)) nodeIds.add(nodeId);
    });
    visibleEdges.forEach((edge) => {
      if (highlightedEdgeIds.has(edge.id)) {
        edgeIds.add(edge.id);
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }
    });
    addSemanticAnswerFocus(answerText, visibleNodes, visibleEdges, nodeIds, edgeIds);
    label = `Sarthi used ${nodeIds.size} node${nodeIds.size === 1 ? "" : "s"} and ${edgeIds.size} link${edgeIds.size === 1 ? "" : "s"} for this answer.`;
  }

  return {
    active: Boolean(selectedNodeId || selectedEdgeId || (answerActive && (nodeIds.size || edgeIds.size))),
    nodeIds,
    edgeIds,
    label
  };
}

function addSemanticAnswerFocus(
  answerText: string,
  visibleNodes: ViewNode[],
  visibleEdges: ViewEdge[],
  nodeIds: Set<string>,
  edgeIds: Set<string>
) {
  const text = answerText.toLowerCase();
  const wanted = new Set<string>();
  if (/\breturn|rto|kept|refund/.test(text)) wanted.add("return_reason");
  if (/\breview|rating|credib/.test(text)) wanted.add("reviews");
  if (/\bseller|verified|verification/.test(text)) wanted.add("seller");
  if (/\bproof|photo|fabric|transparen|evidence/.test(text)) wanted.add("proof");
  if (/\boffer|price|timer|rush|discount/.test(text)) wanted.add("offer");
  if (/\bprice|discount|timer|campaign|offer/.test(text)) wanted.add("price");
  if (/\bsize|fit|sku|xl|l\b|m\b/.test(text)) wanted.add("sku");
  if (/\btrust|score|safe|risk/.test(text)) wanted.add("evidence");

  visibleNodes.forEach((node) => {
    if (wanted.has(node.type)) nodeIds.add(node.id);
  });

  visibleEdges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edgeIds.add(edge.id);
    }
  });

  if (nodeIds.size > 0) {
    const scoreNode = visibleNodes.find((node) => node.type === "evidence");
    if (scoreNode) nodeIds.add(scoreNode.id);
    visibleEdges.forEach((edge) => {
      if (nodeIds.has(edge.source) || nodeIds.has(edge.target)) {
        edgeIds.add(edge.id);
      }
    });
  }
}

function toViewNode(node: KnowledgeGraphNode, x: number, y: number): ViewNode {
  return {
    ...node,
    x,
    y,
    title: nodeTitle(node),
    value: nodeValue(node),
    tone: nodeTone(node),
    category: nodeCategory(node),
    Icon: nodeIcon(node)
  };
}

function toViewEdge(edge: KnowledgeGraphEdge, sourceNode: ViewNode, targetNode: ViewNode, expanded: boolean, highlighted: boolean): ViewEdge {
  const midX = (sourceNode.x + targetNode.x) / 2;
  const midY = (sourceNode.y + targetNode.y) / 2;
  const bend = Math.min(12, Math.abs(targetNode.x - sourceNode.x) * 0.18);
  const controlX1 = sourceNode.x + bend;
  const controlX2 = targetNode.x - bend;
  const lane = edgeLaneOffset(edge.label) * (expanded ? 1 : 0.45);
  const controlY1 = clamp(sourceNode.y + lane, 8, 92);
  const controlY2 = clamp(targetNode.y + lane, 8, 92);

  return {
    ...edge,
    sourceNode,
    targetNode,
    labelShort: edgeLabelShort(edge.label),
    tone: edgeTone(edge, sourceNode, targetNode),
    x1: sourceNode.x,
    y1: sourceNode.y,
    x2: targetNode.x,
    y2: targetNode.y,
    mx: midX,
    my: midY,
    path: `M ${sourceNode.x} ${sourceNode.y} C ${controlX1} ${controlY1}, ${controlX2} ${controlY2}, ${targetNode.x} ${targetNode.y}`,
    showLabel: expanded && (highlighted || shouldShowEdgeLabel(edge.label, expanded))
  };
}

function edgeLaneOffset(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("seller trust")) return -9;
  if (normalized.includes("returns affect")) return -5;
  if (normalized.includes("reviews affect")) return 6;
  if (normalized.includes("proof affects")) return -13;
  if (normalized.includes("offer truth")) return 13;
  if (normalized.includes("price history")) return 16;
  if (normalized.includes("private fit affects")) return 18;
  if (normalized.includes("challenge")) return -16;
  if (normalized.includes("create proof")) return 12;
  if (normalized.includes("checks review")) return 9;
  if (normalized.includes("timer")) return -7;
  if (normalized.includes("sold by")) return -4;
  return 0;
}

function nodeTitle(node: KnowledgeGraphNode) {
  if (node.type === "seller") return "Seller";
  if (node.type === "product") return "Product";
  if (node.type === "sku") return "SKU";
  if (node.type === "return_reason") return "Returns";
  if (node.type === "reviews") return "Reviews";
  if (node.type === "offer") return "Offer";
  if (node.type === "price") return "Price";
  if (node.type === "proof") return "Proof";
  if (node.type === "buyer_context") return "Fit";
  if (node.type === "evidence") return "Score";
  return labelize(node.type);
}

function nodeValue(node: KnowledgeGraphNode) {
  if (node.type === "seller") return labelize(node.status);
  if (node.type === "product") return truncate(node.label, 14);
  if (node.type === "sku") return `Size ${node.label}`;
  if (node.type === "reviews" && typeof node.score === "number") return `${Math.round(node.score * 100)}% useful`;
  if (node.type === "buyer_context") return "Private";
  return truncate(node.label, 18);
}

function nodeTone(node: KnowledgeGraphNode): EvidenceTone {
  const status = node.status.toLowerCase();
  if (node.type === "buyer_context") return "private";
  if (status.includes("restricted") || status.includes("high_return") || status.includes("missing") || status.includes("cautious")) {
    return "danger";
  }
  if (status.includes("pending") || status.includes("weak") || status.includes("limited") || status.includes("not_ranked") || status.includes("one_check")) {
    return "watch";
  }
  if (typeof node.score === "number" && node.type === "evidence") {
    if (node.score < 0.58) return "danger";
    if (node.score < 0.72) return "watch";
  }
  return "safe";
}

function nodeCategory(node: KnowledgeGraphNode): GraphNodeCategory {
  if (node.type === "seller") return "seller";
  if (node.type === "product" || node.type === "sku" || node.type === "cluster") return "product";
  if (node.type === "reviews" || node.type === "buyer_context") return "cohort";
  return "evidence";
}

function nodeIcon(node: KnowledgeGraphNode): LucideIcon {
  if (node.type === "seller") return UserCheck;
  if (node.type === "return_reason") return nodeTone(node) === "danger" ? AlertTriangle : CircleAlert;
  if (node.type === "reviews") return Star;
  if (node.type === "offer") return Clock3;
  if (node.type === "price") return FileSearch;
  if (node.type === "proof") return ShieldCheck;
  if (node.type === "buyer_context") return ShieldCheck;
  if (node.type === "evidence") return CheckCircle2;
  return PackageCheck;
}

function edgeTone(edge: KnowledgeGraphEdge, sourceNode: ViewNode, targetNode: ViewNode): EvidenceTone {
  const label = edge.label.toLowerCase();
  if (sourceNode.tone === "private" || targetNode.tone === "private") return "private";
  if (sourceNode.tone === "danger" || targetNode.tone === "danger") return "danger";
  if (label.includes("return") || label.includes("timer") || sourceNode.tone === "watch" || targetNode.tone === "watch") {
    return "watch";
  }
  return "safe";
}

function shouldShowEdgeLabel(label: string, expanded: boolean) {
  if (!expanded) return false;
  const normalized = label.toLowerCase();
  if (expanded && (
    normalized.includes("has outcome") ||
    normalized.includes("has reviews") ||
    normalized.includes("has offer") ||
    normalized.includes("sold by")
  )) return true;
  return normalized.includes("affect") ||
    normalized.includes("challenge") ||
    normalized.includes("proof") ||
    normalized.includes("price") ||
    normalized.includes("fit check") ||
    normalized.includes("seller trust");
}

function edgeLabelShort(label: string) {
  const normalized = label.toLowerCase();
  if (normalized === "returns affect score") return "returns -> score";
  if (normalized === "reviews affect score") return "reviews -> score";
  if (normalized === "proof affects score") return "proof -> score";
  if (normalized === "offer truth affects score") return "offer -> score";
  if (normalized === "checks price history") return "checks price";
  if (normalized === "price history guides buyer") return "price -> guidance";
  if (normalized === "private fit affects score") return "fit -> score";
  if (normalized === "seller trust affects score") return "seller -> score";
  if (normalized === "returns challenge reviews") return "returns lower reviews";
  if (normalized === "returns create proof need") return "returns need proof";
  if (normalized === "proof checks review claims") return "proof checks reviews";
  if (normalized === "timer needs proof") return "timer needs proof";
  if (normalized === "private fit check") return "fit check";
  return truncate(labelize(label), 22);
}

function relationshipActionLabel(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("check")) return "checks";
  if (normalized.includes("lower")) return "lowers";
  if (normalized.includes("challenge")) return "flags";
  if (normalized.includes("affect")) return "affects";
  if (normalized.includes("based")) return "based on";
  if (normalized.includes("outcome")) return "outcomes";
  if (normalized.includes("similar") || normalized.includes("cluster")) return "similar";
  if (normalized.includes("proof") && normalized.includes("need")) return "needs proof";
  if (normalized.includes("timer")) return "needs proof";
  if (normalized.includes("private") || normalized.includes("fit")) return "fit";
  if (normalized.includes("score")) return "influences";
  return truncate(labelize(label), 13);
}

function plainFocusLabel(label: string) {
  if (label.startsWith("Showing ") && label.includes("direct connection")) {
    return "Showing only the checks linked to the item you tapped.";
  }
  if (label.startsWith("Sarthi used ")) {
    return "Highlighted checks were used for this answer.";
  }
  return label;
}

function edgePriority(edge: KnowledgeGraphEdge, highlightedEdgeIds: Set<string>) {
  let score = highlightedEdgeIds.has(edge.id) ? 100 : 0;
  const label = edge.label.toLowerCase();
  if (label.includes("affect")) score += 20;
  if (label.includes("challenge") || label.includes("proof")) score += 15;
  if (label.includes("sold by") || label.includes("sku")) score += 8;
  return score + edge.weight;
}

function fallbackNode(
  id: string,
  type: KnowledgeGraphNode["type"],
  label: string,
  subtitle: string,
  score: number | null
): KnowledgeGraphNode {
  return {
    id,
    type,
    label,
    subtitle,
    status: "projected",
    score,
    fact_ids: [],
    data: {}
  };
}

function shortSuggestion(suggestion: string) {
  const normalized = suggestion.toLowerCase();
  if (normalized.includes("safest")) return "Safest seller?";
  if (normalized.includes("cheapest")) return "Why not cheapest?";
  if (normalized.includes("prepaid")) return "Prepaid safe?";
  if (normalized.includes("review")) return "Reviews real?";
  if (normalized.includes("proof")) return "Proof missing?";
  if (normalized.includes("offer")) return "Offer real?";
  return suggestion.length > 28 ? `${suggestion.slice(0, 25)}...` : suggestion;
}

function pathStatusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized.includes("ready") || normalized.includes("high") || normalized.includes("verified")) return "Ready";
  if (normalized.includes("caution") || normalized.includes("reset") || normalized.includes("rush")) return "Caution";
  if (normalized.includes("low") || normalized.includes("missing")) return "Needs proof";
  return labelize(status);
}

function shortPathSummary(summary: string) {
  const normalized = summary.trim();
  if (!normalized) return "Tap to see the linked checks";
  return normalized.length > 54 ? `${normalized.slice(0, 51)}...` : normalized;
}

function firstFactId(item: KnowledgeGraphNode | KnowledgeGraphEdge | null) {
  return item?.fact_ids?.[0] ?? item?.id.slice(0, 18) ?? "graph";
}

function factLine(item: KnowledgeGraphNode | KnowledgeGraphEdge | null) {
  const count = item?.fact_ids?.length ?? 0;
  if (!count) return "Projected relationship";
  return `${count} fact${count === 1 ? "" : "s"} connected`;
}

function truncate(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, Math.max(0, limit - 3))}...` : value;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}
