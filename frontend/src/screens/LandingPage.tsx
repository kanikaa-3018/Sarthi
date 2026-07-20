import type { SyntheticEvent } from "react";
import { SarthiMark } from "../components/SarthiMark";

type Props = {
  theme: "light" | "dark";
  onStartDemo: () => void;
  onToggleTheme: () => void;
};

const catalogImages = {
  blueKurti: "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1000&q=86",
  pinkKurti: "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=900&q=84",
  maroonSet: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=84",
  cottonTop: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=84",
  saree: "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=84"
};

const catalogFallbacks = {
  blueKurti: "/product-blue.svg",
  pinkKurti: "/product-pink.svg",
  maroonSet: "/product-maroon.svg",
  cottonTop: "/product-blue.svg",
  saree: "/product-maroon.svg"
};

function useFallbackImage(event: SyntheticEvent<HTMLImageElement>, fallback: string) {
  if (event.currentTarget.src.endsWith(fallback)) return;
  event.currentTarget.src = fallback;
}

export function LandingPage({ theme, onStartDemo, onToggleTheme }: Props) {
  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="#top" aria-label="Sarthi home">
          <span className="landing-brand-mark" aria-hidden="true"><SarthiMark /></span>
          <span>Sarthi</span>
        </a>

        <nav className="landing-nav-links" aria-label="Landing page navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#proof-at-work">Proof at work</a>
          <a href="#for-sellers">For sellers</a>
        </nav>

        <div className="landing-nav-actions">
          <button className="landing-theme-toggle" type="button" onClick={onToggleTheme}>
            {theme === "light" ? "Dark" : "Light"} mode
          </button>
          <button className="landing-primary-nav" type="button" onClick={onStartDemo}>
            Shop with proof
          </button>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-copy">
            <p className="landing-kicker">Shopping should not feel like guesswork</p>
            <h1 id="landing-title">Buy the product you will actually keep.</h1>
            <p className="landing-hero-lede">
              Similar listings can hide very different sellers, sizes, offers, and proof. Sarthi brings those facts together before you pay—so your choice is based on evidence, not pressure.
            </p>
            <div className="landing-hero-actions">
              <button className="landing-cta landing-cta-primary" type="button" onClick={onStartDemo}>
                Shop with proof <span aria-hidden="true">→</span>
              </button>
              <a className="landing-cta landing-cta-secondary" href="#how-it-works">
                See how Sarthi decides
              </a>
            </div>
            <p className="landing-trust-note">
              Sarthi explains verified facts. It does not invent product claims or publish unreviewed seller proof.
            </p>
          </div>

          <div className="landing-hero-product" aria-label="A Sarthi product decision preview">
            <div className="landing-hero-photo-wrap">
              <img src={catalogImages.blueKurti} alt="Blue floral cotton kurti from the Sarthi catalog" onError={(event) => useFallbackImage(event, catalogFallbacks.blueKurti)} />
              <span className="landing-photo-label">Catalog choice</span>
            </div>
            <div className="landing-product-summary">
              <p className="landing-overline">Blue Floral Cotton Kurti</p>
              <div className="landing-price-line">
                <strong>₹429</strong>
                <span>Seller and variant checked together</span>
              </div>
              <div className="landing-proof-lines">
                <div><span className="proof-dot verified" /><p><strong>Seller record found</strong><small>Identity and dispatch history are part of the check.</small></p></div>
                <div><span className="proof-dot verified" /><p><strong>Fit guidance available</strong><small>Your saved fit can be compared with this variant.</small></p></div>
                <div><span className="proof-dot review" /><p><strong>Proof stays reviewable</strong><small>Open the source before you decide.</small></p></div>
              </div>
            </div>
            <div className="landing-question-chip">
              <span>Ask from verified facts</span>
              <strong>“Will XL give me a comfortable fit?”</strong>
            </div>
          </div>
        </section>

        <section className="landing-choice-story" aria-labelledby="choice-heading">
          <div className="landing-section-heading">
            <p className="landing-kicker">The problem Sarthi solves</p>
            <h2 id="choice-heading">One search. Many lookalikes. Very different reasons to trust.</h2>
            <p>A low price, a high rating, or a familiar photo is not the whole decision. Sarthi helps you see what changes from one listing to the next.</p>
          </div>

          <div className="landing-catalog-strip">
            <article className="landing-catalog-card">
              <img src={catalogImages.pinkKurti} alt="Pink printed straight kurti" onError={(event) => useFallbackImage(event, catalogFallbacks.pinkKurti)} />
              <div><span>₹379</span><strong>Lowest price</strong><small>Proof still needs checking</small></div>
            </article>
            <article className="landing-catalog-card featured">
              <span className="landing-choice-badge">Best-supported choice</span>
              <img src={catalogImages.maroonSet} alt="Maroon festive kurta set" onError={(event) => useFallbackImage(event, catalogFallbacks.maroonSet)} />
              <div><span>₹699</span><strong>More useful evidence</strong><small>Fit, seller, and proof in one view</small></div>
            </article>
            <article className="landing-catalog-card">
              <img src={catalogImages.cottonTop} alt="Solid cotton daily top" onError={(event) => useFallbackImage(event, catalogFallbacks.cottonTop)} />
              <div><span>₹329</span><strong>Fast delivery</strong><small>Check whether the variant fits</small></div>
            </article>
          </div>

          <div className="landing-choice-caption">
            <span>Not another score to decode.</span>
            <p>A clear comparison of what is known, what is missing, and what matters for this purchase.</p>
          </div>
        </section>

        <section className="landing-process" id="how-it-works" aria-labelledby="process-heading">
          <div className="landing-section-heading align-left">
            <p className="landing-kicker">A calmer path to checkout</p>
            <h2 id="process-heading">From “which one?” to “this is enough proof for me.”</h2>
          </div>
          <ol className="landing-process-list">
            <li>
              <span>01</span>
              <div><h3>Compare the real choices</h3><p>Group similar listings and compare price, seller, delivery, fit, and return signals without losing the product itself.</p></div>
            </li>
            <li>
              <span>02</span>
              <div><h3>Open the evidence</h3><p>See which claims have proof, where that proof came from, and which gaps still need an answer.</p></div>
            </li>
            <li>
              <span>03</span>
              <div><h3>Ask what matters to you</h3><p>Ask a normal shopping question. Sarthi answers from product, seller, proof, offer, and outcome records—not a guess.</p></div>
            </li>
            <li>
              <span>04</span>
              <div><h3>Buy only when it is enough</h3><p>Carry the chosen variant and its trust context into checkout. Your kept or returned outcome improves the next decision.</p></div>
            </li>
          </ol>
        </section>

        <section className="landing-proof-stage" id="proof-at-work" aria-labelledby="proof-heading">
          <div className="landing-proof-copy">
            <p className="landing-kicker">Sarthi Samvaad</p>
            <h2 id="proof-heading">Ask the product. Get an answer grounded in proof.</h2>
            <p>You should not need to understand a graph or hunt through reviews. Ask in plain language and inspect the evidence behind the answer whenever you want.</p>
            <ul>
              <li><strong>Plain answer first.</strong> The useful conclusion is never buried under system detail.</li>
              <li><strong>Sources stay attached.</strong> Product facts, seller submissions, reviewer checks, and past outcomes remain traceable.</li>
              <li><strong>Missing proof stays visible.</strong> Sarthi says when it does not have enough evidence.</li>
            </ul>
          </div>

          <div className="landing-proof-conversation">
            <div className="landing-buyer-question">
              <span>You asked</span>
              <p>“Is the fabric likely to feel thin in daylight?”</p>
            </div>
            <div className="landing-answer-card">
              <span className="landing-answer-label">Evidence-backed answer</span>
              <h3>Check the seller’s fabric proof before buying.</h3>
              <p>The answer is linked to the product variant and its submitted proof. If the proof is missing or still under review, Sarthi keeps that uncertainty visible.</p>
              <div className="landing-source-row">
                <span>Product facts</span><span>Seller proof</span><span>Review status</span>
              </div>
              <button type="button" onClick={onStartDemo}>See proof in the product <span aria-hidden="true">→</span></button>
            </div>
          </div>
        </section>

        <section className="landing-benefits" aria-labelledby="benefit-heading">
          <div className="landing-section-heading">
            <p className="landing-kicker">Useful at the moment of doubt</p>
            <h2 id="benefit-heading">Trust controls that feel like shopping tools.</h2>
          </div>
          <div className="landing-benefit-grid">
            <article className="landing-benefit-large">
              <p className="landing-overline">Fit memory</p>
              <h3>Your size label is not your fit.</h3>
              <p>Remember what fit worked for you, compare it with the exact variant, and keep personal details private from sellers.</p>
              <div className="landing-fit-scale" aria-label="Comfort fit example"><span>S</span><span>M</span><span>L</span><span className="selected">XL</span><span>XXL</span></div>
            </article>
            <article>
              <p className="landing-overline">Offer Sach Check</p>
              <h3>Price context without countdown pressure.</h3>
              <p>See the offer history and terms that can be verified before urgency decides for you.</p>
            </article>
            <article>
              <p className="landing-overline">Galti Mat Dohrao</p>
              <h3>Past outcomes become useful warnings.</h3>
              <p>A kept or returned order helps improve the next recommendation without exposing buyer personal data.</p>
            </article>
          </div>
        </section>

        <section className="landing-seller-bridge" id="for-sellers">
          <div className="landing-seller-image">
            <img src={catalogImages.saree} alt="Printed summer saree from a seller catalog" onError={(event) => useFallbackImage(event, catalogFallbacks.saree)} />
          </div>
          <div>
            <p className="landing-kicker">For responsible sellers</p>
            <h2>Better proof should make the better listing easier to choose.</h2>
            <p>Sellers get a focused workspace to fix evidence gaps, add product details, respond to proof requests, and understand how their listing compares—without seeing buyer personal data.</p>
            <button className="landing-text-link" type="button" onClick={onStartDemo}>Open seller access <span aria-hidden="true">→</span></button>
          </div>
        </section>

        <section className="landing-final-cta">
          <p className="landing-kicker">Your next order can start differently</p>
          <h2>Choose with proof. Checkout without second-guessing.</h2>
          <button className="landing-cta landing-cta-primary" type="button" onClick={onStartDemo}>Shop with proof <span aria-hidden="true">→</span></button>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand" href="#top"><span className="landing-brand-mark" aria-hidden="true"><SarthiMark /></span><span>Sarthi</span></a>
        <p>Buy the product you will actually keep.</p>
        <span>RuntimeTerrors · Meesho ScriptedByHer 2.0</span>
      </footer>
    </div>
  );
}
