import { 
  ArrowRight, 
  ChevronRight, 
  Layers3, 
  ShieldCheck, 
  Ruler, 
  MessageCircle, 
  ShieldAlert, 
  EyeOff, 
  RefreshCcw, 
  Database, 
  TrendingDown, 
  Users, 
  ShoppingBag
} from "lucide-react";

type Props = {
  onStartDemo: () => void;
};

export function LandingPage({ onStartDemo }: Props) {
  return (
    <div className="landing-shell">
      {/* Header */}
      <header className="landing-header">
        <div className="nav-container">
          <div className="logo-lockup">
            <div className="logo-badge">S</div>
            <span className="logo-text">Sarthi</span>
          </div>
          <nav className="nav-links">
            <a href="#problem" className="nav-link">The Return Crisis</a>
            <a href="#features" className="nav-link">Features</a>
            <a href="#architecture" className="nav-link">Architecture</a>
          </nav>
          <button className="hero-btn" onClick={onStartDemo}>
            Open Workspace
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <div className="hero-tagline">
            <ShieldCheck size={12} style={{ marginRight: 6 }} />
            Agentic Trust Layer for Bharat Commerce
          </div>
          <h1>Talk to any product. Buy with confidence.</h1>
          <p>
            An intelligent trust and size guide for Bharat that turns uncertainty into a confident choice. Sarthi evaluates merchant evidence, resolves fit mismatches, and neutralizes pressure cues before you click order.
          </p>
          <div className="cta-group">
            <button className="btn-primary" onClick={onStartDemo}>
              Try Product Flow
              <ChevronRight size={16} />
            </button>
            <a href="#features" className="btn-secondary">
              Explore Features
            </a>
          </div>
        </div>
        
        <div className="hero-visual">
          <div className="hero-illustration">
            <div className="diagram-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="eyebrow" style={{ color: "var(--primary-green)" }}>Sarthi Resolver Pick</span>
                <span className="badge-pill">Evidence-backed pick</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--forest-green)" }}>Cotton Anarkali Kurta - Option A</div>
              <div className="diagram-bar fill-green"></div>
              <div className="badge-row">
                <span className="badge-pill">Verified Seller</span>
                <span className="badge-pill">Cross-Brand Size XL</span>
                <span className="badge-pill danger">Offer check ready</span>
              </div>
            </div>
            
            <div className="diagram-card" style={{ marginTop: 16, opacity: 0.7, transform: "scale(0.95)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="eyebrow">Other Listing - Option B</span>
                <span className="badge-pill danger">Higher return signal</span>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text-secondary)" }}>Identical Anarkali Kurta - Option B</div>
              <div className="diagram-bar" style={{ width: "35%" }}></div>
              <div className="badge-row">
                <span className="badge-pill" style={{ background: "var(--bg-beige)", color: "var(--text-muted)" }}>Slow Dispatch</span>
                <span className="badge-pill danger">Color Mismatch Warning</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats/Problem Section */}
      <section id="problem" className="stats-section">
        <div className="stats-container">
          <div className="section-title-block">
            <div className="eyebrow">The E-Commerce Challenge</div>
            <h2>Why Bharat Shoppers Struggle With Returns</h2>
            <p>
              In regional e-commerce, identical items clog search feeds. Without cross-brand sizing rules or clear trust metrics, buyers guess, resulting in massive operational friction.
            </p>
          </div>
          
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-number">28–35%</div>
              <div className="stat-label">COD Return Rate</div>
              <div className="stat-desc">Cash-on-Delivery orders returned to origin in Tier-2/3 cities.</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">₹1,900 Cr</div>
              <div className="stat-label">Annual Return Waste</div>
              <div className="stat-desc">Direct losses due to reverse logistics and dead inventory overheads.</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">42%</div>
              <div className="stat-label">Size Mismatch</div>
              <div className="stat-desc">The primary driver of e-commerce returns due to lack of tape measures.</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">87%</div>
              <div className="stat-label">Confidence Failure</div>
              <div className="stat-desc">Returns caused by misaligned buyer expectations, not actual product defects.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid Section */}
      <section id="features" className="features-section">
        <div className="section-title-block">
          <div className="eyebrow">The Sarthi System</div>
          <h2>Seven Integrated Confidence Features</h2>
          <p>
            Sarthi acts as a proactive decision layer at checkout, helping buyers select the right option the first time.
          </p>
        </div>

        <div className="features-grid">
          {/* Feature 1 */}
          <div className="feature-item-card">
            <div className="feature-icon">
              <Layers3 size={20} />
            </div>
            <h3>Confusion Resolver</h3>
            <p>
              Consolidates duplicate catalog listings and scores them based on historical kept rates, seller dispatch speed, and size accuracy—not sponsor ad bids.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="feature-item-card">
            <div className="feature-icon">
              <ShieldCheck size={20} />
            </div>
            <h3>Per-SKU Trust Card</h3>
            <p>
              Auto-extracts product-level statistics from returns datasets. Surfaces actual size accuracy, color matching, and transit safety scores.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="feature-item-card">
            <div className="feature-icon">
              <Ruler size={20} />
            </div>
            <h3>Size Oracle</h3>
            <p>
              Bridges cross-brand sizes by querying your closet. Simply specify "Which brand fits you best at home?" and Sarthi outputs the perfect match.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="feature-item-card">
            <div className="feature-icon">
              <MessageCircle size={20} />
            </div>
            <h3>Sarthi Samvaad</h3>
            <p>
              Ask any clothing query in simple Hinglish. Sarthi checks seller, SKU, return, proof, and offer facts before answering.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="feature-item-card">
            <div className="feature-icon">
              <ShieldAlert size={20} />
            </div>
            <h3>Galti Mat Dohrao</h3>
            <p>
              Triggers variant-specific cautions prior to purchase (e.g. "Color is slightly darker under artificial lights") to prevent buyer surprise.
            </p>
          </div>

          {/* Feature 6 */}
          <div className="feature-item-card">
            <div className="feature-icon">
              <EyeOff size={20} />
            </div>
            <h3>Dark Pattern Disruptor</h3>
            <p>
              Identifies synthetic inventory pressure and removes manipulated countdown clocks, replacing them with honest historical price verifications.
            </p>
          </div>
        </div>
        
        {/* Highlighted Feature 7 */}
        <div className="feature-item-card" style={{ gridColumn: "1 / -1", flexDirection: "row", gap: "24px", alignItems: "center" }}>
          <div className="feature-icon" style={{ width: 56, height: 56, flexShrink: 0 }}>
            <RefreshCcw size={28} />
          </div>
          <div>
            <h3>Buy-to-Keep Feedback Learning Loop</h3>
            <p style={{ marginTop: 4 }}>
              The core engine improves with every transaction. Kept or returned delivery outcomes update the evidence store, refining future sizing recommendations and seller scores.
            </p>
          </div>
        </div>
      </section>

      {/* Tech Stack / Architecture */}
      <section id="architecture" className="arch-section">
        <div className="arch-container">
          <div className="arch-content">
            <div className="eyebrow" style={{ color: "var(--sage-green)" }}>Under the Hood</div>
            <h2>Factual Evidence Decision Pipeline</h2>
            <p style={{ color: "#b3c2b8" }}>
              Unlike a free-chat assistant, Sarthi verifies answers against product, seller, return, proof, offer, and audit records.
            </p>
            
            <div className="arch-steps">
              <div className="arch-step-row">
                <div className="arch-step-num">1</div>
                <div className="arch-step-text">
                  <h4>MongoDB Atlas Evidence Store</h4>
                  <p>Keeps product facts, order outcomes, price revisions, reviewer profiles, and audit records.</p>
                </div>
              </div>
              <div className="arch-step-row">
                <div className="arch-step-num">2</div>
                <div className="arch-step-text">
                  <h4>MongoDB Evidence Projection</h4>
                  <p>Builds a server-side evidence map between sellers, SKUs, reviews, returns, proof, offers, and private buyer fit context.</p>
                </div>
              </div>
              <div className="arch-step-row">
                <div className="arch-step-num">3</div>
                <div className="arch-step-text">
                  <h4>Deterministic Agent Routing</h4>
                  <p>Orchestrates intent extraction, database lookups, and outputs transparent proof IDs for the user.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="arch-diagram">
            <div className="diagram-node">1. Asha Voice/Text Query</div>
            <div className="diagram-arrow">↓</div>
            <div className="diagram-node active">2. Agent Intent Extraction</div>
            <div className="diagram-arrow">↓</div>
            <div className="diagram-node">3. Evidence Map Projection</div>
            <div className="diagram-arrow">↓</div>
            <div className="diagram-node active">4. Cross-Brand Sizing & Warnings</div>
            <div className="diagram-arrow">↓</div>
            <div className="diagram-node">5. Confident Purchase Outcome</div>
          </div>
        </div>
      </section>

      {/* Interactive CTA */}
      <section className="cta-section">
        <div className="cta-banner">
          <h2>Ready to experience Sarthi?</h2>
          <p>
            Step into the product workspace. Compare items, ask evidence-backed questions, and sync delivery results back to future trust checks.
          </p>
          <button className="btn-primary" onClick={onStartDemo} style={{ padding: "16px 36px", fontSize: 16 }}>
            Open Product Workspace
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-copyright">
            &copy; {new Date().getFullYear()} Sarthi. Built for Bharat.
          </div>
          <div className="footer-team">
            Presented by RuntimeTerrors &bull; Meesho ScriptedBy{"{Her}"} 2.0
          </div>
        </div>
      </footer>
    </div>
  );
}
