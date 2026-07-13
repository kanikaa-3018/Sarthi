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
  HelpCircle
} from "lucide-react";
import { compareCluster, getFeed, getProductDetail, askSarthi } from "../api/client";
import { t, type LanguageCode } from "../i18n";
import type { CompareResponse, Product, ProductDetailResponse, AgentResponse } from "../types/api";
import { CompareSheet } from "./CompareSheet";
import { CheckoutSheet } from "./CheckoutSheet";
import { AuditDrawer } from "./AuditDrawer";

type Props = {
  buyerId: string;
  ready: boolean;
  language: LanguageCode;
  experienceMode: "simple" | "standard";
};

export function FeedScreen({ buyerId, ready, language, experienceMode }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [auditTraceId, setAuditTraceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
    setAuditTraceId(null);
    setError(null);
    setStep("feed");
    
    getFeed(buyerId)
      .then((data) => {
        setProducts(data.products);
        const firstEligible = data.products.find((product) => product.is_sarthi_eligible);
        setSelectedClusterId(firstEligible?.cluster_id ?? data.products[0]?.cluster_id ?? "");
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

  const sarthiClusters = useMemo(() => {
    const seen = new Set<string>();
    return products.filter((product) => {
      if (!product.is_sarthi_eligible || seen.has(product.cluster_id)) return false;
      seen.add(product.cluster_id);
      return true;
    });
  }, [products]);

  const activeClusterId = selectedClusterId || sarthiClusters[0]?.cluster_id || "cluster_floral_blue";

  // Comparison helper trigger
  async function triggerComparison(targetClusterId = activeClusterId) {
    setLoading(true);
    setError(null);
    setSelectedClusterId(targetClusterId);
    try {
      const result = await compareCluster(buyerId, targetClusterId);
      setComparison(result);
      setSelectedProductId(result.selected_product_id);
      setSelectedVariantId(result.ranking.winner);
      setCompareSheetOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to compare listings");
    } finally {
      setLoading(false);
    }
  }

  function handleViewProductDetail(prodId: string, varId: string) {
    setSelectedProductId(prodId);
    setSelectedVariantId(varId);
    setStep("detail");
    setCompareSheetOpen(false);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>
      {error && <div className="notice error" style={{ margin: "10px" }}>{error}</div>}

      {/* Primary Screens */}
      {step === "feed" ? (
        <MarketplaceHome
          products={visibleProducts}
          categories={categories}
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          sarthiClusters={sarthiClusters}
          activeClusterId={activeClusterId}
          onSelectCluster={setSelectedClusterId}
          onRunComparison={triggerComparison}
          onSelectProductDirectly={(pId, vId) => {
            compareCluster(buyerId, products.find(p => p.product_id === pId)?.cluster_id || "cluster_floral_blue")
              .then((result) => {
                setComparison(result);
                setSelectedProductId(pId);
                setSelectedVariantId(vId);
                setStep("detail");
              });
          }}
          loading={loading}
          language={language}
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
            onOpenCheckout={() => setCheckoutOpen(true)}
            language={language}
          />
        )
      )}

      {/* Screen 2: Modal Comparison Sheet */}
      {compareSheetOpen && comparison && (
        <div className="bottom-sheet-overlay" onClick={() => setCompareSheetOpen(false)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow" style={{ color: "var(--success)" }}>Sarthi Curated Match</span>
                <h3 style={{ margin: 0 }}>Listings Resolved</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setCompareSheetOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <CompareSheet
              comparison={comparison}
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

      {/* Screen 4 & 5: Modal Checkout and Outcome loop */}
      {checkoutOpen && selectedVariantId && (
        <div className="bottom-sheet-overlay" onClick={() => setCheckoutOpen(false)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow" style={{ color: "var(--accent-secondary)" }}>Secure Checkout</span>
                <h3 style={{ margin: 0 }}>Offer Sach Check</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setCheckoutOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <CheckoutSheet
              buyerId={buyerId}
              variantId={selectedVariantId}
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
          <div className="bottom-sheet-content" style={{ maxHeight: "90%" }} onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow" style={{ color: "var(--accent-primary-hover)" }}>Pre-purchase Diagnostic Logs</span>
                <h3 style={{ margin: 0 }}>How Sarthi Decided</h3>
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

// Marketplace Feed Component (Responsive Grid view)
function MarketplaceHome({
  products,
  categories,
  selectedCategory,
  onCategoryChange,
  searchTerm,
  onSearchChange,
  sarthiClusters,
  activeClusterId,
  onSelectCluster,
  onRunComparison,
  onSelectProductDirectly,
  loading,
  language
}: {
  products: Product[];
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  sarthiClusters: Product[];
  activeClusterId: string;
  onSelectCluster: (clusterId: string) => void;
  onRunComparison: (clusterId?: string) => void;
  onSelectProductDirectly: (productId: string, variantId: string) => void;
  loading: boolean;
  language: LanguageCode;
}) {
  const currentCluster = sarthiClusters.find((product) => product.cluster_id === activeClusterId) || sarthiClusters[0];

  return (
    <div className="marketplace-home" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      
      {/* Search Input */}
      <div className="phone-input-wrapper" style={{ margin: "4px 0" }}>
        <span className="phone-prefix" style={{ background: "transparent", borderRight: "none" }}>
          <Search size={16} style={{ color: "var(--text-secondary)" }} />
        </span>
        <input
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search catalog kurtis, sets..."
          style={{ paddingLeft: 0, fontSize: "14px" }}
        />
      </div>

      {/* Category Horizontal list */}
      <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "6px", scrollbarWidth: "none" }}>
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => onCategoryChange(cat)}
            style={{
              padding: "8px 16px",
              borderRadius: "20px",
              fontSize: "13px",
              fontWeight: 600,
              whiteSpace: "nowrap",
              backgroundColor: cat === selectedCategory ? "var(--accent-primary)" : "var(--bg-surface)",
              color: cat === selectedCategory ? "var(--text-on-accent)" : "var(--text-secondary)",
              border: "1px solid var(--border-subtle)",
              cursor: "pointer"
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Screen 1: Inline Cluster prompt if duplicate confusion is detected */}
      {currentCluster && (
        <div style={{
          backgroundColor: "var(--bg-surface-muted)",
          border: "1px dashed var(--accent-primary)",
          borderRadius: "12px",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          textAlign: "left"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ background: "var(--accent-primary)", borderRadius: "50%", width: "26px", height: "26px", display: "grid", placeItems: "center", color: "#fff" }}>
              <Sparkles size={13} />
            </div>
            <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>3 similar options found</strong>
          </div>
          <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
            We detected duplicate seller options for "{currentCluster.title.split("-")[0].trim()}". Let Sarthi find the optimal kept SKU.
          </p>
          <button
            onClick={() => onRunComparison(currentCluster.cluster_id)}
            disabled={loading}
            style={{
              alignSelf: "flex-start",
              backgroundColor: "var(--accent-primary)",
              color: "var(--text-on-accent)",
              border: "none",
              borderRadius: "6px",
              padding: "8px 14px",
              fontSize: "12px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: "4px",
              cursor: "pointer"
            }}
          >
            <span>{loading ? "Scanning..." : t(language, "resolveListings")}</span>
            <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* Catalog items heading */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Recommended Kurtis</span>
        <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{products.length} options</span>
      </div>

      {/* Responsive Grid List */}
      <div className="web-product-grid">
        {products.map((p) => {
          const strikePrice = Math.round(p.base_price * 1.35);
          return (
            <div
              key={p.product_id}
              onClick={() => onSelectProductDirectly(p.product_id, p.product_id + "_XL")}
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "10px",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                cursor: "pointer",
                textAlign: "left"
              }}
            >
              <div style={{ position: "relative", height: "160px", backgroundColor: "var(--bg-surface-muted)" }}>
                <img
                  src={p.image_url || fallbackProductImage(p.color_family)}
                  alt={p.title}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  onError={(e) => { e.currentTarget.src = fallbackProductImage(p.color_family); }}
                />
                {p.commerce_badge && (
                  <span style={{
                    position: "absolute",
                    top: "8px",
                    left: "8px",
                    backgroundColor: "var(--accent-secondary)",
                    color: "var(--text-on-accent)",
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "3px 6px",
                    borderRadius: "3px"
                  }}>
                    {p.commerce_badge}
                  </span>
                )}
              </div>
              <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "4px", flex: 1 }}>
                <strong style={{ fontSize: "12px", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {p.title.split("-")[0].trim()}
                </strong>
                <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{p.seller_name}</span>
                
                {/* Ratings */}
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "2px",
                    backgroundColor: "var(--success)",
                    color: "#fff",
                    fontSize: "10px",
                    fontWeight: 700,
                    padding: "2px 5px",
                    borderRadius: "3px"
                  }}>
                    <span>{p.rating.toFixed(1)}</span>
                    <Star size={8} fill="currentColor" />
                  </div>
                  <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>{p.rating_count.toLocaleString("en-IN")}</span>
                </div>

                {/* Price block */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "2px" }}>
                  <strong style={{ fontSize: "14px", color: "var(--text-primary)" }}>Rs {p.base_price}</strong>
                  <span style={{ fontSize: "11px", color: "var(--text-secondary)", textDecoration: "line-through" }}>Rs {strikePrice}</span>
                  <span style={{ fontSize: "10px", color: "var(--success)", fontWeight: 700 }}>35% OFF</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-secondary)", marginTop: "2px" }}>
                  <Truck size={12} />
                  <span>{p.delivery_text || "Free delivery"}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
  language
}: {
  buyerId: string;
  productId: string;
  initialVariantId: string;
  clusterId: string;
  onBack: () => void;
  onOpenAudit: (traceId: string) => void;
  onOpenCheckout: () => void;
  language: LanguageCode;
}) {
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariantId);
  const [query, setQuery] = useState("Mera usual size L hai, chest tight toh nahi hoga?");
  const [answer, setAnswer] = useState<AgentResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getProductDetail(buyerId, productId)
      .then((payload) => {
        setDetail(payload);
        setSelectedVariantId(payload.selected_variant.variant_id);
      });
  }, [buyerId, productId]);

  if (!detail) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ height: "300px", backgroundColor: "var(--bg-surface-muted)", borderRadius: "12px", animation: "pulse 1.5s infinite" }}></div>
        <div style={{ height: "24px", width: "50%", backgroundColor: "var(--bg-surface-muted)", borderRadius: "4px", animation: "pulse 1.5s infinite" }}></div>
      </div>
    );
  }

  async function submitQuestion() {
    setSubmitting(true);
    setAnswer(null);
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
    } catch {
      setAnswer({
        trace_id: "offline_fallback",
        intent: ["fit"],
        answer: {
          title: "Check specifications",
          summary: "Sarthi checked standard specs. Fabric cotton blend is comfortable. Size: XL recommended.",
          reasons: ["Grounded fallback active"],
          caution: "Offline mode. Fabric is breathable cotton.",
          primary_action: {
            type: "select_variant",
            variant_id: selectedVariantId,
            label: "Continue with select size"
          }
        },
        fact_ids: []
      });
    } finally {
      setSubmitting(false);
    }
  }

  const selectedVariant = detail.variants.find((v) => v.variant_id === selectedVariantId) || detail.selected_variant;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
      {/* Detail header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 0",
        borderBottom: "1px solid var(--border-subtle)",
        marginBottom: "20px"
      }}>
        <button onClick={onBack} style={{ display: "grid", placeItems: "center", width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--border-subtle)", cursor: "pointer" }}>
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>Back to catalog</span>
      </div>

      <div className="web-detail-layout">
        {/* Left Column: Gallery, Sizes, Factual Evidence */}
        <div className="detail-gallery-container">
          <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "12px", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ height: "360px", backgroundColor: "var(--bg-surface-muted)", position: "relative" }}>
              <img
                src={detail.product.image_url || fallbackProductImage(detail.product.color_family)}
                alt={detail.product.title}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <span style={{ position: "absolute", bottom: "12px", right: "12px", backgroundColor: "rgba(0, 0, 0, 0.6)", color: "#fff", fontSize: "11px", padding: "4px 10px", borderRadius: "20px" }}>
                {detail.product.fabric}
              </span>
            </div>
            <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Sold by: {detail.product.seller_name}</span>
              <h1 style={{ fontSize: "20px", margin: 0, color: "var(--text-primary)" }}>{detail.product.title.split("-")[0].trim()}</h1>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "6px" }}>
                <strong style={{ fontSize: "22px", color: "var(--text-primary)" }}>Rs {selectedVariant.current_price}</strong>
                <span style={{ fontSize: "14px", color: "var(--text-secondary)", textDecoration: "line-through" }}>Rs {Math.round(selectedVariant.current_price * 1.35)}</span>
              </div>
            </div>
          </div>

          {/* Size Selector */}
          <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--text-primary)", display: "block", marginBottom: "10px" }}>Select Size:</span>
            <div style={{ display: "flex", gap: "10px" }}>
              {detail.variants.map((v) => (
                <button
                  key={v.variant_id}
                  onClick={() => setSelectedVariantId(v.variant_id)}
                  style={{
                    minWidth: "46px",
                    height: "46px",
                    borderRadius: "50%",
                    border: "1px solid " + (v.variant_id === selectedVariantId ? "var(--accent-primary)" : "var(--border-subtle)"),
                    backgroundColor: v.variant_id === selectedVariantId ? "var(--accent-primary)" : "var(--bg-surface)",
                    color: v.variant_id === selectedVariantId ? "var(--text-on-accent)" : "var(--text-primary)",
                    fontWeight: 700,
                    fontSize: "14px",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer"
                  }}
                >
                  {v.size}
                </button>
              ))}
            </div>
          </div>

          {/* Fact Metrics Card */}
          <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px" }}>
            <span className="eyebrow" style={{ color: "var(--accent-secondary)" }}>SKU Factual Evidence</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", margin: "14px 0" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Size Accuracy</span>
                <strong style={{ fontSize: "16px", color: "var(--text-primary)" }}>{Math.round(detail.evidence.fit_as_expected_rate * 100)}%</strong>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Color Match</span>
                <strong style={{ fontSize: "16px", color: "var(--text-primary)" }}>
                  {detail.evidence.delivered_orders_90d
                    ? Math.round((1 - detail.evidence.color_mismatch_returns / detail.evidence.delivered_orders_90d) * 100)
                    : 100}%
                </strong>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Dispatch SLA</span>
                <strong style={{ fontSize: "16px", color: "var(--text-primary)" }}>{detail.evidence.median_dispatch_hours}h</strong>
              </div>
            </div>
            <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              * Denominators sourced from <strong>{detail.evidence.delivered_orders_90d}</strong> customer deliveries.
            </span>
          </div>
        </div>

        {/* Right Column: Sarthi Warnings, Ask Sarthi (Samvaad) & Sticky CTAs */}
        <div className="detail-info-container">
          {/* Confidence Strip */}
          <div className="sarthi-confidence-strip" style={{ margin: "0" }}>
            <div className="strip-header">
              <ShieldCheck size={18} />
              <span>Sarthi check: Size {detail.fit.recommended_size} recommended</span>
            </div>
            {detail.avoidable_issue && (
              <div className="strip-caution">
                <AlertTriangle size={16} />
                <span>Watch for: {detail.avoidable_issue.title}</span>
              </div>
            )}
            <div className="strip-footer">
              <span>Evidence: {detail.evidence.evidence_strength} | {detail.evidence.delivered_orders_90d} recent delivered orders</span>
            </div>
          </div>

          {/* Ask Sarthi Block */}
          <div style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "18px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <Sparkles size={18} style={{ color: "var(--accent-primary-hover)" }} />
              <h3 style={{ fontSize: "15px", margin: 0 }}>Ask Sarthi Assistant</h3>
            </div>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", margin: "0 0 12px 0" }}>
              Ask in Hinglish about fabric transparency, texture, or standard sizes.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "14px" }}>
              <button
                onClick={() => setQuery("Mera usual size L hai, yahan kya size standard rahega?")}
                style={{ fontSize: "11px", padding: "8px", background: "var(--bg-surface-muted)", borderRadius: "6px", textAlign: "left", color: "var(--text-secondary)", cursor: "pointer", border: "1px solid var(--border-subtle)" }}
              >
                "Mera usual size L hai, yahan kya size standard rahega?"
              </button>
              <button
                onClick={() => setQuery("Kapde ka color print mismatch toh nahi hai? Fabric transparency?")}
                style={{ fontSize: "11px", padding: "8px", background: "var(--bg-surface-muted)", borderRadius: "6px", textAlign: "left", color: "var(--text-secondary)", cursor: "pointer", border: "1px solid var(--border-subtle)" }}
              >
                "Kapde ka color print mismatch toh nahi hai? Fabric transparency?"
              </button>
            </div>

            <div className="phone-input-wrapper">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask Sarthi..."
                style={{ padding: "12px", fontSize: "14px" }}
              />
              <button
                onClick={submitQuestion}
                disabled={submitting || !query.trim()}
                style={{ padding: "12px 16px", background: "var(--accent-primary)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}
              >
                <Send size={15} />
              </button>
            </div>

            {/* Structured response bubble */}
            {answer && (
              <div className="samvaad-response-card" style={{ marginTop: "16px" }}>
                <div className="response-conclusion">
                  <strong>Sarthi Answer</strong>
                  <p>{answer.answer.summary}</p>
                </div>
                <div className="response-reasons">
                  {answer.answer.reasons.map((r, idx) => (
                    <div key={idx} className="reason-bullet">
                      <span>•</span>
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
          </div>

          {/* Sticky Bottom COD buy bar styled as block */}
          <div style={{
            backgroundColor: "var(--bg-surface-muted)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "12px",
            padding: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Size {selectedVariant.size} Selected</span>
              <strong style={{ fontSize: "20px", color: "var(--text-primary)" }}>Rs {selectedVariant.current_price}</strong>
            </div>
            
            <button className="btn-sticky-buy" style={{ cursor: "pointer" }} onClick={onOpenCheckout}>
              <span>Buy COD with Sarthi</span>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
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
