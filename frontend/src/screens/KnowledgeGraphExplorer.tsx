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
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from "lucide-react";
import type {
  ClusterKnowledgeGraph,
  KnowledgeGraphChatResponse,
  KnowledgeGraphEdge,
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
  onRetry?: () => void;
};

type SellerContext = ClusterKnowledgeGraph["seller_context"][number];
type EvidenceTone = "safe" | "watch" | "danger" | "private";
type GraphNodeCategory = "product" | "seller" | "evidence" | "cohort";

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

const COMPACT_NODE_LAYOUT: Array<{ key: string; x: number; y: number }> = [
  { key: "seller", x: 13, y: 22 },
  { key: "sku", x: 30, y: 58 },
  { key: "returns", x: 48, y: 23 },
  { key: "reviews", x: 68, y: 23 },
  { key: "offer", x: 48, y: 78 },
  { key: "proof", x: 68, y: 78 },
  { key: "score", x: 88, y: 52 }
];

const FULL_NODE_LAYOUT: Array<{ key: string; x: number; y: number }> = [
  { key: "seller", x: 14, y: 20 },
  { key: "product", x: 14, y: 47 },
  { key: "buyer_fit", x: 14, y: 74 },
  { key: "sku", x: 36, y: 47 },
  { key: "returns", x: 56, y: 20 },
  { key: "reviews", x: 72, y: 20 },
  { key: "offer", x: 56, y: 74 },
  { key: "proof", x: 72, y: 74 },
  { key: "score", x: 88, y: 47 }
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
  const [answerPulse, setAnswerPulse] = useState(false);

  useEffect(() => {
    if (!answer) return;
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
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

  const matchedNodeIds = new Set(answer?.answer.matched_node_ids ?? []);
  const highlightedEdgeIds = new Set(answer?.answer.highlighted_edge_ids ?? []);
  const winnerContext = selectedSellerContext(graph);
  const graphView = buildGraphView(graph, winnerContext, highlightedEdgeIds, expanded);
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const visibleNodes = graphView.nodes.filter((node) => {
    const typeMatch = typeFilter === "all" || node.category === typeFilter;
    const textMatch = !normalizedSearch || `${node.title} ${node.value} ${node.subtitle}`.toLowerCase().includes(normalizedSearch);
    return typeMatch && textMatch;
  });
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = graphView.edges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
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
      ? `Image match ${similarity.agent.image_inputs} photos`
      : `Image match ${similarity.agent.status}`
    : similarity
      ? `${similarity.distinct_seller_count} similar sellers`
      : null;

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
      <div className={`kg-card kg-simple-card ${expanded ? "graph-expanded" : ""}`}>
      <div className="kg-card-header kg-simple-header">
        <div>
          <span className="eyebrow">Proof graph</span>
          <h3>What affects trust</h3>
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
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div className="kg-graph-toolbar">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-pressed={expanded}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          <span>{expanded ? "Small view" : "Full graph"}</span>
        </button>
        <div className="kg-zoom-controls">
          <button
            type="button"
            onClick={() => setZoom((value) => clampZoom(value - 0.15))}
            disabled={zoom <= 0.86}
            aria-label="Zoom out graph"
          >
            <ZoomOut size={14} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((value) => clampZoom(value + 0.15))}
            disabled={zoom >= 1.84}
            aria-label="Zoom in graph"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            aria-label="Reset graph view"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {visibleNodes.length === 0 ? (
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
                  setSelectedEdgeId(edge.id);
                }}
              >
                <strong>{edge.sourceNode.title}</strong>
                <span>{edgeLabelShort(edge.label)}</span>
                <strong>{edge.targetNode.title}</strong>
              </button>
            )) : visibleNodes.map((node) => (
              <button key={`mobile-${node.id}`} type="button" onClick={() => setSelectedNodeId(node.id)}>
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
                  }}
                  className="kg-node-close"
                  aria-label="Close evidence detail"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="kg-node-subtitle">{selectedEdge ? labelize(selectedEdge.label) : selectedNode?.subtitle}</p>
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

      <div className="kg-chat-box">
        <div className="kg-suggestion-row">
          {graph.chat_suggestions.slice(0, 3).map((suggestion) => (
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

        {answer && (
          <div className="kg-answer-card kg-simple-answer">
            <div className="kg-answer-top">
              <div>
                <strong>{answer.answer.title}</strong>
                <p>{answer.answer.summary}</p>
              </div>
              <button type="button" onClick={() => onOpenProof(answer.trace_id)}>
                Proof
              </button>
            </div>
            <div className="kg-answer-reasons">
              {answer.answer.reasons.slice(0, 3).map((reason) => (
                <span key={reason}><CheckCircle2 size={12} /> {reason}</span>
              ))}
            </div>
            {answer.answer.caution && (
              <div className="kg-answer-caution">
                <CircleAlert size={13} />
                <span>{answer.answer.caution}</span>
              </div>
            )}
          </div>
        )}

        {error && <p className="kg-inline-error">{error}</p>}
      </div>
    </div>
    </>
  );
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
  const controlY = sourceNode.y === targetNode.y ? sourceNode.y - 5 : sourceNode.y;

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
    path: `M ${sourceNode.x} ${sourceNode.y} C ${controlX1} ${controlY}, ${controlX2} ${targetNode.y}, ${targetNode.x} ${targetNode.y}`,
    showLabel: highlighted
  };
}

function nodeTitle(node: KnowledgeGraphNode) {
  if (node.type === "seller") return "Seller";
  if (node.type === "product") return "Product";
  if (node.type === "sku") return "SKU";
  if (node.type === "return_reason") return "Returns";
  if (node.type === "reviews") return "Reviews";
  if (node.type === "offer") return "Offer";
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
    normalized.includes("fit check") ||
    normalized.includes("seller trust");
}

function edgeLabelShort(label: string) {
  const normalized = label.toLowerCase();
  if (normalized === "returns affect score") return "returns -> score";
  if (normalized === "reviews affect score") return "reviews -> score";
  if (normalized === "proof affects score") return "proof -> score";
  if (normalized === "offer truth affects score") return "offer -> score";
  if (normalized === "private fit affects score") return "fit -> score";
  if (normalized === "seller trust affects score") return "seller -> score";
  if (normalized === "returns challenge reviews") return "returns lower reviews";
  if (normalized === "returns create proof need") return "returns need proof";
  if (normalized === "proof checks review claims") return "proof checks reviews";
  if (normalized === "timer needs proof") return "timer needs proof";
  if (normalized === "private fit check") return "fit check";
  return truncate(labelize(label), 22);
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
  return suggestion.length > 28 ? `${suggestion.slice(0, 25)}...` : suggestion;
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

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function clampZoom(value: number) {
  return Math.max(0.85, Math.min(1.9, Number(value.toFixed(2))));
}
