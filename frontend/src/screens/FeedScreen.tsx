import { useEffect, useState, useMemo, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { 
  Search, 
  ShieldCheck, 
  AlertTriangle,
  X,
  BookmarkCheck,
  ClipboardCheck,
  MapPin,
  ShoppingCart,
  Eye,
  Heart,
  PackageCheck,
  RotateCcw,
  FileCheck2,
  Gift,
  ArrowRight
} from "lucide-react";
import {
  askKnowledgeGraph,
  createWishlistIntent,
  getBuyerOrders,
  getBuyerProofs,
  getBuyerWishlist,
  getClusterKnowledgeGraph,
  getFeed,
  getFitProfiles,
  runRegretFirewall
} from "../api/client";
import { t, type LanguageCode } from "../i18n";
import type {
  ClusterKnowledgeGraph,
  CompareResponse,
  ExpectationContract,
  FitProfile,
  KnowledgeGraphChatResponse,
  Product,
  RegretDecisionResponse,
  BuyerProofLedgerItem,
  BuyerOrderItem,
  BuyerWishlistItem,
  WishlistRadarEvent,
  Variant
} from "../types/api";
import { CompareSheet } from "./CompareSheet";
import { AuditDrawer } from "./AuditDrawer";
import { ProductDetailPanel } from "./ProductDetailPanel";
import { SarthiSavedWorkspacePanel } from "./SarthiSavedWorkspacePanel";
import { OutcomeScreen } from "./OutcomeScreen";

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

type BuyerShopStep = "feed" | "detail" | "saved" | "wishlist" | "orders" | "proofs";

export function FeedScreen({ buyerId, ready, language, experienceMode }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ productId?: string }>();
  const routeMode = shopRouteMode(location.pathname);
  const routeSearch = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const routeVariantId = routeSearch.get("variant");
  const hydratedSavedRouteRef = useRef<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [autoScan, setAutoScan] = useState<AutoScanState>({ status: "idle" });
  const [wishlistedProduct, setWishlistedProduct] = useState<Product | null>(null);
  const [activeFitProfile, setActiveFitProfile] = useState<FitProfile | null>(null);
  const [wishlistRadar, setWishlistRadar] = useState<WishlistRadarEvent | null>(null);
  const [radarLoading, setRadarLoading] = useState(false);
  const [radarError, setRadarError] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [auditTraceId, setAuditTraceId] = useState<string | null>(null);
  const [knowledgeGraph, setKnowledgeGraph] = useState<ClusterKnowledgeGraph | null>(null);
  const [graphAnswer, setGraphAnswer] = useState<KnowledgeGraphChatResponse | null>(null);
  const [graphQuery, setGraphQuery] = useState("");
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphAsking, setGraphAsking] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);
  const [regretDecision, setRegretDecision] = useState<RegretDecisionResponse | null>(null);
  const [decisionQuestion, setDecisionQuestion] = useState("");
  const [decisionLoading, setDecisionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [step, setStep] = useState<BuyerShopStep>(routeMode);
  
  // Overlay/Sheet visibility
  const [compareSheetOpen, setCompareSheetOpen] = useState(false);
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
    setAuditTraceId(null);
    setAutoScan({ status: "idle" });
    setWishlistedProduct(null);
    setActiveFitProfile(null);
    setWishlistRadar(null);
    setRadarLoading(false);
    setRadarError(null);
    hydratedSavedRouteRef.current = null;
    setSelectedClusterId("");
    setKnowledgeGraph(null);
    setGraphAnswer(null);
    setGraphQuery("");
    setGraphError(null);
    setRegretDecision(null);
    setDecisionQuestion("");
    setDecisionLoading(false);
    setError(null);
    setStep(shopRouteMode(window.location.pathname));
    
    Promise.allSettled([getFeed(buyerId), getFitProfiles(buyerId)])
      .then(([feedOutcome, profileOutcome]) => {
        if (feedOutcome.status === "fulfilled") {
          setProducts(feedOutcome.value.products);
        } else {
          setError(feedOutcome.reason instanceof Error ? feedOutcome.reason.message : "Unable to load catalog");
        }
        if (profileOutcome.status === "fulfilled") {
          setActiveFitProfile(profileOutcome.value.active_profile);
        }
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

  useEffect(() => {
    if (!ready) return;
    const routeProductId = params.productId;
    if (routeMode === "feed") {
      setStep("feed");
      return;
    }
    if (routeMode === "wishlist" || routeMode === "orders") {
      setStep(routeMode);
      return;
    }
    if (routeMode === "proofs") {
      setStep("proofs");
      return;
    }
    if (!routeProductId || products.length === 0) return;

    const routeProduct = products.find((product) => product.product_id === routeProductId);
    if (!routeProduct) {
      setError(`Product ${routeProductId} is not available in the current catalog.`);
      navigate("/shop", { replace: true });
      return;
    }

    setSelectedClusterId(routeProduct.cluster_id);
    if (routeMode === "detail") {
      setSelectedProductId(routeProduct.product_id);
      setSelectedVariantId(routeVariantId);
      setStep("detail");
      return;
    }

    setStep("saved");
    if (wishlistedProduct?.product_id === routeProduct.product_id) return;
    if (hydratedSavedRouteRef.current === routeProduct.product_id) return;
    hydratedSavedRouteRef.current = routeProduct.product_id;
    void handleWishlistProduct(routeProduct, { syncRoute: false });
  }, [navigate, params.productId, products, ready, routeMode, routeVariantId, wishlistedProduct?.product_id]);

  function handleViewProductDetail(prodId: string, varId?: string | null) {
    setSelectedProductId(prodId);
    setSelectedVariantId(varId ?? null);
    setStep("detail");
    setCompareSheetOpen(false);
    navigate(`/shop/product/${encodeURIComponent(prodId)}${varId ? `?variant=${encodeURIComponent(varId)}` : ""}`);
  }

  async function handleWishlistProduct(product: Product, options: { syncRoute?: boolean; openCompare?: boolean } = {}) {
    if (options.syncRoute === true) {
      navigate(`/shop/saved/${encodeURIComponent(product.product_id)}`);
    }
    setWishlistedProduct(product);
    setSelectedClusterId(product.cluster_id);
    setKnowledgeGraph(null);
    setGraphAnswer(null);
    setGraphQuery("");
    setGraphError(null);
    setWishlistRadar(null);
    setRadarError(null);
    setRadarLoading(true);
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

    const [decisionOutcome, graphOutcome, radarOutcome] = await Promise.allSettled([
      runRegretFirewall({
        buyer_id: buyerId,
        product_id: product.product_id,
        query: "Is this safe to buy before ordering?",
        create_missing_proof_request: false
      }),
      getClusterKnowledgeGraph(buyerId, product.cluster_id, product.product_id),
      createWishlistIntent({
        buyer_id: buyerId,
        product_id: product.product_id,
        profile_id: activeFitProfile?.profile_id,
        create_seller_signal: true
      })
    ]);

    if (graphOutcome.status === "fulfilled") {
      setKnowledgeGraph(graphOutcome.value);
      setGraphQuery(graphOutcome.value.chat_suggestions[0] ?? "");
    } else {
      setGraphError(graphOutcome.reason instanceof Error ? graphOutcome.reason.message : "Unable to build evidence map");
    }
    setGraphLoading(false);
    setDecisionLoading(false);
    setRadarLoading(false);

    if (radarOutcome.status === "fulfilled") {
      setWishlistRadar(radarOutcome.value.radar);
    } else {
      setRadarError(radarOutcome.reason instanceof Error ? radarOutcome.reason.message : "Unable to prepare wishlist radar");
    }

    if (decisionOutcome.status === "fulfilled") {
      const decision = decisionOutcome.value;
      const result = compareFromDecision(decision);
      setRegretDecision(decision);
      setComparison(result);
      if (options.openCompare) {
        setCompareSheetOpen(true);
      }
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

  async function handleSaveToWishlist(product: Product) {
    await handleWishlistProduct(product);
    navigate("/shop/wishlist");
  }

  async function handleOpenProofForProduct(product: Product) {
    await handleWishlistProduct(product);
    openSavedProofLayer(product);
  }

  async function handleAskDecision(question: string, product = wishlistedProduct) {
    const prompt = question.trim();
    if (!prompt) {
      setError("Ask a simple buying question first.");
      return;
    }
    if (!product) {
      setError("Open an item before asking Sarthi to check it.");
      return;
    }
    setDecisionLoading(true);
    setError(null);
    setWishlistedProduct(product);
    setSelectedClusterId(product.cluster_id);
    try {
      const decision = await runRegretFirewall({
        buyer_id: buyerId,
        product_id: product.product_id,
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
        product_id: wishlistedProduct?.product_id,
        query: prompt
      });
      setGraphAnswer(response);
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : "Unable to ask the evidence map");
    } finally {
      setGraphAsking(false);
    }
  }

  async function handleRetryKnowledgeGraph() {
    if (!wishlistedProduct) return;
    setGraphLoading(true);
    setGraphError(null);
    try {
      const graph = await getClusterKnowledgeGraph(buyerId, wishlistedProduct.cluster_id, wishlistedProduct.product_id);
      setKnowledgeGraph(graph);
      setGraphQuery((current) => current || graph.chat_suggestions[0] || "");
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : "Unable to build evidence map");
    } finally {
      setGraphLoading(false);
    }
  }

  function handleOpenCheckout(variantId: string, contract: ExpectationContract, item: { product: Product; variant: Variant }) {
    setSelectedVariantId(variantId);
    navigate(`/shop/checkout/${encodeURIComponent(item.product.product_id)}/${encodeURIComponent(variantId)}`, {
      state: { contract, item }
    });
  }

  function openSavedProofLayer(product = wishlistedProduct) {
    if (!product) return;
    setStep("saved");
    navigate(`/shop/saved/${encodeURIComponent(product.product_id)}?proof=1`);
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
          wishlistedProduct={wishlistedProduct}
          language={language}
          onQuickSearch={setSearchTerm}
          onProductOpen={(product) => handleViewProductDetail(product.product_id, null)}
          onWishlistProduct={handleWishlistProduct}
          onSaveProduct={handleSaveToWishlist}
          onOpenSavedItem={(product) => openSavedProofLayer(product)}
          onOpenOrders={() => navigate("/shop/orders")}
        />
      ) : step === "wishlist" ? (
        <WishlistWorkspace
          buyerId={buyerId}
          products={products}
          language={language}
          onBack={() => navigate("/shop")}
          onViewProduct={(product) => handleViewProductDetail(product.product_id, null)}
          onCheckTrust={(product) => handleWishlistProduct(product, { openCompare: true })}
          onOpenProof={handleOpenProofForProduct}
        />
      ) : step === "orders" ? (
        <OrdersWorkspace
          buyerId={buyerId}
          language={language}
          onBack={() => navigate("/shop")}
          onViewProduct={(product) => handleViewProductDetail(product.product_id, null)}
        />
      ) : step === "proofs" ? (
        <ProofsWorkspace
          buyerId={buyerId}
          language={language}
          onBack={() => navigate("/shop")}
          onViewProduct={(product) => handleViewProductDetail(product.product_id, null)}
          onOpenProductProof={(product) => handleOpenProofForProduct(product)}
        />
      ) : step === "saved" && wishlistedProduct ? (
        <SarthiSavedWorkspacePanel
          buyerId={buyerId}
          savedProduct={wishlistedProduct}
          products={products}
          autoScan={autoScan}
          knowledgeGraph={knowledgeGraph}
          graphLoading={graphLoading}
          graphError={graphError}
          regretDecision={regretDecision}
          decisionQuestion={decisionQuestion}
          decisionLoading={decisionLoading}
          graphAnswer={graphAnswer}
          graphQuery={graphQuery}
          graphAsking={graphAsking}
          wishlistRadar={wishlistRadar}
          radarLoading={radarLoading}
          radarError={radarError}
          activeFitProfile={activeFitProfile}
          language={language}
          onBack={() => navigate("/shop")}
          onOpenProduct={(product, variantId) => handleViewProductDetail(product.product_id, variantId ?? null)}
          onOpenResult={(res) => {
            setComparison(res);
            setCompareSheetOpen(true);
          }}
          onOpenProof={(traceId) => {
            setAuditTraceId(traceId);
            setAuditDrawerOpen(true);
          }}
          onDecisionQuestionChange={setDecisionQuestion}
          onAskDecision={handleAskDecision}
          onQueryChange={setGraphQuery}
          onAskGraph={handleAskKnowledgeGraph}
          onRetryGraph={handleRetryKnowledgeGraph}
        />
      ) : (
        selectedProductId && (
          <ProductDetailPanel
            buyerId={buyerId}
            productId={selectedProductId}
            initialVariantId={selectedVariantId}
            clusterId={activeClusterId}
            onBack={() => navigate("/shop")}
            onOpenAudit={(traceId) => {
              setAuditTraceId(traceId);
              setAuditDrawerOpen(true);
            }}
            onOpenCheckout={handleOpenCheckout}
            language={language}
            experienceMode={experienceMode}
            comparisonTraceId={comparison?.trace_id}
          />
        )
      )}

      {/* Screen 2: Modal Comparison Sheet */}
      {compareSheetOpen && comparison && (
        <div className="bottom-sheet-overlay" onClick={() => setCompareSheetOpen(false)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-success">{t(language, "evidencePickedMatch")}</span>
                <h3 className="sheet-title">{t(language, "listingsResolved")}</h3>
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

      {/* Diagnostic Audit Drawer */}
      {auditDrawerOpen && (
        <div className="bottom-sheet-overlay" onClick={() => setAuditDrawerOpen(false)}>
          <div className="bottom-sheet-content audit-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-primary">{t(language, "prePurchaseDiagnosticLogs")}</span>
                <h3 className="sheet-title">{t(language, "howScoreWasDecided")}</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setAuditDrawerOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <AuditDrawer
              traceId={auditTraceId}
              onClose={() => setAuditDrawerOpen(false)}
              language={language}
            />
          </div>
        </div>
      )}

      {/* Saved radar ready toast */}
      {wishlistedProduct && autoScan.status === "ready" && step !== "saved" && (
        <div
          className="sarthi-scan-toast"
        >
          <ShieldCheck size={16} />
          <div className="sarthi-toast-content">
            <span>{t(language, "savedRadarReady")}</span>
              <button
                type="button"
                onClick={() => openSavedProofLayer(wishlistedProduct)}
                className="sarthi-toast-action"
              >
              {t(language, "seeProof")}
              </button>
          </div>
        </div>
      )}

      {/* Floating trust check trigger */}
      {wishlistedProduct && step !== "saved" && (
        <button
          type="button"
          className="sarthi-floating-trigger"
          onClick={() => openSavedProofLayer(wishlistedProduct)}
        >
          <ShieldCheck size={18} className={autoScan.status === "scanning" ? "spin-icon" : ""} />
          <span>{t(language, "radar")}</span>
          {autoScan.status === "ready" && (
            <span className="floating-ready-count">1</span>
          )}
        </button>
      )}
    </div>
  );
}

function compareFromDecision(decision: RegretDecisionResponse): CompareResponse {
  return {
    trace_id: decision.trace_id,
    selected_product_id: decision.selected.product.product_id,
    ranking: decision.ranking,
    similarity: decision.context.similarity ?? null,
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

function shopRouteMode(pathname: string): "feed" | "detail" | "saved" {
  if (pathname.includes("/shop/product/")) return "detail";
  if (pathname.includes("/shop/saved/")) return "saved";
  return "feed";
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
  activeFitProfile,
  fitProfileCount,
  knowledgeGraph,
  graphLoading,
  graphError,
  regretDecision,
  decisionQuestion,
  decisionLoading,
  hasBuyerIntent,
  onQuickSearch,
  onProductOpen,
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
  activeFitProfile: FitProfile | null;
  fitProfileCount: number;
  knowledgeGraph: ClusterKnowledgeGraph | null;
  graphLoading: boolean;
  graphError: string | null;
  regretDecision: RegretDecisionResponse | null;
  decisionQuestion: string;
  decisionLoading: boolean;
  hasBuyerIntent: boolean;
  onQuickSearch: (value: string) => void;
  onProductOpen: (product: Product) => void;
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
    ? `${possibleComparableCount} product groups are ready for trust check.`
    : "";

  return (
    <div className="marketplace-home buyer-shop-shell">
      <section className="buyer-shop-hero" aria-labelledby="buyer-shop-title">
        <div className="buyer-shop-copy">
          <span className="eyebrow">Catalog</span>
          <h2 id="buyer-shop-title">Find. Check. Buy safely.</h2>
          <p>
            Seller, size, returns, price and proof checked before payment.
          </p>
        </div>
        <div className="shop-trust-row" aria-label="Sarthi trust checks">
          <span><ShieldCheck size={14} /> Seller proof</span>
          <span><Ruler size={14} /> {activeFitProfile ? `${activeFitProfile.label} fit` : "Size fit"}</span>
          <span><AlertTriangle size={14} /> Return risk</span>
        </div>
      </section>

      <section className="shop-search-card" aria-label="Search catalog">
        <div className="shop-search-input">
          <Search size={18} />
          <input
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search product or seller"
          />
        </div>

        <div className="quick-search-row" aria-label="Quick searches">
          <span>Popular</span>
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

      {(hasBuyerIntent || wishlistedProduct) && (
        <div className="sarthi-nudge-strip" aria-live="polite">
          <span className="sarthi-nudge-icon">
            <ShieldCheck size={17} />
          </span>
          <div>
            <strong>{wishlistedProduct ? "Trust check ready" : "Save to check trust"}</strong>
            <p>
              {wishlistedProduct
                ? `${wishlistedProduct.title.split("-")[0].trim()} is ready.`
                : sarthiNudgeCopy}
              {activeFitProfile ? ` Fit context: ${activeFitProfile.label}.` : ""}
            </p>
          </div>
          <span>{fitProfileCount ? `${fitProfileCount} profiles` : `${possibleComparableCount} groups`}</span>
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
              <article
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
                    <span className="product-badge mapped">Checkable</span>
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

                  <div className="buyer-product-actions">
                    <button
                      type="button"
                      onClick={() => onProductOpen(p)}
                      className="buyer-view-btn"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (p.is_sarthi_eligible) {
                          void onWishlistProduct(p);
                        }
                      }}
                      disabled={!p.is_sarthi_eligible}
                      className={`buyer-save-btn ${isSaved ? "saved" : ""}`}
                    >
                      {isSaved ? <BookmarkCheck size={13} /> : <Heart size={13} />}
                      <span>{isSaved ? "Saved" : p.is_sarthi_eligible ? "Check" : "Catalog"}</span>
                    </button>
                  </div>
                </div>
              </article>
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

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function trustScorePercent(candidate: CompareResponse["ranking"]["candidates"][number]) {
  return candidate.score_percent ?? Math.floor(candidate.score * 100);
}

function fallbackProductImage(color: string) {
  if (color === "pink") return "/product-pink.svg";
  if (color === "maroon") return "/product-maroon.svg";
  return "/product-blue.svg";
}
