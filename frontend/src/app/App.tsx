import { useEffect, useState } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
import { clearStoredSession, getMe, getStoredSession, logout, storeSession } from "../api/client";
import { AdminReviewPanel } from "../screens/AdminReviewPanel";
import { AuthScreen } from "../screens/AuthScreen";
import { FeedScreen } from "../screens/FeedScreen";
import { SellerPanel } from "../screens/SellerPanel";
import { TrustCenter } from "../screens/TrustCenter";
import { LANGUAGE_OPTIONS, t, type ExperienceMode, type LanguageCode } from "../i18n";
import type { AuthSession } from "../types/api";

type AppView = "buyer" | "seller" | "trust" | "admin";
const LANGUAGE_STORAGE_KEY = "sarthi.language";
const EXPERIENCE_MODE_STORAGE_KEY = "sarthi.experienceMode";

export function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [view, setView] = useState<AppView>("buyer");
  const [checkingSession, setCheckingSession] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>(readStoredLanguage);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>(readStoredExperienceMode);

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

  function handleAuthenticated(nextSession: AuthSession) {
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

  if (checkingSession) {
    return <div className="app-loading">Checking secure session...</div>;
  }

  if (!session) {
    return (
      <AuthScreen
        language={language}
        onLanguageChange={setLanguage}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  const account = session.account;
  const isBuyer = account.role === "buyer";
  const isSeller = account.role === "seller";
  const isAdmin = account.role === "admin";
  const buyerId = account.buyer_id ?? "";

  return (
    <div>
      <header className="app-header">
        <div className="header-container">
          <div className="brand-lockup">
            <div className="brand-badge">S</div>
            <div className="brand-title-group">
              <span className="brand-name">Sarthi</span>
              <span className="brand-tagline">Truth-first commerce confidence</span>
            </div>
          </div>

          <div className="header-controls">
            <div className="accessibility-controls" aria-label="Language and reading mode controls">
              <label className="language-control">
                <span className="sr-only">{t(language, "language")}</span>
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value as LanguageCode)}
                  aria-label={t(language, "language")}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="mode-toggle"
                type="button"
                onClick={() => setExperienceMode(experienceMode === "simple" ? "standard" : "simple")}
                aria-pressed={experienceMode === "simple"}
              >
                {experienceMode === "simple" ? t(language, "standardMode") : t(language, "simpleMode")}
              </button>
            </div>

            <div className="workspace-switcher" aria-label="Authenticated workspace">
              {isBuyer ? (
                <>
                  <button className={view === "buyer" ? "active" : ""} onClick={() => setView("buyer")}>
                    {t(language, "shop")}
                  </button>
                  <button className={view === "trust" ? "active" : ""} onClick={() => setView("trust")}>
                    {t(language, "trust")}
                  </button>
                </>
              ) : isSeller ? (
                <button className="active" onClick={() => setView("seller")}>
                  {t(language, "sellerConsole")}
                </button>
              ) : (
                <button className="active" onClick={() => setView("admin")}>
                  {t(language, "reviewQueue")}
                </button>
              )}
            </div>

            <div className="account-chip">
              <ShieldCheck size={14} />
              <span>{account.display_name}</span>
              <strong>{account.role}</strong>
            </div>

            <button className="btn-reset-db" onClick={handleLogout} title="Sign out" disabled={loggingOut}>
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {isBuyer && view === "buyer" && (
        <FeedScreen
          buyerId={buyerId}
          onBuyerChange={() => undefined}
          ready={true}
          language={language}
          experienceMode={experienceMode}
        />
      )}
      {isBuyer && view === "trust" && <TrustCenter buyerId={buyerId} />}
      {isSeller && view === "seller" && <SellerPanel />}
      {isAdmin && view === "admin" && <AdminReviewPanel />}
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
