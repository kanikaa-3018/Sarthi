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
  const [safetyCheckingProduct, setSafetyCheckingProduct] = useState<Product | null>(null);
  const [safetyCheckingStep, setSafetyCheckingStep] = useState(0);
  
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

    let animationInterval: number | null = null;
    let animationPromise: Promise<void> = Promise.resolve();

    if (options.openCompare) {
      setSafetyCheckingProduct(product);
      setSafetyCheckingStep(0);
      animationPromise = new Promise<void>((resolve) => {
        let currentStep = 0;
        animationInterval = window.setInterval(() => {
          currentStep++;
          if (currentStep <= 5) {
            setSafetyCheckingStep(currentStep);
          } else {
            if (animationInterval !== null) {
              window.clearInterval(animationInterval);
            }
            resolve();
          }
        }, 400);
      });
    }

    const [allApisResult] = await Promise.all([
      Promise.allSettled([
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
      ]),
      animationPromise
    ]);

    if (animationInterval !== null) {
      window.clearInterval(animationInterval);
    }
    setSafetyCheckingProduct(null);

    const [decisionOutcome, graphOutcome, radarOutcome] = allApisResult;

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

      {/* Sarthi Safety Check Premium Overlay */}
      {safetyCheckingProduct && (
        <div className="safety-check-loading-overlay">
          <div className="safety-check-loading-card">
            <div className="safety-check-loading-icon-wrapper">
              <ShieldCheck size={32} className="safety-check-shield-anim" />
              <div className="safety-check-loading-spinner" />
            </div>
            
            <span className="eyebrow">{getSafetyCheckTranslation("sarthiSafetyCheck", language)}</span>
            <h2>{getSafetyCheckTranslation("verifyingProductSafety", language)}</h2>
            
            <div className="safety-check-steps-progress">
              <div className="progress-bar-track">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${(safetyCheckingStep / 5) * 100}%` }} 
                />
              </div>
              
              <div className="safety-check-step-message" key={safetyCheckingStep}>
                {getSafetyCheckingStepMessage(safetyCheckingStep, language)}
              </div>
            </div>
            
            <div className="safety-check-loading-footer">
              <span>{getSafetyCheckTranslation("checkingSellers", language).replace("{count}", String(clusterListingCount(products, safetyCheckingProduct.cluster_id)))}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function getSafetyCheckingStepMessage(step: number, language: LanguageCode) {
  const steps: Record<LanguageCode, string[]> = {
    english: [
      "Auditing listings across similar sellers...",
      "Verifying seller KYC and credentials...",
      "Analyzing past return and mismatch rates...",
      "Matching measurements to your fit profile...",
      "Calibrating Sarthi Trust Passport...",
      "Grounded check complete!"
    ],
    hindi: [
      "Similar sellers ke listings audit ho rahe hain...",
      "Seller KYC aur documents verify ho rahe hain...",
      "Returns aur mismatch rate check kiya ja raha hai...",
      "Aapke fit profile se measurements match ho rahe hain...",
      "Sarthi Trust Passport taiyar kiya ja raha hai...",
      "Grounded check poora ho gaya hai!"
    ],
    hinglish: [
      "Similar sellers ke listings audit ho rahe hain...",
      "Seller KYC aur documents verify ho rahe hain...",
      "Returns aur mismatch rate check kiya ja raha hai...",
      "Aapke fit profile se measurements match ho rahe hain...",
      "Sarthi Trust Passport taiyar kiya ja raha hai...",
      "Grounded check poora ho gaya hai!"
    ]
  };
  return steps[language]?.[step] ?? steps.english[step] ?? "";
}

function getSafetyCheckTranslation(key: string, language: LanguageCode) {
  const translations: Record<string, Record<LanguageCode, string>> = {
    sarthiSafetyCheck: {
      english: "Sarthi Safety Check",
      hindi: "सारथी सेफ्टी चेक",
      hinglish: "Sarthi Safety Check"
    },
    verifyingProductSafety: {
      english: "Verifying purchase safety...",
      hindi: "खरीद की सुरक्षा जांची जा रही है...",
      hinglish: "Purchase safety verify ho rahi hai..."
    },
    checkingSellers: {
      english: "Checking {count} similar sellers",
      hindi: "{count} समान सेलर्स की जांच की जा रही है",
      hinglish: "{count} similar sellers check ho rahe hain"
    }
  };
  return translations[key]?.[language] ?? translations[key]?.english ?? "";
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

function shopRouteMode(pathname: string): BuyerShopStep {
  if (pathname.includes("/shop/wishlist")) return "wishlist";
  if (pathname.includes("/shop/orders")) return "orders";
  if (pathname.includes("/shop/proofs")) return "proofs";
  if (pathname.includes("/shop/product/")) return "detail";
  if (pathname.includes("/shop/saved/")) return "saved";
  return "feed";
}

function WishlistWorkspace({
  buyerId,
  products,
  language,
  onBack,
  onViewProduct,
  onCheckTrust,
  onOpenProof
}: {
  buyerId: string;
  products: Product[];
  language: LanguageCode;
  onBack: () => void;
  onViewProduct: (product: Product) => void;
  onCheckTrust: (product: Product) => void;
  onOpenProof: (product: Product) => void;
}) {
  const [items, setItems] = useState<BuyerWishlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getBuyerWishlist(buyerId)
      .then((payload) => {
        if (active) setItems(payload.items);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [buyerId]);

  return (
    <section className="buyer-workspace-shell">
      <div className="buyer-workspace-header">
        <button type="button" onClick={onBack}>
          {t(language, "shop")}
        </button>
        <div>
          <span className="eyebrow">{t(language, "wishlist")}</span>
          <h2>{items.length ? `${items.length} ${t(language, "saved")}` : t(language, "wishlist")}</h2>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {loading ? (
        <div className="wishlist-card-grid loading-skeleton" aria-hidden="true">
          <div className="skeleton-card" style={{ height: "160px" }} />
          <div className="skeleton-card" style={{ height: "160px" }} />
          <div className="skeleton-card" style={{ height: "160px" }} />
        </div>
      ) : items.length === 0 ? (
        <div className="workspace-empty-state">
          <Heart size={28} />
          <strong>{t(language, "noWishlistYet")}</strong>
          <button type="button" onClick={onBack}>{t(language, "shopNow")}</button>
        </div>
      ) : (
        <div className="wishlist-card-grid">
          {items.map((item) => {
            const event = item.radar;
            const savedProduct = item.product
              ?? event?.candidates.find((candidate) => candidate.is_saved_product)?.product
              ?? products.find((product) => product.product_id === event?.selected_product_id)
              ?? event?.candidates[0]?.product;
            const recommended = event?.candidates.find((candidate) => candidate.is_recommended) ?? event?.candidates[0];
            if (!savedProduct) return null;
            const actionProduct = recommended?.product ?? savedProduct;
            const needsTrustCheck = !event || event.status === "needs_one_check";
            return (
              <article key={item.intent.intent_id} className="wishlist-product-card">
                <div className="wishlist-product-top">
                  <img
                    src={productImageSource(savedProduct)}
                    alt={savedProduct.title}
                    onError={(e) => { e.currentTarget.src = fallbackProductImage(savedProduct.color_family); }}
                  />
                  <div>
                    <span>{savedProduct.seller_name}</span>
                    <strong>{savedProduct.title.split("-")[0].trim()}</strong>
                    <small>Rs {savedProduct.base_price}</small>
                  </div>
                  <div className="wishlist-score-pill">
                    <strong>{event ? Math.floor(event.recommended_score * 100) : "--"}</strong>
                    <span>/100</span>
                  </div>
                </div>

                <div className={`wishlist-status-line ${event?.status ?? "needs_one_check"}`}>
                  <ShieldCheck size={15} />
                  <strong>{event?.headline ?? t(language, "trustCheckReady")}</strong>
                </div>

                {recommended && (
                  <div className="wishlist-recommendation-mini">
                    <img
                      src={productImageSource(recommended.product)}
                      alt={recommended.product.title}
                      onError={(e) => { e.currentTarget.src = fallbackProductImage(recommended.product.color_family); }}
                    />
                    <div>
                      <span>{t(language, "bestMatchForYou")}</span>
                      <strong>{recommended.product.seller_name}</strong>
                    </div>
                  </div>
                )}

                <div className="wishlist-actions">
                  <button type="button" className="primary" onClick={() => onViewProduct(actionProduct)}>
                    <Eye size={14} />
                    {t(language, "viewItem")}
                  </button>
                  <button
                    type="button"
                    onClick={() => needsTrustCheck ? onCheckTrust(savedProduct) : onOpenProof(savedProduct)}
                  >
                    {needsTrustCheck ? <ShieldCheck size={14} /> : <FileCheck2 size={14} />}
                    {needsTrustCheck ? t(language, "checkTrust") : t(language, "proof")}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function OrdersWorkspace({
  buyerId,
  language,
  onBack,
  onViewProduct
}: {
  buyerId: string;
  language: LanguageCode;
  onBack: () => void;
  onViewProduct: (product: Product) => void;
}) {
  const [orders, setOrders] = useState<BuyerOrderItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedbackOrderId, setFeedbackOrderId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const copy = ordersLearningCopy(language);
  const placedCount = orders.filter(isPlacedOrder).length;
  const learntCount = orders.filter(isLearntOrder).length;

  useEffect(() => {
    void loadOrders();
  }, [buyerId]);

  async function loadOrders() {
    setLoading(true);
    setError(null);
    try {
      const payload = await getBuyerOrders(buyerId);
      setOrders(payload.orders);
      setPendingCount(payload.pending_feedback);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load orders");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="buyer-workspace-shell">
      <div className="buyer-workspace-header">
        <button type="button" onClick={onBack}>
          {t(language, "shop")}
        </button>
        <div>
          <span className="eyebrow">{t(language, "myOrders")}</span>
          <h2>{pendingCount ? `${pendingCount} ${t(language, "feedbackPending")}` : t(language, "orders")}</h2>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {loading ? (
        <div className="orders-list-skeleton loading-skeleton" aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div className="skeleton-card" style={{ height: "120px" }} />
          <div className="skeleton-card" style={{ height: "120px" }} />
          <div className="skeleton-card" style={{ height: "120px" }} />
        </div>
      ) : orders.length === 0 ? (
        <div className="workspace-empty-state">
          <PackageCheck size={28} />
          <strong>{t(language, "noOrdersYet")}</strong>
          <button type="button" onClick={onBack}>{t(language, "shopNow")}</button>
        </div>
      ) : (
        <>
          <div className="orders-learning-strip" aria-label={copy.learningStatus}>
            <span>
              <PackageCheck size={15} />
              <b>{placedCount}</b>
              {copy.placed}
            </span>
            <span className={pendingCount > 0 ? "pending" : ""}>
              <AlertTriangle size={15} />
              <b>{pendingCount}</b>
              {copy.feedback}
            </span>
            <span className="learnt">
              <ShieldCheck size={15} />
              <b>{learntCount}</b>
              {copy.learnt}
            </span>
          </div>

          <div className="orders-card-list">
            {orders.map((order) => (
              <article key={order.order_id} className={`order-product-card ${order.can_submit_outcome ? "pending" : ""}`}>
                <div className="order-product-main">
                  <img
                    src={productImageSource(order.product)}
                    alt={order.product.title}
                    onError={(e) => { e.currentTarget.src = fallbackProductImage(order.product.color_family); }}
                  />
                  <div>
                    <span>{new Date(order.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                    <strong>{order.product.title.split("-")[0].trim()}</strong>
                    <small>{order.product.seller_name} | Size {order.variant.size} | Rs {order.variant.current_price}</small>
                  </div>
                  <div className={`order-status-pill ${orderStatusTone(order)}`}>
                    {order.can_submit_outcome ? <PackageCheck size={14} /> : order.status === "returned" ? <RotateCcw size={14} /> : <ShieldCheck size={14} />}
                    <span>{orderStatusLabel(order, language)}</span>
                  </div>
                </div>

                {order.return_reason && (
                  <div className="order-return-reason">
                    <AlertTriangle size={14} />
                    <span>{labelize(order.return_reason)}</span>
                  </div>
                )}

                {order.payment_mode && (
                  <div className={`order-payment-reward ${order.payment_mode}`}>
                    {order.payment_mode === "prepaid" ? <Gift size={14} /> : <ShieldCheck size={14} />}
                    <span>{orderPaymentRewardLine(order, language)}</span>
                  </div>
                )}

                {isPlacedOrder(order) && (
                  <div className="order-next-step-line">
                    <PackageCheck size={14} />
                    <span>{copy.feedbackAfterDelivery}</span>
                  </div>
                )}

                {feedbackOrderId === order.order_id ? (
                  <div className="order-feedback-panel">
                    <OutcomeScreen
                      buyerId={buyerId}
                      variantId={order.variant_id}
                      contractId={order.contract_id}
                      language={language}
                      buyingForSomeoneElse={Boolean(order.buying_for_someone_else)}
                      wearerLabel={order.wearer_label ?? undefined}
                      onClose={() => {
                        setFeedbackOrderId(null);
                        void loadOrders();
                      }}
                    />
                  </div>
                ) : (
                  <div className="order-actions">
                    <button type="button" onClick={() => onViewProduct(order.product)}>
                      <Eye size={14} />
                      {t(language, "viewItem")}
                    </button>
                    {order.can_submit_outcome && (
                      <button type="button" className="primary" onClick={() => setFeedbackOrderId(order.order_id)}>
                        <PackageCheck size={14} />
                        {t(language, "giveFeedback")}
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function isPlacedOrder(order: BuyerOrderItem) {
  return order.status === "placed" || order.status === "placed_pending_feedback";
}

function isLearntOrder(order: BuyerOrderItem) {
  return order.status === "delivered_kept" || order.status === "returned" || order.status === "exchanged" || order.status === "rto";
}

function ordersLearningCopy(language: LanguageCode) {
  if (language === "hindi" || language === "hinglish") {
    return {
      learningStatus: "Order learning status",
      placed: "placed",
      feedback: "feedback due",
      learnt: "learnt",
      feedbackAfterDelivery: "Delivery ke baad feedback open hoga. Sarthi return aur fit learning tab update karega."
    };
  }
  return {
    learningStatus: "Order learning status",
    placed: "placed",
    feedback: "feedback due",
    learnt: "learnt",
    feedbackAfterDelivery: "Feedback opens after delivery. Sarthi updates return and fit learning then."
  };
}

function orderPaymentRewardLine(order: BuyerOrderItem, language: LanguageCode) {
  const points = order.payment_reward_points ?? 0;
  const value = order.payment_reward_value_rupees ?? 0;
  const savings = order.payment_offer_savings_rupees ?? 0;
  if (order.payment_mode === "prepaid" && points > 0) {
    if (language === "hindi") {
      return `${points} सार्थी पॉइंट्स खुले - Rs ${value} अगले ऑर्डर में, कुल फायदा Rs ${savings}`;
    }
    if (language === "hinglish") {
      return `${points} Sarthi points unlocked - Rs ${value} next order value, total benefit Rs ${savings}`;
    }
    return `${points} Sarthi points unlocked - Rs ${value} next order value, Rs ${savings} total benefit`;
  }
  if (order.payment_mode === "prepaid") {
    return language === "hindi"
      ? "Prepaid चुना गया - डिलीवरी के बाद रिवार्ड अपडेट होगा।"
      : language === "hinglish"
        ? "Prepaid selected - reward delivery ke baad update hoga."
        : "Prepaid selected - reward updates after delivery.";
  }
  return language === "hindi"
    ? "COD चुना गया - सार्थी ने भरोसा पहले रखा।"
    : language === "hinglish"
      ? "COD selected - Sarthi ne trust ko pehle rakha."
      : "COD selected - Sarthi kept trust first.";
}

function ProofsWorkspace({
  buyerId,
  language,
  onBack,
  onViewProduct,
  onOpenProductProof
}: {
  buyerId: string;
  language: LanguageCode;
  onBack: () => void;
  onViewProduct: (product: Product) => void;
  onOpenProductProof: (product: Product) => void;
}) {
  const [items, setItems] = useState<BuyerProofLedgerItem[]>([]);
  const [summary, setSummary] = useState({
    waiting_seller: 0,
    admin_review: 0,
    approved: 0,
    needs_more_proof: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const totalOpen = summary.waiting_seller + summary.admin_review + summary.needs_more_proof;
  const totalLift = items.reduce((sum, item) => sum + item.trust_impact.lift_points, 0);
  const copy = proofLedgerCopy(language);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getBuyerProofs(buyerId)
      .then((payload) => {
        if (!active) return;
        setItems(payload.items);
        setSummary(payload.summary);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [buyerId]);

  return (
    <section className="buyer-workspace-shell proof-ledger-shell">
      <div className="buyer-workspace-header">
        <button type="button" onClick={onBack}>
          {t(language, "shop")}
        </button>
        <div>
          <span className="eyebrow">{copy.proofTracker}</span>
          <h2>{items.length ? copy.proofsYouAskedFor : copy.myProofChecks}</h2>
          <p>{copy.trackerSummary}</p>
        </div>
      </div>

      <div className="proof-tracker-hero" aria-label="Proof check summary">
        <div className={totalOpen > 0 ? "needs-action" : "all-clear"}>
          <span>{copy.openChecks}</span>
          <strong>{totalOpen}</strong>
          <small>{copy.sellerOrAdminPending}</small>
        </div>
        <div className="approved">
          <span>{copy.approvedProof}</span>
          <strong>{summary.approved}</strong>
          <small>{copy.canHelpNow}</small>
        </div>
        <div className="lift">
          <span>{copy.possibleTrustLift}</span>
          <strong>+{totalLift}</strong>
          <small>{copy.estimatedPoints}</small>
        </div>
      </div>

      {error && <div className="notice error">{error}</div>}
      {loading ? (
        <div className="proof-ledger-list loading-skeleton" aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className="skeleton-card" style={{ height: "100px" }} />
          <div className="skeleton-card" style={{ height: "100px" }} />
          <div className="skeleton-card" style={{ height: "100px" }} />
        </div>
      ) : items.length === 0 ? (
        <div className="workspace-empty-state">
          <ClipboardCheck size={28} />
          <strong>{copy.noProofChecks}</strong>
          <p>{copy.askQuestionOrSave}</p>
          <button type="button" onClick={onBack}>{t(language, "shopNow")}</button>
        </div>
      ) : (
        <div className="proof-ledger-list proof-tracker-list">
          {items.map((item) => (
            <article key={item.request.request_id} className={`proof-ledger-card proof-tracker-card ${item.status}`}>
              <div className="proof-card-topline">
                <div className="proof-ledger-product">
                  <img
                    src={productImageSource(item.product)}
                    alt={item.product.title}
                    onError={(e) => { e.currentTarget.src = fallbackProductImage(item.product.color_family); }}
                  />
                  <div>
                    <span>{item.product.seller_name}</span>
                    <strong>{item.product.title.split("-")[0].trim()}</strong>
                    <small>
                      {proofAttributeLabel(item.request.attribute, language)} {copy.proof} - {item.request.request_count} {copy.buyerAsks}
                    </small>
                  </div>
                </div>
                <span className={`proof-decision-pill ${item.status}`}>
                  {proofLedgerStatusLabel(item.status, language)}
                </span>
              </div>

              <div className="proof-safe-action">
                <div>
                  <span>{copy.nextSafeStep}</span>
                  <strong>{proofNextSafeAction(item.status, language)}</strong>
                  <p>{proofLedgerSummary(item.status, item.trust_impact.lift_points, language)}</p>
                </div>
                <div className={`proof-trust-score ${item.trust_impact.lift_points > 0 ? "lift" : "waiting"}`}>
                  <span>{copy.trustScore}</span>
                  <strong>{item.trust_impact.before_score} -&gt; {item.trust_impact.expected_after_score}</strong>
                  <em>+{item.trust_impact.lift_points} pts</em>
                </div>
              </div>

              <details className="proof-ledger-more">
                <summary>{copy.details}: {proofQualityVerdict(item.proof_quality.score, item.status, language)}</summary>
                <div className="proof-quality-card">
                  <div className="proof-quality-head">
                    <span>{copy.proofQuality}</span>
                    <strong>{item.proof_quality.score}/100</strong>
                  </div>
                  <div className="proof-quality-checks">
                    {item.proof_quality.checks.slice(0, 3).map((check) => (
                      <span key={check.key} className={check.passed ? "pass" : "wait"}>
                        {check.passed ? "OK" : "!"} {proofQualityCheckLabel(check.key, language)}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="proof-ledger-timeline">
                  {item.timeline.map((step, index) => (
                    <div key={step.label} className={step.done ? "done" : ""}>
                      <span />
                      <strong>{proofTimelineLabel(index, step.label, language)}</strong>
                      <small>{step.at ? new Date(step.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : copy.pending}</small>
                    </div>
                  ))}
                </div>

                {item.proof_asset && (
                  <div className="proof-ledger-asset">
                    <strong>{item.proof_asset.title}</strong>
                  <p>{item.proof_asset.description}</p>
                </div>
              )}
              </details>

              <div className="proof-ledger-actions">
                <button type="button" onClick={() => onViewProduct(item.product)}>
                  {t(language, "viewItem")}
                </button>
                <button type="button" className="primary" onClick={() => onOpenProductProof(item.product)}>
                  {copy.seeProof}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

type ProofLedgerCopyKey =
  | "proofTracker"
  | "proofsYouAskedFor"
  | "myProofChecks"
  | "trackerSummary"
  | "openChecks"
  | "sellerOrAdminPending"
  | "approvedProof"
  | "canHelpNow"
  | "possibleTrustLift"
  | "estimatedPoints"
  | "checkingProofStatus"
  | "noProofChecks"
  | "askQuestionOrSave"
  | "proof"
  | "buyerAsks"
  | "trustImpact"
  | "trustScore"
  | "proofQuality"
  | "pending"
  | "nextSafeStep"
  | "details"
  | "seeProof"
  | "proofApproved"
  | "adminChecking"
  | "needsClearerProof"
  | "waitingSeller"
  | "safeToUseProof"
  | "waitForReviewAction"
  | "askClearerProofAction"
  | "waitForSellerAction"
  | "proofCanHelp"
  | "sellerResponded"
  | "currentProofWeak"
  | "sellerNotAnswered"
  | "trustCanImprove"
  | "trustWaits"
  | "strongProof"
  | "usefulButPending"
  | "weakProof"
  | "noProofYet"
  | "buyerAsked"
  | "sellerSubmitted"
  | "adminApproved";

const PROOF_LEDGER_COPY: Record<LanguageCode, Record<ProofLedgerCopyKey, string>> = {
  english: {
    proofTracker: "Proof tracker",
    proofsYouAskedFor: "Proofs you asked for",
    myProofChecks: "My proof checks",
    trackerSummary: "Track seller proof, admin review, and how much trust can improve.",
    openChecks: "Open checks",
    sellerOrAdminPending: "Seller or admin action pending",
    approvedProof: "Approved proof",
    canHelpNow: "Can help your decision now",
    possibleTrustLift: "Possible trust lift",
    estimatedPoints: "Estimated points from proof checks",
    checkingProofStatus: "Checking proof status...",
    noProofChecks: "No proof checks yet",
    askQuestionOrSave: "Ask a product question or save an item. Sarthi will track seller proof here.",
    proof: "proof",
    buyerAsks: "buyer asks",
    trustImpact: "Trust impact",
    trustScore: "Trust score",
    proofQuality: "Proof quality",
    pending: "Pending",
    nextSafeStep: "Next safe step",
    details: "Details",
    seeProof: "See proof",
    proofApproved: "Proof approved",
    adminChecking: "Admin checking",
    needsClearerProof: "Need clearer proof",
    waitingSeller: "Waiting for seller",
    safeToUseProof: "Use this proof before checkout.",
    waitForReviewAction: "Wait for admin review before trusting it.",
    askClearerProofAction: "Ask seller for clearer proof.",
    waitForSellerAction: "No proof yet. Prefer COD or another item.",
    proofCanHelp: "This proof can help you decide now.",
    sellerResponded: "Seller replied. Reviewer is checking it before trust improves.",
    currentProofWeak: "Current proof was not clear enough. Seller must improve it.",
    sellerNotAnswered: "Seller has not answered this proof request yet.",
    trustCanImprove: "{attribute} proof can improve trust by {lift} points.",
    trustWaits: "Trust lift waits until useful proof is approved.",
    strongProof: "Strong proof",
    usefulButPending: "Useful, but still pending",
    weakProof: "Weak proof",
    noProofYet: "No proof yet",
    buyerAsked: "Buyer asked",
    sellerSubmitted: "Seller submitted",
    adminApproved: "Admin approved"
  },
  hindi: {
    proofTracker: "Proof tracker",
    proofsYouAskedFor: "Aapke proof checks",
    myProofChecks: "Mere proof checks",
    trackerSummary: "Seller proof, admin review, aur trust improvement yahan track hota hai.",
    openChecks: "Open checks",
    sellerOrAdminPending: "Seller ya admin action pending",
    approvedProof: "Approved proof",
    canHelpNow: "Ab decision me help karega",
    possibleTrustLift: "Trust lift",
    estimatedPoints: "Proof checks se estimated points",
    checkingProofStatus: "Proof status check ho raha hai...",
    noProofChecks: "Abhi proof check nahi hai",
    askQuestionOrSave: "Product question poochho ya item save karo. Sarthi seller proof yahan track karega.",
    proof: "proof",
    buyerAsks: "buyer asks",
    trustImpact: "Trust impact",
    trustScore: "Trust score",
    proofQuality: "Proof quality",
    pending: "Pending",
    nextSafeStep: "Next safe step",
    details: "Details",
    seeProof: "See proof",
    proofApproved: "Proof approved",
    adminChecking: "Admin check kar raha hai",
    needsClearerProof: "Clearer proof chahiye",
    waitingSeller: "Seller ka wait",
    safeToUseProof: "Checkout se pehle ye proof dekh lo.",
    waitForReviewAction: "Admin review ke baad hi is proof par bharosa karo.",
    askClearerProofAction: "Seller se clearer proof maango.",
    waitForSellerAction: "Abhi proof nahi hai. COD ya doosra item safer hai.",
    proofCanHelp: "Ye proof ab decision me help kar sakta hai.",
    sellerResponded: "Seller ne reply kiya. Reviewer check kar raha hai.",
    currentProofWeak: "Current proof clear nahi tha. Seller ko improve karna hoga.",
    sellerNotAnswered: "Seller ne abhi proof request ka answer nahi diya.",
    trustCanImprove: "{attribute} proof se trust {lift} points improve ho sakta hai.",
    trustWaits: "Useful proof approve hone tak trust lift wait karega.",
    strongProof: "Strong proof",
    usefulButPending: "Useful, par pending",
    weakProof: "Weak proof",
    noProofYet: "Abhi proof nahi",
    buyerAsked: "Buyer asked",
    sellerSubmitted: "Seller submitted",
    adminApproved: "Admin approved"
  },
  hinglish: {
    proofTracker: "Proof tracker",
    proofsYouAskedFor: "Proofs you asked for",
    myProofChecks: "My proof checks",
    trackerSummary: "Seller proof, admin review, aur trust improvement yahan track hota hai.",
    openChecks: "Open checks",
    sellerOrAdminPending: "Seller ya admin action pending",
    approvedProof: "Approved proof",
    canHelpNow: "Decision me ab help karega",
    possibleTrustLift: "Possible trust lift",
    estimatedPoints: "Estimated points from proof checks",
    checkingProofStatus: "Proof status check ho raha hai...",
    noProofChecks: "Abhi proof checks nahi hain",
    askQuestionOrSave: "Product question poochho ya item save karo. Sarthi seller proof yahan track karega.",
    proof: "proof",
    buyerAsks: "buyer asks",
    trustImpact: "Trust impact",
    trustScore: "Trust score",
    proofQuality: "Proof quality",
    pending: "Pending",
    nextSafeStep: "Next safe step",
    details: "Details",
    seeProof: "See proof",
    proofApproved: "Proof approved",
    adminChecking: "Admin checking",
    needsClearerProof: "Clearer proof chahiye",
    waitingSeller: "Waiting for seller",
    safeToUseProof: "Checkout se pehle ye proof dekh lo.",
    waitForReviewAction: "Admin review ke baad hi is proof par bharosa karo.",
    askClearerProofAction: "Seller se clearer proof maango.",
    waitForSellerAction: "Abhi proof nahi hai. COD ya doosra item safer hai.",
    proofCanHelp: "Ye proof decision me help kar sakta hai.",
    sellerResponded: "Seller replied. Reviewer check kar raha hai.",
    currentProofWeak: "Current proof clear nahi tha. Seller must improve it.",
    sellerNotAnswered: "Seller ne abhi answer nahi diya.",
    trustCanImprove: "{attribute} proof trust ko {lift} points improve kar sakta hai.",
    trustWaits: "Useful proof approve hone tak trust lift wait karega.",
    strongProof: "Strong proof",
    usefulButPending: "Useful, but pending",
    weakProof: "Weak proof",
    noProofYet: "No proof yet",
    buyerAsked: "Buyer asked",
    sellerSubmitted: "Seller submitted",
    adminApproved: "Admin approved"
  }
};

const PROOF_ATTRIBUTE_LABELS: Record<LanguageCode, Record<string, string>> = {
  english: {
    transparency: "Transparency",
    fabric: "Fabric",
    color: "Color",
    size: "Size",
    packaging: "Packaging",
    offer: "Offer"
  },
  hindi: {
    transparency: "Transparency",
    fabric: "Fabric",
    color: "Color",
    size: "Size",
    packaging: "Packaging",
    offer: "Offer"
  },
  hinglish: {
    transparency: "Transparency",
    fabric: "Fabric",
    color: "Color",
    size: "Size",
    packaging: "Packaging",
    offer: "Offer"
  }
};

const PROOF_QUALITY_CHECKS: Record<LanguageCode, Record<string, string>> = {
  english: {
    asset_present: "Proof file added",
    matches_attribute: "Matches this doubt",
    clear_description: "Clear explanation",
    reviewed: "Reviewer checked"
  },
  hindi: {
    asset_present: "Proof file added",
    matches_attribute: "Same doubt ka proof",
    clear_description: "Clear explanation",
    reviewed: "Reviewer checked"
  },
  hinglish: {
    asset_present: "Proof file added",
    matches_attribute: "Same doubt ka proof",
    clear_description: "Clear explanation",
    reviewed: "Reviewer checked"
  }
};

function proofLedgerCopy(language: LanguageCode) {
  return PROOF_LEDGER_COPY[language] ?? PROOF_LEDGER_COPY.english;
}

function proofAttributeLabel(attribute: string, language: LanguageCode) {
  return PROOF_ATTRIBUTE_LABELS[language]?.[attribute] ?? labelize(attribute);
}

function proofQualityCheckLabel(key: string, language: LanguageCode) {
  return PROOF_QUALITY_CHECKS[language]?.[key] ?? labelize(key);
}

function proofLedgerStatusLabel(status: BuyerProofLedgerItem["status"], language: LanguageCode) {
  const copy = proofLedgerCopy(language);
  if (status === "approved") return copy.proofApproved;
  if (status === "admin_review") return copy.adminChecking;
  if (status === "needs_more_proof") return copy.needsClearerProof;
  return copy.waitingSeller;
}

function proofLedgerSummary(status: BuyerProofLedgerItem["status"], liftPoints: number, language: LanguageCode) {
  const copy = proofLedgerCopy(language);
  if (status === "approved") return `${copy.proofCanHelp} +${liftPoints}`;
  if (status === "admin_review") return copy.sellerResponded;
  if (status === "needs_more_proof") return copy.currentProofWeak;
  return copy.sellerNotAnswered;
}

function proofNextSafeAction(status: BuyerProofLedgerItem["status"], language: LanguageCode) {
  const copy = proofLedgerCopy(language);
  if (status === "approved") return copy.safeToUseProof;
  if (status === "admin_review") return copy.waitForReviewAction;
  if (status === "needs_more_proof") return copy.askClearerProofAction;
  return copy.waitForSellerAction;
}

function proofQualityVerdict(score: number, status: BuyerProofLedgerItem["status"], language: LanguageCode) {
  const copy = proofLedgerCopy(language);
  if (status === "approved" || score >= 82) return copy.strongProof;
  if (score >= 55) return copy.usefulButPending;
  if (score > 0) return copy.weakProof;
  return copy.noProofYet;
}

function proofTimelineLabel(index: number, fallback: string, language: LanguageCode) {
  const copy = proofLedgerCopy(language);
  if (index === 0) return copy.buyerAsked;
  if (index === 1) return copy.sellerSubmitted;
  if (index === 2) return copy.adminApproved;
  return fallback;
}

function orderStatusLabel(order: BuyerOrderItem, language: LanguageCode) {
  if (order.status === "placed" || order.status === "placed_pending_feedback") return t(language, "orderPlaced");
  if (order.can_submit_outcome || order.status === "delivered_needs_feedback") return t(language, "deliveredPending");
  if (order.status === "delivered_kept") return t(language, "keptIt");
  if (order.status === "returned") return t(language, "returnedIt");
  if (order.status === "rto") return "RTO";
  if (order.status === "exchanged") return t(language, "exchanged");
  return labelize(order.status);
}

function orderStatusTone(order: BuyerOrderItem) {
  if (order.status === "placed" || order.status === "placed_pending_feedback") return "watch";
  if (order.can_submit_outcome || order.status === "delivered_needs_feedback") return "pending";
  if (order.status === "returned") return "returned";
  if (order.status === "rto") return "watch";
  return "kept";
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
  wishlistedProduct,
  language,
  onQuickSearch,
  onProductOpen,
  onWishlistProduct,
  onSaveProduct,
  onOpenSavedItem,
  onOpenOrders
}: {
  products: Product[];
  allProducts: Product[];
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  wishlistedProduct: Product | null;
  language: LanguageCode;
  onQuickSearch: (value: string) => void;
  onProductOpen: (product: Product) => void;
  onWishlistProduct: (product: Product, options?: { openCompare?: boolean }) => void;
  onSaveProduct: (product: Product) => void;
  onOpenSavedItem: (product: Product) => void;
  onOpenOrders: () => void;
}) {
  const quickSearches = [
    { label: t(language, "quickSearchCottonKurti"), value: "cotton kurti" },
    { label: t(language, "quickSearchKurtaSet"), value: "kurta set" },
    { label: t(language, "quickSearchOfficePalazzo"), value: "office palazzo" },
    { label: t(language, "quickSearchWorkBag"), value: "work bag" }
  ];
  const visibleCategories = categories.slice(0, 7);
  const possibleComparableCount = new Set(
    products.filter((product) => product.is_sarthi_eligible).map((product) => product.cluster_id)
  ).size;
  const safeProductCount = products.filter((product) => product.buyer_trust?.can_recommend).length;
  const proofGapCount = products.filter((product) =>
    (product.buyer_trust?.open_proof_count ?? 0) > 0 || (product.buyer_trust?.missing_data?.length ?? 0) > 0
  ).length;
  const agentStartProduct = products.find((product) => product.is_sarthi_eligible && product.buyer_trust?.can_recommend)
    ?? products.find((product) => product.is_sarthi_eligible)
    ?? products[0]
    ?? null;
  const trimmedSearch = searchTerm.trim();
  const shelfTitle = trimmedSearch
    ? `${t(language, "resultsFor")} "${trimmedSearch}"`
    : selectedCategory !== "All"
      ? `${selectedCategory} ${t(language, "products")}`
      : t(language, "popularProducts");

  return (
    <div className="marketplace-home buyer-shop-shell">
      <section className="marketplace-toolbar" aria-label={t(language, "searchCatalog")}>
        <div className="marketplace-top-row">
          <div className="marketplace-location">
            <MapPin size={16} />
            <div>
              <span>{t(language, "deliverTo")}</span>
              <strong>{t(language, "buyerHome")}</strong>
            </div>
          </div>
          <label className="marketplace-search-bar">
            <Search size={18} />
            <input
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t(language, "searchProductOrSeller")}
            />
          </label>
          <button className="marketplace-cart-button" type="button" aria-label={t(language, "myOrders")} onClick={onOpenOrders}>
            <ShoppingCart size={17} />
            <span>{t(language, "orders")}</span>
          </button>
        </div>

        <div className="marketplace-category-row" aria-label={t(language, "productCategories")}>
          <span>{t(language, "allCategories")}</span>
          {visibleCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => onCategoryChange(cat)}
              className={cat === selectedCategory ? "active" : ""}
            >
              {cat === "All" ? t(language, "all") : cat}
            </button>
          ))}
        </div>
        <div className="marketplace-quick-row" aria-label={t(language, "quickSearches")}>
          {quickSearches.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onQuickSearch(item.value)}
              className={item.value === trimmedSearch.toLowerCase() ? "active" : ""}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <BuyerAgentPlan
        productCount={products.length}
        safeProductCount={safeProductCount}
        proofGapCount={proofGapCount}
        savedProduct={wishlistedProduct}
        startProduct={agentStartProduct}
        language={language}
        onStartSearch={() => onQuickSearch("cotton kurti")}
        onRunCheck={(product) => onWishlistProduct(product, { openCompare: true })}
        onOpenSavedItem={onOpenSavedItem}
      />

      <div className="marketplace-trust-strip" aria-live="polite">
        <span><ShieldCheck size={15} /> {t(language, "sarthiTrustOn")}</span>
        <strong>{wishlistedProduct ? t(language, "trustCheckReady") : feedTrustStripMessage(possibleComparableCount, language)}</strong>
      </div>

      <div className="shop-section-heading">
        <div>
          <h3>{shelfTitle}</h3>
        </div>
        <span>{products.length} {t(language, "options")}</span>
      </div>

      {products.length > 0 && (
        <div className="web-product-grid">
          {products.map((p) => {
            const isSaved = wishlistedProduct?.product_id === p.product_id;
            const trustBadge = productTrustBadge(p, isSaved, allProducts, language);
            return (
              <article
                key={p.product_id}
                className={`buyer-product-card ${isSaved ? "saved" : ""}`}
              >
                <div className="buyer-product-image">
                  <button
                    type="button"
                    className="buyer-product-open-area"
                    onClick={() => onProductOpen(p)}
                    aria-label={`${t(language, "view")} ${p.title}`}
                  >
                    <img
                      src={productImageSource(p)}
                      alt={p.title}
                      onError={(e) => { e.currentTarget.src = fallbackProductImage(p.color_family); }}
                    />
                  </button>
                  <button
                    type="button"
                    className={`product-trust-badge ${trustBadge.tone}`}
                    onClick={() => {
                      if (trustBadge.action === "check") {
                        void onWishlistProduct(p, { openCompare: true });
                      } else {
                        onProductOpen(p);
                      }
                    }}
                    title={t(language, "tapTrustBadge")}
                  >
                    {isSaved ? <BookmarkCheck size={13} /> : trustBadge.tone === "proof" ? <FileCheck2 size={13} /> : trustBadge.tone === "watch" ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
                    <span>{trustBadge.label}</span>
                  </button>
                  <button
                    type="button"
                    className={`buyer-save-icon ${isSaved ? "saved" : ""}`}
                    onClick={() => void onSaveProduct(p)}
                    aria-label={isSaved ? t(language, "saved") : t(language, "saveItem")}
                  >
                    <Heart size={16} />
                  </button>
                </div>
                  <div className="buyer-product-body">
                  <div className="buyer-card-kicker">
                    <span>{p.seller_name}</span>
                    <span>{p.rating.toFixed(1)} ({p.rating_count})</span>
                  </div>
                  <button
                    type="button"
                    className="buyer-product-title"
                    onClick={() => onProductOpen(p)}
                  >
                    {p.title.split("-")[0].trim()}
                  </button>
                  <div className="product-price-row">
                    <strong>Rs {p.base_price}</strong>
                    {p.commerce_badge && <span>{p.commerce_badge}</span>}
                  </div>
                  <div className="buyer-delivery-row">
                    <PackageCheck size={12} />
                    <span>{p.delivery_text}</span>
                  </div>
                  <div className={`product-trust-phrase ${trustBadge.tone}`}>
                    {trustBadge.tone === "safe" ? <ShieldCheck size={13} /> : <AlertTriangle size={13} />}
                    <span>{trustBadge.phrase}</span>
                  </div>
                  <div className="buyer-product-actions compact">
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => onProductOpen(p)}
                      aria-label={`${t(language, "viewItem")}: ${p.title}`}
                    >
                      <Eye size={14} />
                      <span>{t(language, "viewItem")}</span>
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => {
                        if (trustBadge.action === "check") {
                          void onWishlistProduct(p, { openCompare: true });
                        } else {
                          onProductOpen(p);
                        }
                      }}
                    >
                      <ShieldCheck size={14} />
                      <span>{trustBadge.actionLabel}</span>
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
          <strong>{t(language, "noMatchingProductsFound")}</strong>
          <p>{t(language, "broaderSearchTip")}</p>
        </div>
      )}
    </div>
  );
}

function BuyerAgentPlan({
  productCount,
  safeProductCount,
  proofGapCount,
  savedProduct,
  startProduct,
  language,
  onStartSearch,
  onRunCheck,
  onOpenSavedItem
}: {
  productCount: number;
  safeProductCount: number;
  proofGapCount: number;
  savedProduct: Product | null;
  startProduct: Product | null;
  language: LanguageCode;
  onStartSearch: () => void;
  onRunCheck: (product: Product) => void;
  onOpenSavedItem: (product: Product) => void;
}) {
  const copy = buyerAgentPlanCopy(language);
  const signals = [
    {
      icon: <ShieldCheck size={16} />,
      value: safeProductCount > 0 ? `${safeProductCount} ${copy.safePicks}` : `${productCount} ${copy.options}`
    },
    {
      icon: <FileCheck2 size={16} />,
      value: proofGapCount > 0 ? `${proofGapCount} ${copy.proofChecks}` : copy.proofReady
    }
  ];

  return (
    <section className="buyer-agent-plan" aria-label={copy.title}>
      <div className="buyer-agent-plan-copy">
        <span className="eyebrow">{copy.eyebrow}</span>
        <h2>{copy.title}</h2>
        <p>{copy.body}</p>
      </div>
      <div className="buyer-agent-plan-steps">
        {signals.map((step) => (
          <span key={step.value}>
            {step.icon}
            <b>{step.value}</b>
          </span>
        ))}
      </div>
      <button
        type="button"
        className={savedProduct ? "primary" : ""}
        onClick={() => savedProduct ? onOpenSavedItem(savedProduct) : startProduct ? onRunCheck(startProduct) : onStartSearch()}
      >
        {savedProduct ? copy.openSaved : startProduct ? copy.runCheck : copy.start}
        <ArrowRight size={15} />
      </button>
    </section>
  );
}

function buyerAgentPlanCopy(language: LanguageCode) {
  if (language === "hindi") {
    return {
      eyebrow: "Buyer safety",
      title: "Shop with proof",
      body: "Product pasand karo. Sarthi seller aur proof check karke simple next step dikhata hai.",
      safePicks: "safe picks",
      proofChecks: "proof checks",
      options: "options",
      proofReady: "proof ready",
      openSaved: "Open saved check",
      runCheck: "Safety check",
      start: "Find trusted items"
    };
  }
  if (language === "hinglish") {
    return {
      eyebrow: "Buyer safety",
      title: "Shop with proof",
      body: "Product pasand karo. Sarthi seller aur proof check karke simple next step dikhata hai.",
      safePicks: "safe picks",
      proofChecks: "proof checks",
      options: "options",
      proofReady: "proof ready",
      openSaved: "Open saved check",
      runCheck: "Safety check",
      start: "Find trusted items"
    };
  }
  return {
    eyebrow: "Buyer safety",
    title: "Shop with proof",
    body: "Pick a product. Sarthi checks seller and proof signals, then shows one clear next step.",
    safePicks: "safe picks",
    proofChecks: "proof checks",
    options: "options",
    proofReady: "proof ready",
    openSaved: "Open saved check",
    runCheck: "Safety check",
    start: "Find trusted items"
  };
}

function productTrustBadge(product: Product, isSaved: boolean, products: Product[], language: LanguageCode) {
  const listingCount = clusterListingCount(products, product.cluster_id);
  const safetyAction = safetyCheckActionLabel(language);
  if (isSaved) {
    return {
      label: t(language, "trustCheckReady"),
      phrase: `${listingCount} ${t(language, "similarSellers")}`,
      actionLabel: t(language, "open"),
      tone: "safe" as const,
      action: "check" as const
    };
  }
  if (!product.is_sarthi_eligible) {
    return {
      label: t(language, "browseOnly"),
      phrase: t(language, "catalogOnly"),
      actionLabel: t(language, "viewItem"),
      tone: "proof" as const,
      action: "view" as const
    };
  }
  const trust = product.buyer_trust;
  if (!trust) {
    return {
      label: t(language, "recommendationPaused"),
      phrase: `${listingCount} ${t(language, "similarSellers")}`,
      actionLabel: `${t(language, "checkTrust")} (${listingCount})`,
      tone: "watch" as const,
      action: "check" as const
    };
  }
  const ordersLine = trust.delivered_orders_90d > 0
    ? `${trust.delivered_orders_90d} ${t(language, "ordersChecked")}`
    : t(language, "notEnoughProof");
  if (trust.can_recommend) {
    return {
      label: trust.status === "specific_caution" ? t(language, "checkOnce") : t(language, "recommendationReady"),
      phrase: trust.status === "specific_caution" ? trust.headline : ordersLine,
      actionLabel: safetyAction,
      tone: trust.status === "specific_caution" ? "watch" as const : "safe" as const,
      action: "check" as const
    };
  }
  const blockedPhrase = trust.open_proof_count > 0
    ? t(language, "sellerProofAsked")
    : trust.status === "seller_verification_pending"
      ? t(language, "sellerPendingShort")
      : trust.status === "data_degraded"
        ? t(language, "freshDataMissing")
        : ordersLine;
  return {
    label: trust.status === "limited_evidence" ? t(language, "notEnoughProof") : t(language, "recommendationBlocked"),
    phrase: blockedPhrase,
    actionLabel: safetyAction,
    tone: "proof" as const,
    action: "check" as const
  };
}

function feedTrustStripMessage(count: number, language: LanguageCode) {
  void count;
  if (language === "hindi") return "Seller, returns aur proof buy se pehle check hote hain";
  if (language === "hinglish") return "Seller, returns aur proof buy se pehle check hote hain";
  return "Seller, returns and proof checked before you buy";
}

function safetyCheckActionLabel(language: LanguageCode) {
  if (language === "hindi") return "Safety";
  if (language === "hinglish") return "Safety";
  return "Safety";
}

function clusterListingCount(products: Product[], clusterId: string) {
  return products.filter((product) => product.cluster_id === clusterId).length;
}

function productForVariant(variantId: string, products: Product[]) {
  const productId = variantProductId(variantId);
  return products.find((product) => product.product_id === productId) ?? null;
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

function productImageSource(product: Pick<Product, "image_url" | "color_family">) {
  const source = product.image_url?.trim() ?? "";
  if (!source || source.includes("placehold.co") || source.includes("text=")) {
    return fallbackProductImage(product.color_family);
  }
  return source;
}
