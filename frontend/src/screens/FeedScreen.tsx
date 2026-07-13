import { useEffect, useState, useMemo } from "react";
import { 
  ChevronRight, 
  Database, 
  Layers3, 
  Search, 
  ShieldCheck, 
  Sparkles, 
  ShoppingBag,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Star,
  Truck,
  BadgeCheck,
  CheckCircle2,
  CircleAlert,
  LockKeyhole
} from "lucide-react";
import { compareCluster, getFeed, getProductDetail, askSarthi } from "../api/client";
import { simpleTrustMeaning, t, type ExperienceMode, type LanguageCode } from "../i18n";
import type { CompareResponse, Product, ProductDetailResponse, AgentResponse } from "../types/api";
import { CompareSheet } from "./CompareSheet";
import { CheckoutSheet } from "./CheckoutSheet";
import { AuditDrawer } from "./AuditDrawer";

type Props = {
  buyerId: string;
  ready: boolean;
  onBuyerChange: (buyerId: string) => void;
  language: LanguageCode;
  experienceMode: ExperienceMode;
};

type AgentCheck = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
};

export function FeedScreen({ buyerId, ready, language, experienceMode }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [auditTraceId, setAuditTraceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkoutStep, setCheckoutStep] = useState<"feed" | "compare" | "detail">("feed");
  const [showProofLog, setShowProofLog] = useState(false);
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
    setCheckoutStep("feed");
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
  const clusterId = selectedClusterId || sarthiClusters[0]?.cluster_id || "cluster_floral_blue";

  // Comparison call
  async function runComparison(targetClusterId = clusterId) {
    setLoading(true);
    setError(null);
    setSelectedClusterId(targetClusterId);
    try {
      const result = await compareCluster(buyerId, targetClusterId);
      setComparison(result);
      setSelectedProductId(result.selected_product_id);
      setSelectedVariantId(result.ranking.winner);
      setCheckoutStep("compare");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to compare listings");
    } finally {
      setLoading(false);
    }
  }

  // Active product details
  const activeProduct = products.find((product) => product.product_id === selectedProductId) ?? products[0];

  return (
    <div style={{ minHeight: "calc(100vh - 70px)", display: "flex", flexDirection: "column" }}>
      {error && (
        <div className="notice error" style={{ maxWidth: "1200px", margin: "20px auto 0", width: "calc(100% - 48px)" }}>
          {error}
        </div>
      )}

      {/* Main Layout Grid */}
      <main className="product-assistant-layout">
        {/* Left Side: Active Flow Step Panels */}
        <section className="left-panel">
          {/* Step 1: Catalog Feed List */}
          {checkoutStep === "feed" && (
            <MarketplaceHome
              products={visibleProducts}
              allProducts={products}
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              sarthiClusters={sarthiClusters}
              selectedClusterId={clusterId}
              onSelectCluster={setSelectedClusterId}
              onRunComparison={runComparison}
              loading={loading}
              language={language}
            />
          )}

          {/* Step 2: Compare Listings View */}
          {checkoutStep === "compare" && comparison && (
            <CompareSheet
              comparison={comparison}
              language={language}
              experienceMode={experienceMode}
              onOpenAudit={() => {
                setAuditTraceId(comparison.trace_id);
                setShowProofLog(true);
              }}
              onContinue={() => {
                setSelectedProductId(comparison.selected_product_id);
                setSelectedVariantId(comparison.ranking.winner);
                setCheckoutStep("detail");
              }}
            />
          )}

          {/* Step 3: Product Detail View (Image gallery, comparison details, Samvaad) */}
          {checkoutStep === "detail" && comparison && selectedProductId && selectedVariantId && (
            <ProductDetailPanel
              buyerId={buyerId}
              productId={selectedProductId}
              initialVariantId={selectedVariantId}
              clusterId={clusterId}
              products={products}
              onSelectListing={(prodId, varId) => {
                setSelectedProductId(prodId);
                setSelectedVariantId(varId);
              }}
              onOpenAudit={(traceId) => {
                setAuditTraceId(traceId);
                setShowProofLog(true);
              }}
              comparison={comparison}
              language={language}
              experienceMode={experienceMode}
            />
          )}
        </section>

        {/* Right Side: Persistent Sarthi Checkout Trust Panel */}
        <section className="right-sidebar">
          {checkoutStep === "feed" ? (
            <div className="card-surface" style={{ background: "var(--bg-sand)", textAlign: "center", padding: "40px 24px", color: "var(--text-secondary)" }}>
              <ShoppingBag size={32} style={{ margin: "0 auto 12px", color: "var(--moss-green)" }} />
              <strong style={{ fontSize: "16px", color: "var(--forest-green)", display: "block" }}>{t(language, "awaitingScanTitle")}</strong>
              <p style={{ fontSize: "13px", marginTop: "6px" }}>
                {t(language, "awaitingScanBody")}
              </p>
            </div>
          ) : (
            <SarthiTrustSidebar 
              buyerId={buyerId}
              productId={selectedProductId || activeProduct?.product_id}
              variantId={selectedVariantId || comparison?.ranking.winner || ""}
              clusterId={clusterId}
              onOpenAudit={(traceId) => {
                setAuditTraceId(traceId);
                setShowProofLog(true);
              }}
              language={language}
              experienceMode={experienceMode}
            />
          )}
        </section>
      </main>

      {/* Accordion Proof Logs at Footer */}
      {comparison && (
        <section className="proof-accordion">
          <button 
            className="proof-header-btn"
            onClick={() => setShowProofLog(!showProofLog)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Database size={16} />
              <span>Sarthi Decision Engine Proof Logs</span>
            </div>
            {showProofLog ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          
          {showProofLog && (
            <div className="proof-dropdown-content">
              <AuditDrawer 
                traceId={auditTraceId || comparison.trace_id} 
                onClose={() => setShowProofLog(false)} 
              />
            </div>
          )}
        </section>
      )}

      {/* Footer Info */}
      <footer className="landing-footer" style={{ marginTop: "auto" }}>
        <div className="footer-content">
          <div className="footer-copyright">
            &copy; {new Date().getFullYear()} Sarthi. Built for Bharat.
          </div>
          <div className="footer-team">
            RuntimeTerrors &bull; Meesho ScriptedBy{"{Her}"} 2.0
          </div>
        </div>
      </footer>
    </div>
  );
}

function MarketplaceHome({
  products,
  allProducts,
  categories,
  selectedCategory,
  onCategoryChange,
  searchTerm,
  onSearchChange,
  sarthiClusters,
  selectedClusterId,
  onSelectCluster,
  onRunComparison,
  loading,
  language
}: {
  products: Product[];
  allProducts: Product[];
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  sarthiClusters: Product[];
  selectedClusterId: string;
  onSelectCluster: (clusterId: string) => void;
  onRunComparison: (clusterId?: string) => void;
  loading: boolean;
  language: LanguageCode;
}) {
  const selectedCluster = sarthiClusters.find((product) => product.cluster_id === selectedClusterId) ?? sarthiClusters[0];

  return (
    <div className="marketplace-home">
      <section className="market-hero">
        <div>
          <span className="eyebrow">Sarthi Bazaar</span>
          <h1>Shop normally. Let Sarthi interrupt only when a choice needs proof.</h1>
          <p>
            Browse a full marketplace feed with regular product cards, photos, offers, ratings, and delivery promises. Sarthi turns on for duplicate listings where return, size, seller, and offer facts can actually help.
          </p>
        </div>
        <div className="market-hero-stat">
          <strong>{allProducts.length}</strong>
          <span>live catalog items</span>
        </div>
      </section>

      <section className="market-controls">
        <label className="market-search">
          <Search size={17} />
          <input
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search kurtis, tops, bags, bedsheets..."
          />
        </label>
        <div className="market-category-row">
          {categories.map((category) => (
            <button
              key={category}
              className={category === selectedCategory ? "active" : ""}
              onClick={() => onCategoryChange(category)}
            >
              {category}
            </button>
          ))}
        </div>
      </section>

      {selectedCluster && (
        <section className="sarthi-confidence-rail">
          <div className="confidence-copy">
            <div className="confidence-icon">
              <BadgeCheck size={19} />
            </div>
            <div>
              <span className="eyebrow">Needs Sarthi</span>
              <h2>{selectedCluster.title.replace(" - Seller Option 1", "")}</h2>
              <p>
                Similar listings from multiple sellers. Sarthi can compare exact variants using kept-order evidence, seller verification, offer truth, and avoidable-return reasons.
              </p>
            </div>
          </div>
          <div className="confidence-actions">
            <select value={selectedClusterId} onChange={(event) => onSelectCluster(event.target.value)}>
              {sarthiClusters.map((product) => (
                <option key={product.cluster_id} value={product.cluster_id}>
                  {product.title.replace(" - Seller Option 1", "")}
                </option>
              ))}
            </select>
            <button className="btn-buy-cod" onClick={() => onRunComparison(selectedCluster.cluster_id)} disabled={loading}>
              {loading ? "Analyzing trust records..." : t(language, "resolveListings")}
              <ChevronRight size={18} />
            </button>
          </div>
        </section>
      )}

      <section className="market-offer-strip">
        <span>Festive deals</span>
        <strong>COD available on selected items</strong>
        <span>Free delivery from trusted sellers</span>
      </section>

      <section className="market-grid-section">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Recommended for you</span>
            <h2>Fresh picks across categories</h2>
          </div>
          <span className="market-count">{products.length} products</span>
        </div>
        <div className="market-product-grid">
          {products.map((product) => (
            <ProductTile
              key={product.product_id}
              product={product}
              onScan={() => onRunComparison(product.cluster_id)}
              onSelectCluster={() => onSelectCluster(product.cluster_id)}
              loading={loading && selectedClusterId === product.cluster_id}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ProductTile({
  product,
  onScan,
  onSelectCluster,
  loading
}: {
  product: Product;
  onScan: () => void;
  onSelectCluster: () => void;
  loading: boolean;
}) {
  const sarthiEnabled = Boolean(product.is_sarthi_eligible);
  return (
    <article className="market-product-card" onMouseEnter={onSelectCluster}>
      <div className="market-product-image">
        <img
          src={productImage(product)}
          alt={product.title}
          onError={(event) => {
            event.currentTarget.src = fallbackProductImage(product.color_family);
          }}
        />
        <span>{product.commerce_badge}</span>
      </div>
      <div className="market-product-body">
        <div className="market-product-title">
          <strong>{product.title.replace(" - Seller Option", "")}</strong>
          <small>{product.seller_name}</small>
        </div>
        <div className="market-rating-row">
          <span>
            <Star size={12} fill="currentColor" />
            {product.rating.toFixed(1)}
          </span>
          <small>{product.rating_count.toLocaleString("en-IN")} ratings</small>
        </div>
        <div className="market-price-row">
          <strong>Rs {product.base_price}</strong>
          <span>{labelize(product.category)}</span>
        </div>
        <div className="market-delivery-row">
          <Truck size={13} />
          <span>{product.delivery_text}</span>
        </div>
        {sarthiEnabled ? (
          <button className="market-scan-btn" onClick={onScan} disabled={loading}>
            {loading ? "Scanning..." : "Compare with Sarthi"}
          </button>
        ) : (
          <div className="market-catalog-only">Catalog browsing. Trust analysis not needed for this item.</div>
        )}
      </div>
    </article>
  );
}

// Inner Component: Product Details Page (Left Column Content)
function ProductDetailPanel({
  buyerId,
  productId,
  initialVariantId,
  clusterId,
  products,
  onSelectListing,
  onOpenAudit,
  comparison,
  language,
  experienceMode
}: {
  buyerId: string;
  productId: string;
  initialVariantId: string;
  clusterId: string;
  products: Product[];
  onSelectListing: (prodId: string, varId: string) => void;
  onOpenAudit: (traceId: string) => void;
  comparison: CompareResponse;
  language: LanguageCode;
  experienceMode: ExperienceMode;
}) {
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariantId);
  const [query, setQuery] = useState("In teen mein best kaunsa hai? Mera usual L hai, kapda thin nahi chahiye.");
  const [answer, setAnswer] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setAnswer(null);
    getProductDetail(buyerId, productId)
      .then((payload) => {
        setDetail(payload);
        setSelectedVariantId(payload.selected_variant.variant_id);
      })
      .catch((err: Error) => setError(err.message));
  }, [buyerId, productId]);

  useEffect(() => {
    setSelectedVariantId(initialVariantId);
  }, [initialVariantId]);

  async function submitQuestion() {
    setLoading(true);
    setError(null);
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
        onSelectListing(productId, response.answer.primary_action.variant_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sarthi could not answer right now");
    } finally {
      setLoading(false);
    }
  }

  // Prebaked questions
  const handleSuggestionClick = (qText: string) => {
    setQuery(qText);
  };

  if (!detail) {
    return <div className="card-surface">Loading details...</div>;
  }

  return (
    <div className={experienceMode === "simple" ? "simple-mode" : ""} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* 1. Gallery and Title */}
      <div className="card-surface gallery-section">
        <div className="gallery-image-box">
          <img
            src={productImage(detail.product)}
            alt={detail.product.title}
            onError={(event) => {
              event.currentTarget.src = fallbackProductImage(detail.product.color_family);
            }}
          />
          <span className="gallery-image-tag">{detail.product.color_family}</span>
        </div>
        <div className="detail-info-block">
          <div className="detail-header-text">
            <span className="seller-indicator">Sold by: {detail.product.seller_name}</span>
            <h1>{detail.product.title.replace(" - Seller Option", "")}</h1>
            <p style={{ marginTop: "4px" }}>{detail.product.garment_type} &bull; {detail.product.fabric}</p>
            <div className="price-row">
              <span className="current-price">Rs {detail.selected_variant.current_price}</span>
              <span className="genuine-badge">
                <ShieldCheck size={12} />
                Offer checked at checkout
              </span>
            </div>
          </div>
          <div style={{ borderTop: "1px solid var(--border-beige)", paddingTop: "12px", fontSize: "12px", color: "var(--text-secondary)" }}>
            Evidence strength: <strong style={{ color: "var(--forest-green)" }}>{detail.evidence.evidence_strength}</strong> &bull; Seller status: <strong style={{ color: "var(--forest-green)" }}>{detail.trust_state.seller_verification.verification_status}</strong>
          </div>
        </div>
      </div>

      {/* 2. Confusion Resolver Table */}
      <div className="card-surface comparison-section">
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Layers3 size={18} style={{ color: "var(--forest-green)" }} />
          <h3>Confusion Resolver listings</h3>
        </div>
        <div className="comparison-meta">
          <ShieldCheck size={16} />
          <p style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            Sarthi consolidation of duplicate seller listings. We ranked <strong>{detail.product.seller_name}</strong> as the winner based on return ratios and dispatch speed.
          </p>
        </div>
        <div className="comparison-table-wrapper">
          <table className="comparison-table">
            <thead>
              <tr>
                <th style={{ width: "40px" }}></th>
                <th>Seller name</th>
                <th>Price</th>
                <th>Sarthi score</th>
                <th>Size fit</th>
                <th>Dispatch signal</th>
              </tr>
            </thead>
            <tbody>
              {products.filter((p) => p.cluster_id === clusterId).map((p) => {
                const isSelected = p.product_id === productId;
                const candidate = candidateForProduct(comparison, p.product_id);
                return (
                  <tr 
                    key={p.product_id}
                    className={isSelected ? "recommended-row" : ""}
                    onClick={() => {
                      // Lookup matching variant
                      getProductDetail(buyerId, p.product_id).then((payload) => {
                        onSelectListing(p.product_id, payload.selected_variant.variant_id);
                      });
                    }}
                  >
                    <td>
                      <span className="selection-dot"></span>
                    </td>
                    <td>
                      <strong>{p.seller_name}</strong>
                      {p.product_id === comparison.selected_product_id && (
                        <span style={{ fontSize: "10px", background: "var(--forest-green)", color: "#fff", padding: "2px 6px", borderRadius: "4px", marginLeft: "8px" }}>Best Keep</span>
                      )}
                    </td>
                    <td>Rs {p.base_price}</td>
                    <td>
                      <strong style={{ color: "var(--primary-green)" }}>
                        {candidate ? Math.round(candidate.score * 100) : "Pending"}
                      </strong>
                    </td>
                    <td>{formatSignal(candidate?.factors.fit_match)}</td>
                    <td>{formatSignal(candidate?.factors.fulfilment_reliability)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Sarthi Samvaad chat panel */}
      <div className="card-surface samvaad-section">
        <div className="samvaad-intro">
          <Sparkles size={18} />
          <h3>Sarthi Samvaad assistant</h3>
        </div>
        <p style={{ marginTop: "-8px" }}>
          Ask Sarthi specific questions about size fit, color accuracy, or material guidelines. Answers are grounded in available review, outcome, and graph facts.
        </p>

        <div className="samvaad-suggestions">
          <button className="btn-suggestion" onClick={() => handleSuggestionClick("Mera usual size L hai, yahan kya size order karoon?")}>
            "Mera usual size L hai, yahan kya size order karoon?"
          </button>
          <button className="btn-suggestion" onClick={() => handleSuggestionClick("Kya fabric transparency ki problem hai? Summer ke liye kaisa hai?")}>
            "Kya fabric transparency ki problem hai? Summer ke liye kaisa hai?"
          </button>
        </div>

        <div className="samvaad-input-box">
          <textarea 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your question in Hinglish, English, or vernacular..."
          />
          <div className="samvaad-input-footer">
            <button className="btn-ask-sarthi" onClick={submitQuestion} disabled={loading}>
              {loading ? "Grounded graph search..." : "Submit Question"}
            </button>
          </div>
        </div>

        {answer && (
          <div className="samvaad-answer-bubble">
            <div className="samvaad-answer-header">
              <h4>{answer.answer.title}</h4>
              <button className="btn-text-link" onClick={() => onOpenAudit(answer.trace_id)}>
                <HelpCircle size={12} />
                <span>Traversals log</span>
              </button>
            </div>
            <p style={{ fontSize: "13px" }}>{answer.answer.summary}</p>
            {answer.answer.reasons.length > 0 && (
              <div className="samvaad-reasons">
                {answer.answer.reasons.map((r) => (
                  <span key={r}>&bull; {r}</span>
                ))}
              </div>
            )}
            {answer.answer.caution && (
              <div style={{ background: "var(--danger-red-bg)", border: "1px solid var(--danger-red-border)", padding: "10px", borderRadius: "8px", color: "var(--danger-red)", fontSize: "12px", marginTop: "4px" }}>
                {answer.answer.caution}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Inner Component: Sarthi Trust Checkout Sidebar (Right Column)
function SarthiTrustSidebar({
  buyerId,
  productId,
  variantId,
  clusterId,
  onOpenAudit,
  language,
  experienceMode
}: {
  buyerId: string;
  productId: string;
  variantId: string;
  clusterId: string;
  onOpenAudit: (traceId: string) => void;
  language: LanguageCode;
  experienceMode: ExperienceMode;
}) {
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(variantId);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  useEffect(() => {
    getProductDetail(buyerId, productId).then((payload) => {
      setDetail(payload);
    });
  }, [buyerId, productId]);

  useEffect(() => {
    setSelectedVariantId(variantId);
  }, [variantId]);

  if (!detail) {
    return <div className="card-surface">Loading trust details...</div>;
  }

  const selectedVariant = detail.variants.find((v) => v.variant_id === selectedVariantId) ?? detail.selected_variant;
  const memoryCopy = detail.privacy.fit_memory_enabled
    ? `Uses your category fit memory and aggregate ${detail.evidence.evidence_strength} product evidence.`
    : `No personal fit memory used. Advice falls back to aggregate ${detail.evidence.evidence_strength} product evidence.`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <TrustReceipt detail={detail} language={language} experienceMode={experienceMode} />

      <AgentCheckTimeline detail={detail} selectedVariant={selectedVariant} language={language} experienceMode={experienceMode} />

      <div className={`trust-state-card ${detail.trust_state.status}`}>
        <div className="trust-state-head">
          <span className="eyebrow">Truth Status</span>
          <span>{detail.trust_state.confidence}</span>
        </div>
        <h3>{detail.trust_state.headline}</h3>
        <p>{detail.trust_state.summary}</p>
        <div className="trust-state-meta">
          <span>{detail.trust_state.can_recommend ? "Recommendation allowed" : "Recommendation paused"}</span>
          <span>Sources: {detail.trust_state.data_freshness.overall_status}</span>
          <span>Seller: {detail.trust_state.seller_verification.verification_status}</span>
        </div>
        <div className="trust-guidance">{detail.trust_state.buyer_guidance}</div>
        {detail.trust_state.missing_data.length > 0 && (
          <div className="trust-missing-list">
            {detail.trust_state.missing_data.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        )}
      </div>

      {/* 1. Size Oracle Box */}
      <div className="card-surface oracle-box">
        <div className="oracle-row">
          <div className="oracle-title-lockup">
            <span className="eyebrow" style={{ color: "var(--forest-green)" }}>Size Oracle Recommendation</span>
          </div>
          <span className="oracle-badge">{detail.fit.recommended_size}</span>
        </div>
        <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "-6px" }}>
          {memoryCopy} Recommended size is <strong>{detail.fit.recommended_size}</strong>.
        </p>
        
        {/* Size Selection Chips */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--forest-green)" }}>Change Size:</span>
          <div className="oracle-selector-row">
            {detail.variants.map((v) => (
              <button
                key={v.variant_id}
                className={`btn-size-chip ${v.variant_id === selectedVariantId ? "active" : ""}`}
                onClick={() => setSelectedVariantId(v.variant_id)}
              >
                {v.size}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Galti Mat Dohrao Warnings Banner */}
      {detail.avoidable_issue && (
        <div className="galti-warning-card">
          <ShieldCheck size={18} style={{ color: "var(--forest-green)" }} />
          <div>
            <strong>{detail.avoidable_issue.title}</strong>
            <span>{detail.avoidable_issue.action}</span>
          </div>
        </div>
      )}

      {/* 3. Per-SKU Trust Metrics Card */}
      <div className="card-surface trust-metrics-card">
        <span className="eyebrow">Per-SKU Factual Evidence</span>
        <div className="metrics-block-grid">
          <div className="metric-data-block">
            <span>Size Accuracy</span>
            <strong>{formatPercent(detail.evidence.fit_as_expected_rate)}</strong>
          </div>
          <div className="metric-data-block">
            <span>Color Match</span>
            <strong>{colorMatchPercent(detail.evidence)}</strong>
          </div>
          <div className="metric-data-block">
            <span>Dispatch</span>
            <strong>{detail.evidence.median_dispatch_hours}h</strong>
          </div>
        </div>
        <div className="trust-summary-text">
          Derived from <strong>{detail.evidence.delivered_orders_90d}</strong> delivered outcomes with fact-backed review and return signals.
        </div>
      </div>

      {/* 4. Dark Pattern Disruptor Offer check */}
      <div className="disruptor-banner">
        <TrendingDown size={18} style={{ color: "var(--moss-green)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "12px" }}>
          <strong style={{ color: "var(--forest-green)" }}>Verified Deal Details</strong>
          <p style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            Offer Sach Check runs at checkout using price events, campaign facts, inventory, and timer-reset history.
          </p>
        </div>
      </div>

      {/* 5. Checkout trigger */}
      <button 
        className="btn-buy-cod"
        onClick={() => setCheckoutOpen(true)}
        disabled={!selectedVariant}
      >
        Buy COD with Sarthi
      </button>

      {/* Render checkout modal */}
      {checkoutOpen && selectedVariant && (
        <CheckoutSheet 
          buyerId={buyerId} 
          variantId={selectedVariant.variant_id} 
          onOpenAudit={onOpenAudit} 
          onClose={() => setCheckoutOpen(false)}
          language={language}
          experienceMode={experienceMode}
        />
      )}
    </div>
  );
}

function TrustReceipt({
  detail,
  language,
  experienceMode
}: {
  detail: ProductDetailResponse;
  language: LanguageCode;
  experienceMode: ExperienceMode;
}) {
  const proofCount = uniqueFactCount([
    ...detail.evidence.fact_ids,
    ...detail.fit.fact_ids,
    ...detail.review_evidence.fabric.fact_ids,
    ...detail.review_evidence.color.fact_ids,
    ...detail.graph_paths.flatMap((path) => path.fact_ids)
  ]);
  const meaning = simpleTrustMeaning(detail.trust_state.status, detail.trust_state.can_recommend, language);
  const isSimple = experienceMode === "simple";

  return (
    <div className={`trust-receipt-card ${isSimple ? "simple" : "detailed"}`}>
      <div className="trust-receipt-top">
        <div>
          <span className="eyebrow">{t(language, "trustReceipt")}</span>
          <h3>{meaning}</h3>
        </div>
        <span className={`trust-receipt-pill ${detail.trust_state.can_recommend ? "allowed" : "paused"}`}>
          {detail.trust_state.can_recommend ? t(language, "recommendationAllowed") : t(language, "recommendationPaused")}
        </span>
      </div>

      <div className="trust-receipt-section">
        <span>{t(language, "whatThisMeans")}</span>
        <strong>{isSimple ? detail.trust_state.buyer_guidance : detail.trust_state.summary}</strong>
      </div>

      <div className="trust-receipt-section">
        <span>{t(language, "nextStep")}</span>
        <strong>{detail.trust_state.buyer_guidance}</strong>
      </div>

      {!isSimple && (
        <div className="trust-receipt-facts">
          <div>
            <span>{t(language, "proofAvailable")}</span>
            <strong>{proofCount}</strong>
          </div>
          <div>
            <span>Evidence</span>
            <strong>{detail.evidence.evidence_strength}</strong>
          </div>
          <div>
            <span>Sources</span>
            <strong>{detail.trust_state.data_freshness.overall_status}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function AgentCheckTimeline({
  detail,
  selectedVariant,
  language,
  experienceMode
}: {
  detail: ProductDetailResponse;
  selectedVariant: ProductDetailResponse["selected_variant"];
  language: LanguageCode;
  experienceMode: ExperienceMode;
}) {
  const checks = buildAgentChecks(detail, selectedVariant, language);

  return (
    <div className={`agent-check-card ${experienceMode === "simple" ? "simple" : ""}`}>
      <div className="agent-check-header">
        <div>
          <span className="eyebrow">{t(language, "agentChecks")}</span>
          <h3>Sarthi decision trail</h3>
        </div>
        <LockKeyhole size={16} />
      </div>
      <div className="agent-check-list">
        {checks.map((check) => (
          <div key={check.id} className={`agent-check-row ${check.passed ? "passed" : "attention"}`}>
            <span className="agent-check-icon">
              {check.passed ? <CheckCircle2 size={15} /> : <CircleAlert size={15} />}
            </span>
            <div>
              <strong>{check.label}</strong>
              <span>{check.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildAgentChecks(
  detail: ProductDetailResponse,
  selectedVariant: ProductDetailResponse["selected_variant"],
  language: LanguageCode
): AgentCheck[] {
  const sellerVerified = detail.trust_state.seller_verification.verification_status === "verified";
  const hasOutcomeProof = detail.evidence.delivered_orders_90d > 0 && detail.evidence.evidence_strength !== "unknown";
  const fitUsable = detail.fit.confidence !== "low";
  const privacyProtected = detail.privacy.fit_memory_enabled || detail.privacy.not_used.length > 0;

  return [
    {
      id: "seller",
      label: t(language, "sellerChecked"),
      passed: sellerVerified,
      detail: sellerVerified
        ? `${detail.trust_state.seller_verification.seller_name ?? "Seller"} is verified for buyer-facing recommendation.`
        : "Seller verification is pending or restricted, so recommendation is paused."
    },
    {
      id: "returns",
      label: t(language, "returnsChecked"),
      passed: hasOutcomeProof,
      detail: hasOutcomeProof
        ? `${detail.evidence.delivered_orders_90d} delivered orders and ${detail.evidence.returns_90d} returns checked.`
        : "Not enough delivered-order evidence yet."
    },
    {
      id: "size",
      label: t(language, "sizeChecked"),
      passed: fitUsable,
      detail: `Recommended size ${detail.fit.recommended_size} with ${detail.fit.confidence} fit confidence.`
    },
    {
      id: "price",
      label: t(language, "priceChecked"),
      passed: selectedVariant.current_price > 0,
      detail: `Current price Rs ${selectedVariant.current_price}. Final campaign and timer truth runs before COD confirmation.`
    },
    {
      id: "privacy",
      label: t(language, "privacyChecked"),
      passed: privacyProtected,
      detail: detail.privacy.fit_memory_enabled
        ? "Private fit memory is used only for this buyer and never exposed to sellers."
        : "Private fit memory is off; Sarthi used aggregate evidence only."
    }
  ];
}

function uniqueFactCount(factIds: string[]) {
  return new Set(factIds.filter(Boolean)).size;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatSignal(value?: number) {
  if (value === undefined) return "Pending";
  return `${Math.round(value * 100)}%`;
}

function colorMatchPercent(evidence: ProductDetailResponse["evidence"]) {
  if (!evidence.delivered_orders_90d) return "Unknown";
  const colorMatchRate = 1 - evidence.color_mismatch_returns / evidence.delivered_orders_90d;
  return formatPercent(Math.max(0, colorMatchRate));
}

function candidateForProduct(comparison: CompareResponse, productId: string) {
  return comparison.ranking.candidates.find((candidate) => (
    candidate.variant_id.replace(/_[^_]+$/, "") === productId
  ));
}

function productImage(product: Product) {
  return product.image_url || fallbackProductImage(product.color_family);
}

function fallbackProductImage(color: string) {
  if (color === "pink") return "/product-pink.svg";
  if (color === "maroon") return "/product-maroon.svg";
  return "/product-blue.svg";
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}
