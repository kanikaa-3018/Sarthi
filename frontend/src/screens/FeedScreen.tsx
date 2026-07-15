import { useEffect, useState, useMemo } from "react";
import { 
  ArrowLeft,
  Search, 
  ShieldCheck, 
  Star, 
  Truck, 
  AlertTriangle,
  Send,
  Sparkles,
  ChevronRight,
  Info,
  CheckCircle2,
  X,
  HelpCircle,
  Heart,
  BookmarkCheck,
  Ruler
} from "lucide-react";
import {
  askKnowledgeGraph,
  askSarthi,
  createExpectationContract,
  getClusterKnowledgeGraph,
  getFeed,
  getProductDetail,
  runRegretFirewall
} from "../api/client";
import { simpleTrustMeaning, t, type LanguageCode } from "../i18n";
import type {
  AgentResponse,
  ClusterKnowledgeGraph,
  CompareResponse,
  ExpectationContract,
  KnowledgeGraphChatResponse,
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  Product,
  ProductDetailResponse,
  RegretDecisionResponse
} from "../types/api";
import { CompareSheet } from "./CompareSheet";
import { CheckoutSheet } from "./CheckoutSheet";
import { AuditDrawer } from "./AuditDrawer";

type Props = {
  buyerId: string;
  ready: boolean;
  language: LanguageCode;
  experienceMode: "simple" | "standard";
};

type AutoScanState =
  | { status: "idle" }
  | { status: "scanning"; clusterId: string; title: string; listingCount: number }
  | { status: "ready"; clusterId: string; title: string; listingCount: number; result: CompareResponse }
  | { status: "error"; clusterId: string; title: string; message: string };

export function FeedScreen({ buyerId, ready, language, experienceMode }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [autoScan, setAutoScan] = useState<AutoScanState>({ status: "idle" });
  const [wishlistedProduct, setWishlistedProduct] = useState<Product | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [activeExpectationContract, setActiveExpectationContract] = useState<ExpectationContract | null>(null);
  const [auditTraceId, setAuditTraceId] = useState<string | null>(null);
  const [knowledgeGraph, setKnowledgeGraph] = useState<ClusterKnowledgeGraph | null>(null);
  const [graphAnswer, setGraphAnswer] = useState<KnowledgeGraphChatResponse | null>(null);
  const [graphQuery, setGraphQuery] = useState("");
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphAsking, setGraphAsking] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [graphSheetOpen, setGraphSheetOpen] = useState(false);
  const [regretDecision, setRegretDecision] = useState<RegretDecisionResponse | null>(null);
  const [decisionQuestion, setDecisionQuestion] = useState("");
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Buyer flow step: "feed" | "detail"
  const [step, setStep] = useState<"feed" | "detail">("feed");
  
  // Overlay/Sheet visibility
  const [compareSheetOpen, setCompareSheetOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);
  
  const [selectedClusterId, setSelectedClusterId] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [searchTerm, setSearchTerm] = useState("");

  // Load feed products
  useEffect(() => {
    if (!ready) return;
    setComparison(null);
    setSelectedProductId(null);
    setSelectedVariantId(null);
    setActiveExpectationContract(null);
    setAuditTraceId(null);
    setAutoScan({ status: "idle" });
    setWishlistedProduct(null);
    setSelectedClusterId("");
    setKnowledgeGraph(null);
    setGraphAnswer(null);
    setGraphQuery("");
    setGraphError(null);
    setGraphSheetOpen(false);
    setRegretDecision(null);
    setDecisionQuestion("");
    setDecisionLoading(false);
    setError(null);
    setStep("feed");
    
    getFeed(buyerId)
      .then((data) => {
        setProducts(data.products);
      })
      .catch((err: Error) => setError(err.message));
  }, [buyerId, ready]);

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(products.map((product) => labelize(product.category))))],
    [products]
  );

  const visibleProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return products.filter((product) => {
      const categoryMatch = selectedCategory === "All" || labelize(product.category) === selectedCategory;
      const queryMatch = !query || `${product.title} ${product.seller_name} ${product.fabric} ${product.category}`.toLowerCase().includes(query);
      return categoryMatch && queryMatch;
    });
  }, [products, searchTerm, selectedCategory]);

  const activeClusterId = selectedClusterId || wishlistedProduct?.cluster_id || "";

  function handleViewProductDetail(prodId: string, varId: string) {
    setSelectedProductId(prodId);
    setSelectedVariantId(varId);
    setActiveExpectationContract(null);
    setStep("detail");
    setCompareSheetOpen(false);
  }

  async function handleWishlistProduct(product: Product) {
    setWishlistedProduct(product);
    setSelectedClusterId(product.cluster_id);
    setActiveExpectationContract(null);
    setKnowledgeGraph(null);
    setGraphAnswer(null);
    setGraphQuery("");
    setGraphError(null);
    setGraphSheetOpen(false);
    setRegretDecision(null);
    setDecisionQuestion("");
    setGraphLoading(true);
    setDecisionLoading(true);
    setAutoScan({
      status: "scanning",
      clusterId: product.cluster_id,
      title: product.title.split("-")[0].trim(),
      listingCount: clusterListingCount(products, product.cluster_id)
    });
    setError(null);

    const [decisionOutcome, graphOutcome] = await Promise.allSettled([
      runRegretFirewall({
        buyer_id: buyerId,
        product_id: product.product_id,
        query: "Is this safe to buy before ordering?",
        create_missing_proof_request: false
      }),
      getClusterKnowledgeGraph(buyerId, product.cluster_id)
    ]);

    if (graphOutcome.status === "fulfilled") {
      setKnowledgeGraph(graphOutcome.value);
      setGraphQuery(graphOutcome.value.chat_suggestions[0] ?? "");
    } else {
      setGraphError(graphOutcome.reason instanceof Error ? graphOutcome.reason.message : "Unable to build knowledge graph");
    }
    setGraphLoading(false);
    setDecisionLoading(false);

    if (decisionOutcome.status === "fulfilled") {
      const decision = decisionOutcome.value;
      const result = compareFromDecision(decision);
      setRegretDecision(decision);
      setComparison(result);
      setAutoScan({
        status: "ready",
        clusterId: product.cluster_id,
        title: product.title.split("-")[0].trim(),
        listingCount: clusterListingCount(products, product.cluster_id),
        result
      });
      return;
    }

    const message = decisionOutcome.reason instanceof Error ? decisionOutcome.reason.message : "Unable to check this product";
    setAutoScan({
      status: "error",
      clusterId: product.cluster_id,
      title: product.title.split("-")[0].trim(),
      message
    });
  }

  async function handleAskDecision(question: string) {
    const prompt = question.trim();
    if (!prompt || !wishlistedProduct) return;
    setDecisionLoading(true);
    setError(null);
    try {
      const decision = await runRegretFirewall({
        buyer_id: buyerId,
        product_id: wishlistedProduct.product_id,
        query: prompt,
        create_missing_proof_request: true
      });
      setRegretDecision(decision);
      const result = compareFromDecision(decision);
      setComparison(result);
      setAutoScan({
        status: "ready",
        clusterId: decision.context.cluster_id,
        title: decision.selected.product.title.split("-")[0].trim(),
        listingCount: clusterListingCount(products, decision.context.cluster_id),
        result
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to answer this concern");
    } finally {
      setDecisionLoading(false);
    }
  }

  async function handleAskKnowledgeGraph(query: string) {
    const prompt = query.trim();
    if (!prompt || !knowledgeGraph) return;
    setGraphAsking(true);
    setGraphError(null);
    try {
      const response = await askKnowledgeGraph({
        buyer_id: buyerId,
        cluster_id: knowledgeGraph.cluster.cluster_id,
        query: prompt
      });
      setGraphAnswer(response);
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : "Unable to ask the knowledge graph");
    } finally {
      setGraphAsking(false);
    }
  }

  function handleOpenCheckout(variantId: string, contract: ExpectationContract) {
    setSelectedVariantId(variantId);
    setActiveExpectationContract(contract);
    setCheckoutOpen(true);
  }

function openAutoScanResult(result: CompareResponse) {
    setComparison(result);
    setSelectedClusterId(autoScan.status === "ready" ? autoScan.clusterId : activeClusterId);
    setSelectedProductId(result.selected_product_id);
    setSelectedVariantId(result.ranking.winner);
    setCompareSheetOpen(true);
  }

  return (
    <div className="feed-screen-shell">
      {error && <div className="notice error feed-error-notice">{error}</div>}

      {/* Primary Screens */}
      {step === "feed" ? (
        <MarketplaceHome
          products={visibleProducts}
          allProducts={products}
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          autoScan={autoScan}
          wishlistedProduct={wishlistedProduct}
          knowledgeGraph={knowledgeGraph}
          graphLoading={graphLoading}
          graphError={graphError}
          regretDecision={regretDecision}
          decisionQuestion={decisionQuestion}
          decisionLoading={decisionLoading}
          hasBuyerIntent={Boolean(searchTerm.trim()) || selectedCategory !== "All" || Boolean(wishlistedProduct)}
          onQuickSearch={setSearchTerm}
          onWishlistProduct={handleWishlistProduct}
          onOpenAutoScan={openAutoScanResult}
          onOpenGraph={() => setGraphSheetOpen(true)}
          onDecisionQuestionChange={setDecisionQuestion}
          onAskDecision={handleAskDecision}
          onOpenAutoScanProof={(traceId) => {
            setAuditTraceId(traceId);
            setAuditDrawerOpen(true);
          }}
        />
      ) : (
        selectedProductId && selectedVariantId && comparison && (
          <ProductDetailPanel
            buyerId={buyerId}
            productId={selectedProductId}
            initialVariantId={selectedVariantId}
            clusterId={activeClusterId}
            onBack={() => setStep("feed")}
            onOpenAudit={(traceId) => {
              setAuditTraceId(traceId);
              setAuditDrawerOpen(true);
            }}
            onOpenCheckout={handleOpenCheckout}
            language={language}
            experienceMode={experienceMode}
            comparisonTraceId={comparison.trace_id}
          />
        )
      )}

      {/* Screen 2: Modal Comparison Sheet */}
      {compareSheetOpen && comparison && (
        <div className="bottom-sheet-overlay" onClick={() => setCompareSheetOpen(false)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-success">Sarthi Curated Match</span>
                <h3 className="sheet-title">Listings Resolved</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setCompareSheetOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <CompareSheet
              comparison={comparison}
              productCatalog={products}
              language={language}
              experienceMode={experienceMode}
              onOpenAudit={() => {
                setAuditTraceId(comparison.trace_id);
                setAuditDrawerOpen(true);
              }}
              onContinue={() => handleViewProductDetail(comparison.selected_product_id, comparison.ranking.winner)}
            />
          </div>
        </div>
      )}

      {graphSheetOpen && (
        <div className="bottom-sheet-overlay" onClick={() => setGraphSheetOpen(false)}>
          <div className="bottom-sheet-content decision-graph-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header decision-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-primary">Decision Evidence</span>
                <h3 className="sheet-title">Sarthi Graph</h3>
                <p>
                  Ask why a seller was recommended. Answers stay grounded in mapped SKU, seller, review, return, price, and fit facts.
                </p>
              </div>
              <button className="bottom-sheet-close" onClick={() => setGraphSheetOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <KnowledgeGraphExplorer
              graph={knowledgeGraph}
              answer={graphAnswer}
              query={graphQuery}
              loading={graphLoading}
              asking={graphAsking}
              error={graphError}
              onQueryChange={setGraphQuery}
              onAsk={handleAskKnowledgeGraph}
              onOpenProof={(traceId) => {
                setAuditTraceId(traceId);
                setAuditDrawerOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Screen 4 & 5: Modal Checkout and Outcome loop */}
      {checkoutOpen && selectedVariantId && (
        <div className="bottom-sheet-overlay" onClick={() => setCheckoutOpen(false)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-secondary">Secure Checkout</span>
                <h3 className="sheet-title">Offer Sach Check</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setCheckoutOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <CheckoutSheet
              buyerId={buyerId}
              variantId={selectedVariantId}
              expectationContract={activeExpectationContract}
              onOpenAudit={(traceId) => {
                setAuditTraceId(traceId);
                setAuditDrawerOpen(true);
              }}
              onClose={() => setCheckoutOpen(false)}
              language={language}
              experienceMode={experienceMode}
            />
          </div>
        </div>
      )}

      {/* Diagnostic Audit Drawer */}
      {auditDrawerOpen && (
        <div className="bottom-sheet-overlay" onClick={() => setAuditDrawerOpen(false)}>
          <div className="bottom-sheet-content audit-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-primary">Pre-purchase Diagnostic Logs</span>
                <h3 className="sheet-title">How Sarthi Decided</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setAuditDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <AuditDrawer
              traceId={auditTraceId}
              onClose={() => setAuditDrawerOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function compareFromDecision(decision: RegretDecisionResponse): CompareResponse {
  return {
    trace_id: decision.trace_id,
    selected_product_id: decision.selected.product.product_id,
    ranking: decision.ranking,
    fit: decision.sku_truth_passport.fit,
    graph_path: decision.graph_paths[0] ?? {
      path_type: "regret_firewall",
      nodes: [],
      relationships: [],
      fact_ids: decision.fact_ids,
      summary: decision.decision.summary
    }
  };
}

// Marketplace Feed Component (Responsive Grid view)
function MarketplaceHome({
  products,
  allProducts,
  categories,
  selectedCategory,
  onCategoryChange,
  searchTerm,
  onSearchChange,
  autoScan,
  wishlistedProduct,
  knowledgeGraph,
  graphLoading,
  graphError,
  regretDecision,
  decisionQuestion,
  decisionLoading,
  hasBuyerIntent,
  onQuickSearch,
  onWishlistProduct,
  onOpenAutoScan,
  onOpenGraph,
  onDecisionQuestionChange,
  onAskDecision,
  onOpenAutoScanProof
}: {
  products: Product[];
  allProducts: Product[];
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  autoScan: AutoScanState;
  wishlistedProduct: Product | null;
  knowledgeGraph: ClusterKnowledgeGraph | null;
  graphLoading: boolean;
  graphError: string | null;
  regretDecision: RegretDecisionResponse | null;
  decisionQuestion: string;
  decisionLoading: boolean;
  hasBuyerIntent: boolean;
  onQuickSearch: (value: string) => void;
  onWishlistProduct: (product: Product) => void;
  onOpenAutoScan: (result: CompareResponse) => void;
  onOpenGraph: () => void;
  onDecisionQuestionChange: (value: string) => void;
  onAskDecision: (question: string) => void;
  onOpenAutoScanProof: (traceId: string) => void;
}) {
  const quickSearches = ["cotton kurti", "kurta set", "office palazzo", "work bag"];
  const savedSimilarProducts = wishlistedProduct
    ? clusterProducts(allProducts, wishlistedProduct.cluster_id).slice(0, 4)
    : [];
  const possibleComparableCount = new Set(
    products.filter((product) => product.is_sarthi_eligible).map((product) => product.cluster_id)
  ).size;
  const trimmedSearch = searchTerm.trim();
  const shelfTitle = trimmedSearch
    ? `Results for "${trimmedSearch}"`
    : selectedCategory !== "All"
      ? `${selectedCategory} products`
      : "Popular products";
  const sarthiNudgeCopy = hasBuyerIntent
    ? `${possibleComparableCount} mapped groups are ready. Save one product to compare sellers, returns, fit, and proof.`
    : "Browse normally. When you save a mapped product, Sarthi checks similar sellers and explains the safer choice.";

  return (
    <div className="marketplace-home buyer-shop-shell">
      <section className="buyer-shop-hero" aria-labelledby="buyer-shop-title">
        <div className="buyer-shop-copy">
          <span className="eyebrow">Buyer home</span>
          <h2 id="buyer-shop-title">Find a product first. Sarthi checks it only when you save it.</h2>
          <p>
            Search, compare, and keep shopping naturally. The proof layer appears after you choose a product you actually care about.
          </p>
        </div>
        <div className="shop-trust-row" aria-label="Sarthi trust checks">
          <span><ShieldCheck size={14} /> Seller proof</span>
          <span><Ruler size={14} /> Size fit</span>
          <span><AlertTriangle size={14} /> Return risk</span>
        </div>
      </section>

      <section className="shop-search-card" aria-label="Search catalog">
        <div className="shop-search-input">
          <Search size={18} />
          <input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search products, fabric, seller, or use case"
          />
        </div>

        <div className="quick-search-row" aria-label="Quick searches">
          <span>Try</span>
          <div>
            {quickSearches.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onQuickSearch(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="category-chip-row" aria-label="Product categories">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryChange(cat)}
              className={cat === selectedCategory ? "active" : ""}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {wishlistedProduct ? (
        <SarthiLensPanel
          autoScan={autoScan}
          savedProduct={wishlistedProduct}
          similarProducts={savedSimilarProducts}
          knowledgeGraph={knowledgeGraph}
          graphLoading={graphLoading}
          graphError={graphError}
          regretDecision={regretDecision}
          decisionQuestion={decisionQuestion}
          decisionLoading={decisionLoading}
          possibleComparableCount={possibleComparableCount}
          onOpenResult={onOpenAutoScan}
          onOpenProof={onOpenAutoScanProof}
          onOpenGraph={onOpenGraph}
          onDecisionQuestionChange={onDecisionQuestionChange}
          onAskDecision={onAskDecision}
        />
      ) : (
        <div className="sarthi-nudge-strip" aria-live="polite">
          <span className="sarthi-nudge-icon">
            <Sparkles size={17} />
          </span>
          <div>
            <strong>Sarthi is waiting for your saved product</strong>
            <p>{sarthiNudgeCopy}</p>
          </div>
          <span>{possibleComparableCount} groups</span>
        </div>
      )}

      <div className="shop-section-heading">
        <div>
          <span className="eyebrow">Catalog</span>
          <h3>{shelfTitle}</h3>
        </div>
        <span>{products.length} options</span>
      </div>

      {products.length > 0 && (
        <div className="web-product-grid">
          {products.map((p) => {
            const strikePrice = Math.round(p.base_price * 1.35);
            const isSaved = wishlistedProduct?.product_id === p.product_id;
            return (
              <div
                key={p.product_id}
                className={`buyer-product-card ${isSaved ? "saved" : ""}`}
              >
                <div className="buyer-product-image">
                  <img
                    src={p.image_url || fallbackProductImage(p.color_family)}
                    alt={p.title}
                    onError={(e) => { e.currentTarget.src = fallbackProductImage(p.color_family); }}
                  />
                  {p.commerce_badge && (
                    <span className="product-badge commerce">{p.commerce_badge}</span>
                  )}
                  {p.is_sarthi_eligible ? (
                    <span className="product-badge mapped">Sarthi mapped</span>
                  ) : (
                    <span className="product-badge catalog">Catalog only</span>
                  )}
                </div>
                <div className="buyer-product-body">
                  <strong className="buyer-product-title">
                    {p.title.split("-")[0].trim()}
                  </strong>
                  <div className="buyer-product-seller-row">
                    <span>{p.seller_name}</span>
                    {p.is_sarthi_eligible ? (
                      <strong>{clusterListingCount(allProducts, p.cluster_id)} mapped</strong>
                    ) : null}
                  </div>

                  <div className="product-rating-row">
                    <span>
                      {p.rating.toFixed(1)}
                      <Star size={9} fill="currentColor" />
                    </span>
                    <small>{p.rating_count.toLocaleString("en-IN")} reviews</small>
                  </div>

                  <div className="product-price-row">
                    <strong>Rs {p.base_price}</strong>
                    <span>Rs {strikePrice}</span>
                    <small>35% off</small>
                  </div>

                  <div className="product-delivery-row">
                    <Truck size={12} />
                    <span>{p.delivery_text || "Free delivery"}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (p.is_sarthi_eligible) {
                        void onWishlistProduct(p);
                      }
                    }}
                    disabled={!p.is_sarthi_eligible}
                    className={`buyer-save-btn ${isSaved ? "saved" : ""}`}
                  >
                    {isSaved ? <BookmarkCheck size={13} /> : <Heart size={13} />}
                    <span>{isSaved ? "Saved for Sarthi" : p.is_sarthi_eligible ? "Save for Sarthi check" : "No comparison yet"}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {products.length === 0 && (
        <div className="catalog-empty-state">
          <strong>No matching products found</strong>
          <p>Try a broader search like kurti, saree, bag, or bedsheet.</p>
        </div>
      )}
    </div>
  );
}

function SarthiLensPanel({
  autoScan,
  savedProduct,
  similarProducts,
  knowledgeGraph,
  graphLoading,
  graphError,
  regretDecision,
  decisionQuestion,
  decisionLoading,
  possibleComparableCount,
  onOpenResult,
  onOpenProof,
  onOpenGraph,
  onDecisionQuestionChange,
  onAskDecision
}: {
  autoScan: AutoScanState;
  savedProduct: Product | null;
  similarProducts: Product[];
  knowledgeGraph: ClusterKnowledgeGraph | null;
  graphLoading: boolean;
  graphError: string | null;
  regretDecision: RegretDecisionResponse | null;
  decisionQuestion: string;
  decisionLoading: boolean;
  possibleComparableCount: number;
  onOpenResult: (result: CompareResponse) => void;
  onOpenProof: (traceId: string) => void;
  onOpenGraph: () => void;
  onDecisionQuestionChange: (value: string) => void;
  onAskDecision: (question: string) => void;
}) {
  const result = autoScan.status === "ready" ? autoScan.result : null;
  const isScanning = autoScan.status === "scanning";
  const isReady = autoScan.status === "ready";
  const scanCount = autoScan.status === "scanning" || autoScan.status === "ready"
    ? autoScan.listingCount
    : similarProducts.length;
  const scanSubject = autoScan.status === "idle"
    ? savedProduct?.title.split("-")[0].trim() ?? "this product"
    : autoScan.title;
  const winnerProduct = result ? productForVariant(result.ranking.winner, similarProducts) : null;
  const alternativeProduct = result?.ranking.alternative
    ? productForVariant(result.ranking.alternative, similarProducts)
    : null;

  if (!savedProduct) {
    return (
      <section className="sarthi-lens-panel waiting">
        <div className="lens-header">
          <div className="lens-icon">
            <ShieldCheck size={16} />
          </div>
          <div>
            <span className="eyebrow">Sarthi check</span>
            <h2>Save a product when you want help deciding</h2>
            <p>
              {possibleComparableCount > 0
                ? `${possibleComparableCount} comparable product groups are available in these results.`
                : "These results are browsable, but Sarthi will only compare products with enough mapped evidence."}
              {" "}The recommendation starts only after you save one product.
            </p>
          </div>
        </div>
        <div className="lens-guard-row">
          <span>No hidden auto-buy pressure</span>
          <span>No seller ads used</span>
          <span>Buyer memory stays private</span>
        </div>
      </section>
    );
  }

  return (
    <section className={`sarthi-lens-panel ${isScanning ? "scanning" : ""} ${isReady ? "ready" : ""}`}>
      <div className="lens-header">
        <div className="lens-icon">
          <ShieldCheck size={16} />
        </div>
        <div>
          <span className="eyebrow">Sarthi check</span>
          <h2>
            {result
              ? "Recommendation ready"
              : autoScan.status === "error"
                ? "Sarthi could not complete this scan"
                : `Checking ${similarProducts.length || scanCount} similar seller options`}
          </h2>
          <p>
            {result
              ? `${scanSubject} was ranked using fit, return risk, seller reliability, price facts, reviews, and private buyer context.`
              : autoScan.status === "error"
                ? autoScan.message
                : `You saved ${savedProduct.title.split("-")[0].trim()}. Sarthi is comparing only mapped seller alternatives for this product.`}
          </p>
        </div>
      </div>

      <div className="lens-selected-strip">
        <img
          src={(winnerProduct ?? savedProduct).image_url || fallbackProductImage((winnerProduct ?? savedProduct).color_family)}
          alt={(winnerProduct ?? savedProduct).title}
          onError={(event) => { event.currentTarget.src = fallbackProductImage((winnerProduct ?? savedProduct).color_family); }}
        />
        <div>
          <span>{result ? "Sarthi pick" : "Saved by you"}</span>
          <strong>{(winnerProduct ?? savedProduct).title.split("-")[0].trim()}</strong>
          <small>
            {(winnerProduct ?? savedProduct).seller_name} | Rs {(winnerProduct ?? savedProduct).base_price}
          </small>
        </div>
      </div>

      <LensDecisionSummary
        result={result}
        savedProduct={savedProduct}
        winnerProduct={winnerProduct}
        alternativeProduct={alternativeProduct}
        graph={knowledgeGraph}
        scanCount={similarProducts.length || scanCount}
        isScanning={isScanning}
        regretDecision={regretDecision}
      />

      <DecisionQuestionBox
        value={decisionQuestion}
        loading={decisionLoading}
        decision={regretDecision}
        onChange={onDecisionQuestionChange}
        onAsk={onAskDecision}
      />

      {result && (
        <div className="lens-action-row">
          <button className="lens-primary-action" onClick={() => onOpenResult(result)}>
            <CheckCircle2 size={14} />
            <span>View best option</span>
          </button>
          <button className="lens-secondary-action" onClick={() => onOpenProof(result.trace_id)}>
            <HelpCircle size={14} />
            <span>Proof</span>
          </button>
          <button
            className="lens-secondary-action"
            onClick={onOpenGraph}
            disabled={graphLoading || (!knowledgeGraph && !graphError)}
          >
            <Info size={14} />
            <span>{graphLoading ? "Preparing evidence" : graphError ? "Graph status" : "Ask graph"}</span>
          </button>
        </div>
      )}
    </section>
  );
}

function LensDecisionSummary({
  result,
  savedProduct,
  winnerProduct,
  alternativeProduct,
  graph,
  scanCount,
  isScanning,
  regretDecision
}: {
  result: CompareResponse | null;
  savedProduct: Product;
  winnerProduct: Product | null;
  alternativeProduct: Product | null;
  graph: ClusterKnowledgeGraph | null;
  scanCount: number;
  isScanning: boolean;
  regretDecision: RegretDecisionResponse | null;
}) {
  if (!result) {
    return (
      <div className="lens-clean-summary scanning-state">
        <div>
          <span className="eyebrow">Quiet check running</span>
          <h3>{isScanning ? "Finding the safest seller option" : "Ready to check this product"}</h3>
          <p>
            Sarthi is comparing seller trust, SKU returns, fit, reviews, price facts, and your private fit context in the background.
          </p>
        </div>
        <div className="lens-progress-row">
          <span className={graph ? "complete" : ""}>Seller map</span>
          <span className={isScanning ? "active" : ""}>Risk score</span>
          <span>Fit check</span>
        </div>
      </div>
    );
  }

  const winner = winnerProduct ?? savedProduct;
  const winnerCandidate = candidateForProduct(result, winner);
  const score = winnerCandidate ? Math.round(winnerCandidate.score * 100) : null;
  const graphContext = graph?.seller_context.find((context) => context.product.product_id === winner.product_id);
  const returnRate = graphContext ? Math.round(graphContext.evidence.return_rate * 100) : null;
  const sellerStatus = graphContext?.seller.verification.verification_status ?? "checked";
  const proofCountValue = proofCount(result);
  const decision = regretDecision?.decision;
  const passport = regretDecision?.sku_truth_passport;

  return (
    <div className="lens-clean-summary ready-state">
      <div className="lens-decision-top">
        <div>
          <span className="eyebrow">Sarthi decision</span>
          <h3>{decision?.label ?? winner.seller_name}</h3>
          <p>
            {decision?.summary ?? `Best among ${scanCount} mapped seller options for ${winner.title.split("-")[0].trim()}.`}
          </p>
        </div>
        <div className="lens-score-badge">
          <strong>{score ?? "--"}</strong>
          <span>kept score</span>
        </div>
      </div>

      <div className="lens-evidence-chips">
        <span>Size {passport?.fit.recommended_size ?? result.fit.recommended_size}</span>
        <span>{returnRate === null ? "Returns checked" : `${returnRate}% return rate`}</span>
        <span>{labelize(sellerStatus)} seller</span>
        <span>{passport?.proof_coverage ? evidenceGapLabel(passport.evidence_gaps.length) : `${proofCountValue} facts`}</span>
      </div>

      <div className="lens-reason-line">
        <CheckCircle2 size={15} />
        <span>{decision ? decision.primary_action.replace(/_/g, " ") : result.ranking.top_factors.slice(0, 2).join(" + ")}</span>
      </div>

      {alternativeProduct && alternativeProduct.product_id !== winner.product_id && (
        <div className="lens-backup-line">
          <span>Backup option</span>
          <strong>{alternativeProduct.seller_name}</strong>
        </div>
      )}
    </div>
  );
}

function DecisionQuestionBox({
  value,
  loading,
  decision,
  onChange,
  onAsk
}: {
  value: string;
  loading: boolean;
  decision: RegretDecisionResponse | null;
  onChange: (value: string) => void;
  onAsk: (question: string) => void;
}) {
  return (
    <form
      className="decision-question-box"
      onSubmit={(event) => {
        event.preventDefault();
        onAsk(value);
      }}
    >
      <div>
        <span className="eyebrow">Ask one doubt</span>
        <p>
          If proof is missing, Sarthi asks the seller for evidence instead of guessing.
        </p>
      </div>
      <div className="decision-question-input">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Kapda transparent toh nahi hai?"
        />
        <button type="submit" disabled={loading || !value.trim()}>
          <Send size={14} />
          <span>{loading ? "Checking" : "Check"}</span>
        </button>
      </div>
      {decision?.proof_request && (
        <div className="decision-proof-requested">
          <Info size={14} />
          <span>
            Seller proof requested for {decision.proof_request.attribute}. Demand count: {decision.proof_request.request_count}
          </span>
        </div>
      )}
    </form>
  );
}

function KnowledgeGraphExplorer({
  graph,
  answer,
  query,
  loading,
  asking,
  error,
  onQueryChange,
  onAsk,
  onOpenProof
}: {
  graph: ClusterKnowledgeGraph | null;
  answer: KnowledgeGraphChatResponse | null;
  query: string;
  loading: boolean;
  asking: boolean;
  error: string | null;
  onQueryChange: (value: string) => void;
  onAsk: (query: string) => void;
  onOpenProof: (traceId: string) => void;
}) {
  if (loading) {
    return (
      <div className="kg-card loading">
        <div className="kg-card-header">
          <div>
            <span className="eyebrow">Knowledge graph</span>
            <h3>Building graph from SKU facts</h3>
          </div>
          <span className="kg-live-pill">Live facts</span>
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
            <span className="eyebrow">Knowledge graph</span>
            <h3>Graph unavailable</h3>
          </div>
        </div>
        <p>{error}</p>
      </div>
    );
  }

  if (!graph) return null;

  const matchedNodeIds = new Set(answer?.answer.matched_node_ids ?? []);
  const layout = layoutGraph(graph, matchedNodeIds);
  const highlightedEdges = new Set(answer?.answer.highlighted_edge_ids ?? []);
  const visibleNodeIds = new Set(layout.nodes.map((node) => node.id));

  return (
    <div className="kg-card">
      <div className="kg-card-header">
        <div>
          <span className="eyebrow">Ask Sarthi Graph</span>
          <h3>Ask why, before you buy</h3>
          <p>Answers use this product's sellers, SKU returns, ratings, reviews, fabric, price, and proof trail.</p>
        </div>
        <span className="kg-live-pill">{graph.summary.fact_count} facts</span>
      </div>

      <div className="kg-graph-shell">
        <div className="kg-map-title">
          <strong>{answer ? "Answer path" : "Decision path"}</strong>
          <span>{answer ? "Highlighted by your question" : "Focused view, not the full data dump"}</span>
        </div>
        <svg viewBox="0 0 100 68" role="img" aria-label="Sarthi product knowledge graph">
          {layout.edges
            .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
            .map((edge) => {
              const source = layout.nodeMap.get(edge.source);
              const target = layout.nodeMap.get(edge.target);
              if (!source || !target) return null;
              const highlighted = highlightedEdges.has(edge.id) || matchedNodeIds.has(edge.source) || matchedNodeIds.has(edge.target);
              return (
                <line
                  key={edge.id}
                  className={`kg-edge ${highlighted ? "highlighted" : ""}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  strokeWidth={0.45 + edge.weight * 0.9}
                />
              );
            })}

          {layout.nodes.map((node) => (
            <g
              key={node.id}
              className={`kg-node ${node.type} ${matchedNodeIds.has(node.id) ? "highlighted" : ""}`}
              transform={`translate(${node.x} ${node.y})`}
            >
              <circle r={node.type === "cluster" ? 3.2 : node.type === "product" ? 2.8 : 2.35} />
              <text y={node.type === "cluster" ? -4.2 : 4.8}>{shortNodeLabel(node)}</text>
              <title>{node.label} - {node.subtitle}</title>
            </g>
          ))}
        </svg>
      </div>

      <div className="kg-legend-row">
        <span>Seller</span>
        <span>SKU facts</span>
        <span>Reviews</span>
        <span>Private fit</span>
      </div>

      <div className="kg-chat-box">
        <div className="kg-suggestion-row">
          {graph.chat_suggestions.slice(0, 2).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                onQueryChange(suggestion);
                onAsk(suggestion);
              }}
            >
              {suggestion}
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
            placeholder="Ask the graph about seller, returns, size, fabric, price..."
          />
          <button type="submit" disabled={asking || !query.trim()}>
            <Send size={14} />
            <span>{asking ? "Asking" : "Ask"}</span>
          </button>
        </form>

        {answer && (
          <div className="kg-answer-card">
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
              {answer.answer.reasons.map((reason) => (
                <span key={reason}>{reason}</span>
              ))}
            </div>
          </div>
        )}

        {error && <p className="kg-inline-error">{error}</p>}
      </div>
    </div>
  );
}

function proofCount(result: CompareResponse) {
  return new Set([
    ...result.ranking.fact_ids,
    ...result.fit.fact_ids,
    ...result.graph_path.fact_ids
  ]).size;
}

function evidenceGapLabel(count: number) {
  if (count === 0) return "Proof complete";
  if (count === 1) return "1 proof gap";
  return `${count} proof gaps`;
}

function clusterListingCount(products: Product[], clusterId: string) {
  return products.filter((product) => product.cluster_id === clusterId).length;
}

function clusterProducts(products: Product[], clusterId: string) {
  return products.filter((product) => product.cluster_id === clusterId && product.is_sarthi_eligible);
}

function productForVariant(variantId: string, products: Product[]) {
  const productId = variantProductId(variantId);
  return products.find((product) => product.product_id === productId) ?? null;
}

function candidateForProduct(result: CompareResponse, product: Product) {
  return result.ranking.candidates.find((candidate) => variantProductId(candidate.variant_id) === product.product_id) ?? null;
}

function candidateRank(result: CompareResponse, product: Product) {
  const rank = result.ranking.candidates.findIndex((candidate) => variantProductId(candidate.variant_id) === product.product_id);
  return rank === -1 ? 999 : rank;
}

function variantProductId(variantId: string) {
  return variantId.replace(/_(xs|s|m|l|xl|xxl|free)$/i, "");
}

type LayoutGraphNode = KnowledgeGraphNode & { x: number; y: number };

function layoutGraph(graph: ClusterKnowledgeGraph, matchedNodeIds: Set<string>) {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const winnerContext = graph.selected_product_id
    ? graph.seller_context.find((context) => context.product.product_id === graph.selected_product_id)
    : graph.seller_context[0];
  const baseIds = [
    `cluster:${graph.cluster.cluster_id}`,
    winnerContext?.node_ids.seller,
    winnerContext?.node_ids.product,
    winnerContext?.node_ids.variant,
    winnerContext?.node_ids.evidence,
    winnerContext?.node_ids.reviews,
    winnerContext?.node_ids.price,
    `buyer:${graph.buyer_id}`
  ].filter(Boolean) as string[];
  const visible = uniqueNodes([
    ...baseIds.map((id) => nodeById.get(id)).filter(Boolean),
    ...[...matchedNodeIds].map((id) => nodeById.get(id)).filter(Boolean)
  ] as KnowledgeGraphNode[]).slice(0, 12);

  const positions: Record<KnowledgeGraphNode["type"], { x: number; y: number }> = {
    cluster: { x: 10, y: 34 },
    seller: { x: 27, y: 21 },
    product: { x: 43, y: 34 },
    sku: { x: 59, y: 34 },
    evidence: { x: 75, y: 19 },
    reviews: { x: 90, y: 16 },
    price: { x: 90, y: 34 },
    return_reason: { x: 90, y: 52 },
    fabric: { x: 75, y: 49 },
    rating: { x: 90, y: 49 },
    buyer_context: { x: 59, y: 56 }
  };

  const typeCounts = new Map<string, number>();
  const nodes: LayoutGraphNode[] = visible.map((node) => {
    const count = typeCounts.get(node.type) ?? 0;
    typeCounts.set(node.type, count + 1);
    const base = positions[node.type];
    const isExtraMatchedNode = matchedNodeIds.has(node.id) && !baseIds.includes(node.id);
    if (isExtraMatchedNode) {
      return {
        ...node,
        x: 75 + (count % 2) * 15,
        y: 20 + count * 9
      };
    }
    return {
      ...node,
      x: Math.min(93, base.x),
      y: Math.min(60, base.y + count * 7)
    };
  });
  const visibleIds = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: graph.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    nodeMap: new Map(nodes.map((node) => [node.id, node]))
  };
}

function uniqueNodes(nodes: KnowledgeGraphNode[]) {
  const seen = new Set<string>();
  return nodes.filter((node) => {
    if (seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

function shortNodeLabel(node: KnowledgeGraphNode) {
  if (node.type === "cluster") return "Cluster";
  if (node.type === "buyer_context") return "Your fit";
  if (node.type === "sku") return node.label;
  const words = node.label.split(/\s+/).filter(Boolean);
  const label = words.slice(0, 2).join(" ") || node.type;
  return label.length > 14 ? `${label.slice(0, 13)}...` : label;
}

// Screen 3: Responsive Split 2-Column Product Detail Panel
function ProductDetailPanel({
  buyerId,
  productId,
  initialVariantId,
  clusterId,
  onBack,
  onOpenAudit,
  onOpenCheckout,
  language,
  experienceMode,
  comparisonTraceId
}: {
  buyerId: string;
  productId: string;
  initialVariantId: string;
  clusterId: string;
  onBack: () => void;
  onOpenAudit: (traceId: string) => void;
  onOpenCheckout: (variantId: string, contract: ExpectationContract) => void;
  language: LanguageCode;
  experienceMode: "simple" | "standard";
  comparisonTraceId: string;
}) {
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariantId);
  const [query, setQuery] = useState("Mera usual size L hai, chest tight toh nahi hoga?");
  const [answer, setAnswer] = useState<AgentResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [contractLocking, setContractLocking] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);

  useEffect(() => {
    setContractError(null);
    getProductDetail(buyerId, productId)
      .then((payload) => {
        setDetail(payload);
        const initialVariant = payload.variants.find((variant) => variant.variant_id === initialVariantId);
        setSelectedVariantId(initialVariant?.variant_id ?? payload.selected_variant.variant_id);
      });
  }, [buyerId, productId, initialVariantId]);

  if (!detail) {
    return (
      <div className="detail-loading-state">
        <div />
        <span />
      </div>
    );
  }

  async function submitQuestion() {
    setSubmitting(true);
    setAnswer(null);
    setQuestionError(null);
    try {
      const response = await askSarthi({
        buyer_id: buyerId,
        query,
        language,
        cluster_id: clusterId,
        selected_variant_id: selectedVariantId
      });
      setAnswer(response);
      if (response.answer.primary_action?.variant_id) {
        setSelectedVariantId(response.answer.primary_action.variant_id);
      }
    } catch (err) {
      setQuestionError(
        err instanceof Error
          ? err.message
          : "Sarthi could not answer from verified facts right now."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const selectedVariant = detail.variants.find((v) => v.variant_id === selectedVariantId) || detail.selected_variant;
  const displayTitle = detail.product.title.split("-")[0].trim();
  const strikePrice = Math.round(selectedVariant.current_price * 1.35);
  const sizeAccuracy = Math.round(detail.evidence.fit_as_expected_rate * 100);
  const colorMatch = detail.evidence.delivered_orders_90d
    ? Math.round((1 - detail.evidence.color_mismatch_returns / detail.evidence.delivered_orders_90d) * 100)
    : null;

  async function handleBuyWithContract() {
    setContractLocking(true);
    setContractError(null);
    try {
      const contract = await createExpectationContract({
        buyer_id: buyerId,
        variant_id: selectedVariant.variant_id,
        preferred_fit: "comfort"
      });
      onOpenCheckout(selectedVariant.variant_id, contract);
    } catch (err) {
      setContractError(err instanceof Error ? err.message : "Could not lock expectation contract");
    } finally {
      setContractLocking(false);
    }
  }

  return (
    <div className="product-detail-shell">
      <div className="product-detail-header">
        <button type="button" onClick={onBack} aria-label="Back to catalog">
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="eyebrow">Selected listing</span>
          <strong>Back to catalog</strong>
        </div>
      </div>

      <div className="web-detail-layout">
        <div className="detail-gallery-container">
          <section className="detail-product-card">
            <div className="detail-image-frame">
              <img
                src={detail.product.image_url || fallbackProductImage(detail.product.color_family)}
                alt={detail.product.title}
              />
              <span>{detail.product.fabric}</span>
            </div>
            <div className="detail-product-summary">
              <span>Sold by {detail.product.seller_name}</span>
              <h1>{displayTitle}</h1>
              <div className="detail-price-row">
                <strong>Rs {selectedVariant.current_price}</strong>
                <span>Rs {strikePrice}</span>
                <small>{selectedVariant.stock} in stock</small>
              </div>
            </div>
          </section>

          <section className="size-selector-card">
            <div className="section-heading-row compact">
              <div>
                <span className="eyebrow">Size Oracle</span>
                <h3>Select size</h3>
              </div>
              <span className="ui-badge neutral">{detail.fit.confidence} confidence</span>
            </div>
            <div className="detail-size-options">
              {detail.variants.map((v) => (
                <button
                  key={v.variant_id}
                  type="button"
                  onClick={() => setSelectedVariantId(v.variant_id)}
                  className={v.variant_id === selectedVariantId ? "active" : ""}
                >
                  {v.size}
                </button>
              ))}
            </div>
            <p>
              Sarthi recommends <strong>{detail.fit.recommended_size}</strong> from category fit memory and SKU outcomes.
            </p>
          </section>

          <section className="sku-evidence-card">
            <span className="eyebrow">SKU factual evidence</span>
            <div className="sku-evidence-grid">
              <div>
                <span>Size accuracy</span>
                <strong>{sizeAccuracy}%</strong>
              </div>
              <div>
                <span>Color match</span>
                <strong>{colorMatch === null ? "Unknown" : `${colorMatch}%`}</strong>
              </div>
              <div>
                <span>Dispatch SLA</span>
                <strong>{detail.evidence.median_dispatch_hours}h</strong>
              </div>
            </div>
            <p>
              Denominator: <strong>{detail.evidence.delivered_orders_90d}</strong> delivered orders and{" "}
              <strong>{detail.evidence.returns_90d}</strong> returns in the current evidence window.
            </p>
          </section>
        </div>

        <div className="detail-info-container">
          <div className="sarthi-confidence-strip">
            <div className="strip-row">
              <Ruler size={17} />
              <span><strong>Size</strong> {detail.fit.recommended_size} recommended</span>
            </div>
            {detail.avoidable_issue && (
              <div className="strip-row caution">
                <AlertTriangle size={16} />
                <span><strong>Watch for</strong> {detail.avoidable_issue.title}</span>
              </div>
            )}
            <button className="strip-row evidence" type="button" onClick={() => onOpenAudit(comparisonTraceId)}>
              <CheckCircle2 size={16} />
              <span><strong>Evidence</strong> {detail.evidence.evidence_strength} | {detail.evidence.delivered_orders_90d} recent delivered orders</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <TrustReceipt
            detail={detail}
            language={language}
            experienceMode={experienceMode}
            comparisonTraceId={comparisonTraceId}
            onOpenAudit={onOpenAudit}
          />

          <AgentCheckTimeline detail={detail} />

          <ExpectationContractPreview
            detail={detail}
            selectedVariant={selectedVariant}
          />

          <section className="samvaad-card">
            <div className="samvaad-card-header">
              <Sparkles size={18} />
              <div>
                <span className="eyebrow">Samvaad</span>
                <h3>Ask before ordering</h3>
              </div>
            </div>
            <p>
              Ask in Hinglish about fabric transparency, texture, or standard sizes.
            </p>

            <div className="samvaad-suggestion-list">
              <button
                type="button"
                onClick={() => setQuery("Mera usual size L hai, yahan kya size standard rahega?")}
              >
                "Mera usual size L hai, yahan kya size standard rahega?"
              </button>
              <button
                type="button"
                onClick={() => setQuery("Kapde ka color print mismatch toh nahi hai? Fabric transparency?")}
              >
                "Kapde ka color print mismatch toh nahi hai? Fabric transparency?"
              </button>
            </div>

            <div className="samvaad-input-row">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask Sarthi..."
              />
              <button
                type="button"
                onClick={submitQuestion}
                disabled={submitting || !query.trim()}
                aria-label="Ask Sarthi"
              >
                <Send size={15} />
              </button>
            </div>

            {questionError && (
              <div className="notice error samvaad-error">
                Sarthi could not answer this from verified facts right now. Please retry or inspect the product proof.
              </div>
            )}

            {answer && (
              <div className="samvaad-response-card">
                <div className="response-conclusion">
                  <strong>Sarthi Answer</strong>
                  <p>{answer.answer.summary}</p>
                </div>
                <div className="response-reasons">
                  {answer.answer.reasons.map((r, idx) => (
                    <div key={idx} className="reason-bullet">
                      <CheckCircle2 size={14} />
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
                {answer.answer.caution && (
                  <div className="response-caution">
                    <strong>Caution</strong>
                    <span>{answer.answer.caution}</span>
                  </div>
                )}
                <div className="response-actions">
                  <button
                    className="btn-action-primary"
                    onClick={() => {
                      if (answer.answer.primary_action?.variant_id) {
                        setSelectedVariantId(answer.answer.primary_action.variant_id);
                      }
                    }}
                  >
                    {answer.answer.primary_action?.label || "Apply size selection"}
                  </button>
                  <button className="btn-action-secondary" onClick={() => onOpenAudit(answer.trace_id)}>
                    See proof
                  </button>
                </div>
              </div>
            )}
          </section>

          {contractError && <div className="notice error">{contractError}</div>}

          <section className="cod-action-card">
            <div>
              <span>Size {selectedVariant.size} selected</span>
              <strong>Rs {selectedVariant.current_price}</strong>
            </div>
            
            <button
              className="btn-sticky-buy"
              type="button"
              onClick={handleBuyWithContract}
              disabled={contractLocking}
            >
              <span>{contractLocking ? "Locking contract" : "Buy COD with Sarthi"}</span>
              <ChevronRight size={18} />
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function ExpectationContractPreview({
  detail,
  selectedVariant
}: {
  detail: ProductDetailResponse;
  selectedVariant: ProductDetailResponse["selected_variant"];
}) {
  const colorMatch = detail.evidence.delivered_orders_90d
    ? Math.round((1 - detail.evidence.color_mismatch_returns / detail.evidence.delivered_orders_90d) * 100)
    : null;
  const checks = [
    {
      label: "Fit",
      value: `Size ${selectedVariant.size}, Sarthi recommends ${detail.fit.recommended_size}`,
      status: detail.fit.confidence
    },
    {
      label: "Fabric",
      value: `${detail.product.fabric} listing checked against reviews and seller proof`,
      status: detail.trust_state.missing_data.includes("fabric") ? "low" : "medium"
    },
    {
      label: "Color",
      value: colorMatch === null ? "Color evidence checked where available" : `${colorMatch}% color match signal`,
      status: detail.avoidable_issue?.reason === "color_different" ? "low" : "medium"
    },
    {
      label: "Offer",
      value: "Price urgency will be checked again before order",
      status: "medium"
    }
  ];

  return (
    <div className="expectation-preview-card">
      <div className="expectation-preview-header">
        <div>
          <span className="eyebrow">Expectation contract</span>
          <h3>What Sarthi will hold accountable</h3>
          <p>
            Before checkout, Sarthi locks a fact-backed snapshot of size, fabric, color, dispatch, and offer claims for this exact SKU.
          </p>
        </div>
        <span>{detail.evidence.delivered_orders_90d} orders</span>
      </div>
      <div className="expectation-preview-grid">
        {checks.map((check) => (
          <div key={check.label}>
            <span>{check.label}</span>
            <strong>{check.value}</strong>
            <small>{labelize(check.status)} confidence</small>
          </div>
        ))}
      </div>
      <div className="expectation-privacy-line">
        <ShieldCheck size={14} />
        <span>Seller sees only aggregate broken expectations, never your private fit memory.</span>
      </div>
    </div>
  );
}

function TrustReceipt({
  detail,
  language,
  experienceMode,
  comparisonTraceId,
  onOpenAudit
}: {
  detail: ProductDetailResponse;
  language: LanguageCode;
  experienceMode: "simple" | "standard";
  comparisonTraceId: string;
  onOpenAudit: (traceId: string) => void;
}) {
  const trust = detail.trust_state;
  const allowed = trust.can_recommend;
  const sourceStatus = trust.data_freshness.overall_status;
  const graphFactCount = new Set(detail.graph_paths.flatMap((path) => path.fact_ids)).size;

  return (
    <div className={`trust-receipt-card ${experienceMode === "simple" ? "simple" : ""}`}>
      <div className="trust-receipt-top">
        <div>
          <span className="eyebrow sheet-eyebrow-primary">{t(language, "trustReceipt")}</span>
          <h3>{trust.headline}</h3>
        </div>
        <span className={`trust-receipt-pill ${allowed ? "allowed" : "paused"}`}>
          {allowed ? t(language, "recommendationAllowed") : t(language, "recommendationPaused")}
        </span>
      </div>

      <div className="trust-receipt-section">
        <span>{t(language, "whatThisMeans")}</span>
        <strong>
          {experienceMode === "simple"
            ? simpleTrustMeaning(trust.status, trust.can_recommend, language)
            : trust.summary}
        </strong>
      </div>

      <div className="trust-receipt-section">
        <span>{t(language, "nextStep")}</span>
        <strong>{trust.buyer_guidance}</strong>
      </div>

      {trust.missing_data.length > 0 && (
        <div className="compare-simple-note">
          <Info size={14} />
          <span>Missing proof: {trust.missing_data.slice(0, 2).join(", ")}</span>
        </div>
      )}

      {experienceMode === "standard" && (
        <div className="trust-receipt-facts">
          <div>
            <span>Seller</span>
            <strong>{labelize(trust.seller_verification.verification_status)}</strong>
          </div>
          <div>
            <span>Evidence</span>
            <strong>{detail.evidence.evidence_strength}</strong>
          </div>
          <div>
            <span>Sources</span>
            <strong>{labelize(sourceStatus)}</strong>
          </div>
          <div>
            <span>Orders</span>
            <strong>{String(detail.evidence.delivered_orders_90d)}</strong>
          </div>
          <div>
            <span>Graph proof</span>
            <strong>{String(graphFactCount)}</strong>
          </div>
          <div>
            <span>Memory</span>
            <strong>{detail.privacy.fit_memory_enabled ? "On" : "Off"}</strong>
          </div>
        </div>
      )}

      <button
        className="btn-action-secondary trust-proof-button"
        onClick={() => onOpenAudit(comparisonTraceId)}
      >
        See decision proof
      </button>
    </div>
  );
}

function AgentCheckTimeline({ detail }: { detail: ProductDetailResponse }) {
  const trust = detail.trust_state;
  const sourceHealthy = !trust.data_freshness.blocking;
  const sellerVerified = trust.seller_verification.verification_status === "verified";
  const enoughEvidence = ["medium", "strong"].includes(detail.evidence.evidence_strength);
  const fitConfident = detail.fit.confidence !== "low";

  const checks = [
    {
      title: "Seller verification",
      passed: sellerVerified,
      body: sellerVerified
        ? `${detail.product.seller_name} has verified seller status.`
        : `Seller status is ${labelize(trust.seller_verification.verification_status)}.`
    },
    {
      title: "Return evidence",
      passed: enoughEvidence,
      body: `${detail.evidence.delivered_orders_90d} delivered orders and ${detail.evidence.returns_90d} returns checked.`
    },
    {
      title: "Size fit",
      passed: fitConfident,
      body: `Recommended size is ${detail.fit.recommended_size} with ${detail.fit.confidence} confidence.`
    },
    {
      title: "Source freshness",
      passed: sourceHealthy,
      body: `Data source status is ${labelize(trust.data_freshness.overall_status)}.`
    },
    {
      title: "Privacy boundary",
      passed: true,
      body: detail.privacy.fit_memory_enabled
        ? "Personal fit memory was used only for this buyer."
        : "Personal fit memory is off; Sarthi used aggregate evidence only."
    }
  ];

  return (
    <div className="agent-check-card">
      <div className="agent-check-header">
        <div>
          <span className="eyebrow sheet-eyebrow-primary">Agent checks</span>
          <h3>What Sarthi verified</h3>
        </div>
        <ShieldCheck size={18} />
      </div>
      <div className="agent-check-list">
        {checks.map((check) => (
          <div key={check.title} className={`agent-check-row ${check.passed ? "passed" : "attention"}`}>
            <span className="agent-check-icon">
              {check.passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            </span>
            <div>
              <strong>{check.title}</strong>
              <span>{check.body}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function fallbackProductImage(color: string) {
  if (color === "pink") return "/product-pink.svg";
  if (color === "maroon") return "/product-maroon.svg";
  return "/product-blue.svg";
}
