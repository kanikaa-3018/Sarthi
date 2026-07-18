import { useEffect, useState } from "react";
import { LogOut, ShieldCheck, Sun, Moon, RefreshCcw, User, Globe, Store, ClipboardCheck } from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { clearStoredSession, getMe, getStoredSession, logout, storeSession, resetSeed } from "../api/client";
import { AuthScreen } from "../screens/AuthScreen";
import { FeedScreen } from "../screens/FeedScreen";
import { SellerPanel } from "../screens/SellerPanel";
import { AdminReviewPanel } from "../screens/AdminReviewPanel";
import { TrustCenter } from "../screens/TrustCenter";
import { LANGUAGE_OPTIONS, t, type ExperienceMode, type LanguageCode } from "../i18n";
import type { AuthSession } from "../types/api";

const LANGUAGE_STORAGE_KEY = "sarthi.language";
const EXPERIENCE_MODE_STORAGE_KEY = "sarthi.experienceMode";

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>(readStoredLanguage);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>(readStoredExperienceMode);
  const location = useLocation();
  const navigate = useNavigate();
  
  // Theme state: light or dark
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

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
        if (location.pathname === "/" || location.pathname === "/login") {
          navigate(defaultPath(payload.account.role), { replace: true });
        }
      })
      .catch(() => {
        clearStoredSession();
        setSession(null);
      })
      .finally(() => setCheckingSession(false));
  }, [location.pathname, navigate]);

  // Update theme on documentElement
  useEffect(() => {
    const resolvedTheme =
      theme === "system"
        ? window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light"
        : theme;
    document.documentElement.setAttribute("data-theme", resolvedTheme);
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
    window.localStorage.setItem(EXPERIENCE_MODE_STORAGE_KEY, experienceMode);
  }, [experienceMode]);

  async function handleLogout() {
    setLoggingOut(true);
    await logout();
    setSession(null);
    navigate("/login", { replace: true });
    setLoggingOut(false);
  }

  async function handleResetDatabase() {
    if (confirm("Reset database to initial seed facts?")) {
      try {
        await resetSeed();
        alert("Database successfully reset!");
        window.location.reload();
      } catch (err) {
        alert("Failed to reset database: " + (err instanceof Error ? err.message : String(err)));
      }
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

  return (
    <div className="web-app-container">
      <header className="web-header commerce-header">
        <div className="web-header-container commerce-header-container">
          <button
            className="web-brand-lockup commerce-brand"
            type="button"
            onClick={() => session ? navigate(defaultPath(session.account.role)) : navigate("/login")}
          >
            <div className="web-brand-badge">S</div>
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
                      className={location.pathname.startsWith("/shop") ? "active" : ""}
                      onClick={() => navigate("/shop")}
                    >
                      <Store size={14} />
                      <span>{t(language, "shop")}</span>
                    </button>
                    <button
                      type="button"
                      className={location.pathname.startsWith("/trust") ? "active" : ""}
                      onClick={() => navigate("/trust")}
                    >
                      <ShieldCheck size={14} />
                      <span>{t(language, "trust")}</span>
                    </button>
                  </>
                )}
                {role === "seller" && (
                  <span className="commerce-role-lock">
                    <Store size={14} />
                    {t(language, "sellerConsole")}
                  </span>
                )}
                {role === "admin" && (
                  <span className="commerce-role-lock">
                    <ClipboardCheck size={14} />
                    {t(language, "reviewQueue")}
                  </span>
                )}
              </nav>

              <div className="web-header-actions commerce-actions">

              {/* Reset database helper */}
              {role === "admin" && (
                <button
                  className="web-header-btn commerce-icon-btn"
                  type="button"
                  onClick={handleResetDatabase}
                  title="Reset database"
                >
                  <RefreshCcw size={14} />
                  <span className="hide-on-mobile">Reset Facts</span>
                </button>
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

              {role === "buyer" && (
                <button
                  className="web-header-btn commerce-mode-btn"
                  type="button"
                  onClick={() => setExperienceMode(experienceMode === "simple" ? "standard" : "simple")}
                  aria-pressed={experienceMode === "simple"}
                >
                  <ShieldCheck size={14} />
                  <span className="hide-on-mobile">
                    {experienceMode === "simple" ? t(language, "standardMode") : t(language, "simpleMode")}
                  </span>
                  <span className="show-on-mobile">{experienceMode === "simple" ? "Detailed" : "Simple"}</span>
                </button>
              )}

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
          {["/shop", "/shop/product/:productId", "/shop/saved/:productId"].map((path) => (
            <Route
              key={path}
              path={path}
              element={
                role === "buyer" && buyerId ? (
                  <FeedScreen
                    buyerId={buyerId}
                    ready={true}
                    language={language}
                    experienceMode={experienceMode}
                  />
                ) : (
                  <RoleRedirect session={session} />
                )
              }
            />
          ))}
          <Route path="/shop/*" element={<Navigate to="/shop" replace />} />
          <Route
            path="/trust/*"
            element={role === "buyer" && buyerId ? <TrustCenter buyerId={buyerId} /> : <RoleRedirect session={session} />}
          />
          <Route
            path="/seller/*"
            element={role === "seller" ? <SellerPanel /> : <RoleRedirect session={session} />}
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
  return LANGUAGE_OPTIONS.some((option) => option.code === stored) ? (stored as LanguageCode) : "hinglish";
}

function readStoredExperienceMode(): ExperienceMode {
  return window.localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY) === "standard" ? "standard" : "simple";
}
