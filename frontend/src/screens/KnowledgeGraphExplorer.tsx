import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Maximize2,
  MessageCircle,
  Minimize2,
  PackageCheck,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  UserCheck,
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
};

type SellerContext = ClusterKnowledgeGraph["seller_context"][number];
type EvidenceTone = "safe" | "watch" | "danger" | "private";

type ViewNode = KnowledgeGraphNode & {
  x: number;
  y: number;
  title: string;
  value: string;
  tone: EvidenceTone;
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
  onOpenProof
}: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [zoom, setZoom] = useState(1);

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
      </div>
    );
  }

  if (!graph) return null;

  const matchedNodeIds = new Set(answer?.answer.matched_node_ids ?? []);
  const highlightedEdgeIds = new Set(answer?.answer.highlighted_edge_ids ?? []);
  const winnerContext = selectedSellerContext(graph);
  const graphView = buildGraphView(graph, winnerContext, highlightedEdgeIds, expanded);
  const selectedNode = selectedNodeId
    ? graphView.nodes.find((node) => node.id === selectedNodeId) ?? null
    : null;
  const selectedEdge = selectedEdgeId
    ? graphView.edges.find((edge) => edge.id === selectedEdgeId) ?? null
    : null;
  const engineLabel = graph.summary.neo4j_projection?.status === "projected"
    ? "Neo4j live"
    : "Mongo graph";
  const similarity = graph.summary.similarity;
  const aiLabel = answer?.agent?.provider === "gemini"
    ? "Gemini answer"
    : answer
      ? "Fact answer"
      : "Ask Sarthi";

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
          <span className="eyebrow">Knowledge graph</span>
          <h3>Evidence links</h3>
        </div>
        <span className="kg-live-pill">{graph.summary.fact_count} facts</span>
      </div>

      <div className="kg-system-strip" aria-label="Runtime status">
        <span><ShieldCheck size={13} /> {engineLabel}</span>
        <span><Sparkles size={13} /> {aiLabel}</span>
        {similarity && (
          <span><PackageCheck size={13} /> {similarity.distinct_seller_count} similar sellers</span>
        )}
      </div>

      <div className="kg-graph-toolbar" aria-label="Graph controls">
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
        </div>
      </div>

      <div className="kg-real-graph" aria-label="Knowledge graph relationships">
        <div
          className="kg-graph-zoom-surface"
          style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }}
        >
          <svg className="kg-real-edges" viewBox="0 0 100 100" aria-hidden="true" preserveAspectRatio="none">
            {graphView.edges.map((edge) => {
              const highlighted = highlightedEdgeIds.has(edge.id);
              const selected = selectedEdgeId === edge.id;
              return (
                <path
                  key={edge.id}
                  className={`kg-real-edge ${edge.tone} ${highlighted ? "highlighted" : ""} ${selected ? "selected" : ""}`}
                  d={edge.path}
                />
              );
            })}
          </svg>

          {graphView.edges.filter((edge) => edge.showLabel).map((edge) => {
            const highlighted = highlightedEdgeIds.has(edge.id);
            const selected = selectedEdgeId === edge.id;
            return (
              <button
                key={`label-${edge.id}`}
                type="button"
                className={`kg-real-edge-label ${edge.tone} ${highlighted ? "highlighted" : ""} ${selected ? "selected" : ""}`}
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

          {graphView.nodes.map((node) => {
            const Icon = node.Icon;
            const highlighted = matchedNodeIds.has(node.id);
            const selected = selectedNodeId === node.id;
            return (
              <button
                key={node.id}
                type="button"
                className={`kg-real-node ${node.type} ${node.tone} ${highlighted ? "highlighted" : ""} ${selected ? "selected" : ""}`}
                style={{ left: `${node.x}%`, top: `${node.y}%` }}
                onClick={() => {
                  setSelectedEdgeId(null);
                  setSelectedNodeId(selected ? null : node.id);
                }}
                aria-pressed={selected}
                aria-label={`${node.title}: ${node.value}. ${node.subtitle}`}
              >
                <span className="kg-real-node-icon">
                  <Icon size={17} />
                </span>
                <span className="kg-real-node-copy">
                  <strong>{node.title}</strong>
                  <small>{node.value}</small>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {(selectedNode || selectedEdge) && (
        <div className={`kg-node-details-card kg-simple-details ${(selectedNode?.tone ?? selectedEdge?.tone) || "watch"}`}>
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
          <p className="kg-node-subtitle">
            {selectedEdge ? labelize(selectedEdge.label) : selectedNode?.subtitle}
          </p>
          <div className="kg-grounding-box">
            <strong>Fact used</strong>
            <div>
              <span>{factLine(selectedNode ?? selectedEdge)}</span>
              <span>Reference: <code>{firstFactId(selectedNode ?? selectedEdge)}</code></span>
              <span>Private fit is buyer-only.</span>
            </div>
          </div>
        </div>
      )}

      <div className="kg-chat-box">
        <div className="kg-suggestion-row">
          {graph.chat_suggestions.slice(0, 3).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
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
            onAsk(query);
          }}
        >
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Ask: returns affect reviews?"
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

function toViewNode(node: KnowledgeGraphNode, x: number, y: number): ViewNode {
  return {
    ...node,
    x,
    y,
    title: nodeTitle(node),
    value: nodeValue(node),
    tone: nodeTone(node),
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
    showLabel: highlighted || shouldShowEdgeLabel(edge.label, expanded)
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
