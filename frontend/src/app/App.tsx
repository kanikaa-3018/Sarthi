import { useEffect, useState } from "react";
import { LogOut, Sun, Moon, RefreshCcw, User, Globe } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { clearStoredSession, getBuyerProofs, getMe, getStoredSession, logout, storeSession, resetSeed } from "../api/client";
import { AuthScreen } from "../screens/AuthScreen";
import { FeedScreen } from "../screens/FeedScreen";
import { CheckoutPage } from "../screens/CheckoutPage";
import { SellerPanel } from "../screens/SellerPanel";
import { AdminReviewPanel } from "../screens/AdminReviewPanel";
import { TrustCenter } from "../screens/TrustCenter";
import { SarthiMark } from "../components/SarthiMark";
import { LANGUAGE_OPTIONS, t, type LanguageCode } from "../i18n";
import type { AuthSession } from "../types/api";

const LANGUAGE_STORAGE_KEY = "sarthi.language";
const THEME_STORAGE_KEY = "sarthi.theme";

type BuyerProofNavSignal = {
  open: number;
  approved: number;
  label: string;
  badgeLabel: string;
  needsAttention: boolean;
};

type ResetSeedStatus = {
  tone: "working" | "success" | "error";
  message: string;
};

const SELLER_NAV_COPY: Record<LanguageCode, { console: string; proofs: string; coach: string }> = {
  english: {
    console: "Seller console",
    proofs: "Proof center",
    coach: "Trust coach"
  },
  hindi: {
    console: "सेलर कंसोल",
    proofs: "प्रूफ सेंटर",
    coach: "ट्रस्ट कोच"
  },
  hinglish: {
    console: "Seller ka console",
    proofs: "Proof center",
    coach: "Trust coach"
  }
};

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>(readStoredLanguage);
  const [buyerProofNav, setBuyerProofNav] = useState<BuyerProofNavSignal | null>(null);
  const [resetSeedStatus, setResetSeedStatus] = useState<ResetSeedStatus | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  
  const [theme, setTheme] = useState<"light" | "dark" | "system">(readStoredTheme);

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) {
      setCheckingSession(false);
      return;
    }

    getMe()
      .then((payload) => {
        const refreshed = { ...stored, account: payload.account };
        storeSession(refreshed);
        setSession(refreshed);
        const currentPath = window.location.pathname;
        if (currentPath === "/" || currentPath === "/login") {
          navigate(defaultPath(payload.account.role), { replace: true });
        }
      })
      .catch(() => {
        clearStoredSession();
        setSession(null);
      })
      .finally(() => setCheckingSession(false));
  }, [navigate]);

  // Update theme on documentElement
  useEffect(() => {
    const resolvedTheme =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  function handleAuthenticated(nextSession: AuthSession) {
    storeSession(nextSession);
    setSession(nextSession);
    navigate(defaultPath(nextSession.account.role), { replace: true });
  }

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (session?.account.role !== "buyer" || !session.account.buyer_id) {
      setBuyerProofNav(null);
      return;
    }
    let active = true;
    getBuyerProofs(session.account.buyer_id)
      .then((payload) => {
        if (!active) return;
        const open = payload.summary.waiting_seller + payload.summary.admin_review + payload.summary.needs_more_proof;
        const approved = payload.summary.approved;
        setBuyerProofNav({
          open,
          approved,
          label: open > 0
            ? `${open} need proof check`
            : approved > 0
              ? `${approved} ready`
              : "No saved proof yet",
          badgeLabel: open > 0
            ? String(open)
            : approved > 0
              ? String(approved)
              : "",
          needsAttention: open > 0
        });
      })
      .catch(() => {
        if (active) setBuyerProofNav(null);
      });
    return () => {
      active = false;
    };
  }, [session?.account.buyer_id, session?.account.role]);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    setSession(null);
    navigate("/login", { replace: true });
    setLoggingOut(false);
  }

  async function handleResetDatabase() {
    if (!confirm("Reset database to initial seed facts?")) {
      return;
    }

    setResetSeedStatus({ tone: "working", message: "Resetting facts..." });
    try {
      await resetSeed();
      setResetSeedStatus({ tone: "success", message: "Facts reset. Refreshing..." });
      window.setTimeout(() => window.location.reload(), 650);
    } catch (err) {
      setResetSeedStatus({
        tone: "error",
        message: err instanceof Error ? err.message : "Reset failed"
      });
    }
  }

  if (checkingSession) {
    return <div className="app-loading">Checking secure session...</div>;
  }

  const resolvedTheme =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  const role = session?.account.role;
  const buyerId = session?.account.buyer_id;
  const isCheckoutRoute = location.pathname.startsWith("/shop/checkout");
  const isAdminRoute = location.pathname.startsWith("/admin");
  const sellerNavCopy = SELLER_NAV_COPY[language] ?? SELLER_NAV_COPY.english;
  const sellerNavActive = (path: string) => {
    const normalizedPath = location.pathname.replace(/\/$/, "") || "/";
    return path === "/seller"
      ? normalizedPath === "/seller"
      : normalizedPath === path || normalizedPath.startsWith(`${path}/`);
  };
  const adminNavActive = (path: string) => {
    const normalizedPath = location.pathname.replace(/\/$/, "") || "/";
    return path === "/admin"
      ? normalizedPath === "/admin"
      : normalizedPath === path || normalizedPath.startsWith(`${path}/`);
  };
  const isReviewDeskActive = () => {
    const p = location.pathname;
    return p === "/admin" || p.startsWith("/admin/uploads") || p.startsWith("/admin/drafts") || p.startsWith("/admin/audit");
  };

  return (
    <div className={`web-app-container${isCheckoutRoute ? " checkout-app-route" : ""}${isAdminRoute ? " admin-app-route" : ""}`}>
      <header className="web-header commerce-header">
        <div className="web-header-container commerce-header-container">
          <button
            className="web-brand-lockup commerce-brand"
            type="button"
            onClick={() => session ? navigate(defaultPath(session.account.role)) : navigate("/login")}
          >
            <div className="web-brand-badge" aria-hidden="true">
              <SarthiMark />
            </div>
            <div className="commerce-brand-copy">
              <span className="web-brand-title">Sarthi</span>
              <span className="web-brand-subtitle">Shop with proof</span>
            </div>
          </button>

          {session && (
            <>
              <nav className="commerce-nav" aria-label="Primary navigation">
                {role === "buyer" && (
                  <>
                    <button
                      type="button"
                      className={location.pathname === "/shop" || location.pathname.startsWith("/shop/product") || location.pathname.startsWith("/shop/saved") || location.pathname.startsWith("/shop/checkout") ? "active" : ""}
                      onClick={() => navigate("/shop")}
                    >
                      <span>{t(language, "shop")}</span>
                    </button>
                    <button
                      type="button"
                      className={location.pathname.startsWith("/trust") ? "active" : ""}
                      onClick={() => navigate("/trust")}
                    >
                      <span>{t(language, "trust")}</span>
                    </button>
                    <button
                      type="button"
                      className={location.pathname.startsWith("/shop/wishlist") ? "active" : ""}
                      onClick={() => navigate("/shop/wishlist")}
                    >
                      <span>{t(language, "saved")}</span>
                    </button>
                    <button
                      type="button"
                      className={location.pathname.startsWith("/shop/orders") ? "active" : ""}
                      onClick={() => navigate("/shop/orders")}
                    >
                      <span>{t(language, "orders")}</span>
                    </button>
                    <button
                      type="button"
                      className={`proof-nav-item ${location.pathname.startsWith("/shop/proofs") ? "active" : ""}`}
                      onClick={() => navigate("/shop/proofs")}
                      aria-label={buyerProofNav ? `Proof, ${buyerProofNav.label}` : "Proof"}
                      title={buyerProofNav ? `Proof: ${buyerProofNav.label}` : "Proof"}
                    >
                      <span className="proof-nav-label">Proof</span>
                      {buyerProofNav?.badgeLabel && (
                        <em className={`nav-proof-badge ${buyerProofNav.needsAttention ? "attention" : "ready"}`}>
                          {buyerProofNav.badgeLabel}
                        </em>
                      )}
                    </button>
                  </>
                )}
                {role === "seller" && (
                  <>
                    <button
                      type="button"
                      className={sellerNavActive("/seller") ? "active" : ""}
                      onClick={() => navigate("/seller")}
                    >
                      <span>{sellerNavCopy.console}</span>
                    </button>
                    <button
                      type="button"
                      className={`seller-proof-nav-item ${sellerNavActive("/seller/proofs") ? "active" : ""}`}
                      onClick={() => navigate("/seller/proofs")}
                    >
                      <span>{sellerNavCopy.proofs}</span>
                    </button>
                    <button
                      type="button"
                      className={
                        sellerNavActive("/seller/trust-coach") ||
                        sellerNavActive("/seller/copilot") ||
                        sellerNavActive("/seller/autopilot") ||
                        sellerNavActive("/seller/listing-lab") ||
                        sellerNavActive("/seller/rating-forecast")
                          ? "active"
                          : ""
                      }
                      onClick={() => navigate("/seller/trust-coach")}
                    >
                      <span>{sellerNavCopy.coach}</span>
                    </button>
                  </>
                )}
                {role === "admin" && (
                  <>
                    <button
                      type="button"
                      className={`admin-nav-item ${isReviewDeskActive() ? "active" : ""}`}
                      onClick={() => navigate("/admin")}
                    >
                      <span>Review Desk</span>
                    </button>
                    <button
                      type="button"
                      className={`admin-nav-item agent ${location.pathname.startsWith("/admin/agent") ? "active" : ""}`}
                      onClick={() => navigate("/admin/agent")}
                    >
                      <span>AI Triage</span>
                    </button>
                    <button
                      type="button"
                      className={`admin-nav-item ${location.pathname.startsWith("/admin/policy") ? "active" : ""}`}
                      onClick={() => navigate("/admin/policy")}
                    >
                      <span>Risk & Policy</span>
                    </button>
                    <button
                      type="button"
                      className={`admin-nav-item ${location.pathname.startsWith("/admin/impact") ? "active" : ""}`}
                      onClick={() => navigate("/admin/impact")}
                    >
                      <span>Work Saved</span>
                    </button>
                  </>
                )}
              </nav>

              <div className="web-header-actions commerce-actions">

              {/* Reset database helper */}
              {role === "admin" && (
                <>
                  <button
                    className="web-header-btn commerce-icon-btn"
                    type="button"
                    onClick={handleResetDatabase}
                    disabled={resetSeedStatus?.tone === "working"}
                    title="Reset database"
                  >
                    <RefreshCcw size={14} />
                    <span className="hide-on-mobile">Reset Facts</span>
                  </button>
                  {resetSeedStatus && (
                    <span
                      className={`reset-seed-status ${resetSeedStatus.tone}`}
                      role={resetSeedStatus.tone === "error" ? "alert" : "status"}
                    >
                      {resetSeedStatus.message}
                    </span>
                  )}
                </>
              )}

              {/* Language Switcher */}
              <label className="web-header-select commerce-select" aria-label="Choose language">
                <Globe size={14} />
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                >
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.code} value={opt.code}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>

              {/* Dark/Light mode toggle */}
              <button
                className="web-header-btn commerce-icon-btn"
                type="button"
                onClick={() => setTheme(resolvedTheme === "light" ? "dark" : "light")}
                title="Toggle Theme"
              >
                {resolvedTheme === "light" ? <Moon size={15} /> : <Sun size={15} />}
              </button>

              {/* User Identity Chip */}
              <div className="web-user-menu commerce-account">
                <User size={14} />
                <span className="commerce-account-name">
                  <strong>{session.account.display_name}</strong>
                  <small>{role}</small>
                </span>
                <button
                  className="web-logout-btn"
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  title="Logout"
                >
                  <LogOut size={15} />
                </button>
              </div>
            </div>
            </>
          )}
        </div>
      </header>

      {/* Main Responsive Page View Container */}
      <main className="web-content-container">
        <Routes>
          <Route
            path="/login"
            element={
              session ? (
                <Navigate to={defaultPath(session.account.role)} replace />
              ) : (
                <AuthScreen
                  language={language}
                  onLanguageChange={setLanguage}
                  onAuthenticated={handleAuthenticated}
                />
              )
            }
          />
          {["/shop", "/shop/wishlist", "/shop/orders", "/shop/proofs", "/shop/product/:productId", "/shop/saved/:productId"].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                role === "buyer" && buyerId ? (
                  <FeedScreen
                    buyerId={buyerId}
                    ready={true}
                    language={language}
                    experienceMode="simple"
                  />
                ) : (
                  <RoleRedirect session={session} />
                )
              }
            />
          ))}
          <Route
            path="/shop/checkout/:productId/:variantId"
            element={
              role === "buyer" && buyerId ? (
                <CheckoutPage
                  buyerId={buyerId}
                  language={language}
                />
              ) : (
                <RoleRedirect session={session} />
              )
            }
          />
          <Route path="/shop/*" element={<Navigate to="/shop" replace />} />
          <Route
            path="/trust/*"
            element={role === "buyer" && buyerId ? <TrustCenter buyerId={buyerId} language={language} /> : <RoleRedirect session={session} />}
          />
          <Route
            path="/seller/*"
            element={role === "seller" ? <SellerPanel language={language} /> : <RoleRedirect session={session} />}
          />
          <Route
            path="/admin/*"
            element={role === "admin" ? <AdminReviewPanel /> : <RoleRedirect session={session} />}
          />
          <Route path="/" element={<RoleRedirect session={session} />} />
          <Route path="*" element={<RoleRedirect session={session} />} />
        </Routes>
      </main>
    </div>
  );
}

function RoleRedirect({ session }: { session: AuthSession | null }) {
  return <Navigate to={session ? defaultPath(session.account.role) : "/login"} replace />;
}

function defaultPath(role: AuthSession["account"]["role"]) {
  if (role === "seller") return "/seller";
  if (role === "admin") return "/admin";
  return "/shop";
}

function readStoredLanguage(): LanguageCode {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return LANGUAGE_OPTIONS.some((option) => option.code === stored) ? (stored as LanguageCode) : "english";
}

function readStoredTheme(): "light" | "dark" | "system" {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "dark" || stored === "system" ? stored : "light";
}
