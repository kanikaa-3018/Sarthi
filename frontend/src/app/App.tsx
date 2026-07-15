import { useEffect, useState } from "react";
import { LogOut, ShieldCheck, Sun, Moon, RefreshCcw, User, Globe, Store, ClipboardCheck } from "lucide-react";
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
type AppView = "buyer" | "trust" | "seller" | "admin";

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [view, setView] = useState<AppView>("buyer");
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>(readStoredLanguage);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>(readStoredExperienceMode);
  
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
        setView(defaultView(payload.account.role));
      })
      .catch(() => {
        clearStoredSession();
        setSession(null);
      })
      .finally(() => setCheckingSession(false));
  }, []);

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
    setView(defaultView(nextSession.account.role));
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
    setView("buyer");
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
            onClick={() => session && setView(defaultView(session.account.role))}
          >
            <div className="web-brand-badge">S</div>
            <div className="commerce-brand-copy">
              <span className="web-brand-title">Sarthi</span>
              <span className="web-brand-subtitle">Truth-first shopping</span>
            </div>
          </button>

          {session && (
            <>
              <nav className="commerce-nav" aria-label="Primary navigation">
                {role === "buyer" && (
                  <>
                    <button
                      type="button"
                      className={view === "buyer" ? "active" : ""}
                      onClick={() => setView("buyer")}
                    >
                      <Store size={14} />
                      <span>{t(language, "shop")}</span>
                    </button>
                    <button
                      type="button"
                      className={view === "trust" ? "active" : ""}
                      onClick={() => setView("trust")}
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
        {!session ? (
          <AuthScreen
            language={language}
            onLanguageChange={setLanguage}
            onAuthenticated={handleAuthenticated}
          />
        ) : role === "buyer" && view === "buyer" && buyerId ? (
          <FeedScreen
            buyerId={buyerId}
            ready={true}
            language={language}
            experienceMode={experienceMode}
          />
        ) : role === "buyer" && view === "trust" && buyerId ? (
          <TrustCenter buyerId={buyerId} />
        ) : role === "seller" ? (
          <SellerPanel />
        ) : role === "admin" ? (
          <AdminReviewPanel />
        ) : (
          <div className="app-loading">This account is missing a valid workspace.</div>
        )}
      </main>
    </div>
  );
}

function defaultView(role: AuthSession["account"]["role"]): AppView {
  if (role === "seller") return "seller";
  if (role === "admin") return "admin";
  return "buyer";
}

function readStoredLanguage(): LanguageCode {
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return LANGUAGE_OPTIONS.some((option) => option.code === stored) ? (stored as LanguageCode) : "hinglish";
}

function readStoredExperienceMode(): ExperienceMode {
  return window.localStorage.getItem(EXPERIENCE_MODE_STORAGE_KEY) === "simple" ? "simple" : "standard";
}
