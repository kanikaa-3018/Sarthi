import { useEffect, useState } from "react";
import { LockKeyhole, ShieldCheck, Store, UserRound } from "lucide-react";
import { login, signupBuyer, signupSeller, storeSession } from "../api/client";
import { LANGUAGE_OPTIONS, type LanguageCode } from "../i18n";
import type { AuthSession } from "../types/api";

type Props = {
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void;
  onAuthenticated: (session: AuthSession) => void;
};

type LoginMode = "buyer" | "seller" | "admin";
type AuthFlow = "signin" | "signup";

export function AuthScreen({ language, onLanguageChange, onAuthenticated }: Props) {
  const [mode, setMode] = useState<LoginMode>("buyer");
  const [flow, setFlow] = useState<AuthFlow>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [signupLanguage, setSignupLanguage] = useState<LanguageCode>(language);
  const [businessName, setBusinessName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [pickupPincode, setPickupPincode] = useState("");
  const [supportContact, setSupportContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setSignupLanguage(language);
  }, [language]);

  async function submit() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      let session: AuthSession;
      if (flow === "signin") {
        session = await login(username.trim(), password);
      } else if (mode === "buyer") {
        session = await signupBuyer({
          username: username.trim(),
          password,
          display_name: displayName.trim(),
          language: signupLanguage
        });
      } else if (mode === "seller") {
        const sellerSession = await signupSeller({
          username: username.trim(),
          password,
          business_name: businessName.trim(),
          gst_number: gstNumber.trim(),
          pickup_pincode: pickupPincode.trim(),
          support_contact: supportContact.trim()
        });
        session = sellerSession;
        setSuccess("Seller application saved. Your account is pending verification.");
      } else {
        throw new Error("Admin accounts cannot be created from public signup.");
      }
      if (session.account.role !== mode) {
        setError(`This account is registered as ${session.account.role}. Choose the matching login path.`);
        return;
      }
      storeSession(session);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="auth-brand">
          <div className="brand-badge">S</div>
          <div>
            <span className="brand-name">Sarthi</span>
            <p>Truth-first commerce confidence for buyers and verified marketplace sellers.</p>
          </div>
        </div>

        <div className="auth-flow-tabs" aria-label="Authentication mode">
          <button className={flow === "signin" ? "active" : ""} onClick={() => setFlow("signin")}>
            Sign in
          </button>
          <button
            className={flow === "signup" ? "active" : ""}
            onClick={() => {
              setFlow("signup");
              if (mode === "admin") setMode("buyer");
            }}
          >
            Create account
          </button>
        </div>

        <div className="auth-mode-grid">
          <button className={mode === "buyer" ? "active" : ""} onClick={() => setMode("buyer")}>
            <UserRound size={18} />
            <strong>{flow === "signin" ? "Buyer login" : "Buyer signup"}</strong>
            <span>Create or access your private fit memory and shopping trust center.</span>
          </button>
          <button className={mode === "seller" ? "active" : ""} onClick={() => setMode("seller")}>
            <Store size={18} />
            <strong>{flow === "signin" ? "Seller login" : "Seller application"}</strong>
            <span>Seller accounts require business verification before trust eligibility.</span>
          </button>
          {flow === "signin" && (
            <button className={mode === "admin" ? "active" : ""} onClick={() => setMode("admin")}>
              <ShieldCheck size={18} />
              <strong>Reviewer login</strong>
              <span>Admin review accounts approve sellers and publish eligible listings.</span>
            </button>
          )}
        </div>

        <div className="auth-form-card">
          <div className="auth-form-header">
            <LockKeyhole size={18} />
            <div>
              <h2>
                {flow === "signin"
                  ? mode === "buyer"
                    ? "Sign in as buyer"
                    : mode === "seller"
                      ? "Sign in as registered seller"
                      : "Sign in as reviewer"
                  : mode === "buyer"
                    ? "Create buyer account"
                    : "Apply for seller access"}
              </h2>
              <p>
                {flow === "signup" && mode === "seller"
                  ? "We create a pending seller profile. Verification must clear before buyer-facing trust improves."
                  : mode === "buyer"
                  ? "Your fit memory and privacy settings stay bound to your buyer account."
                  : mode === "seller"
                    ? "Seller access is limited to the seller account mapped by the marketplace."
                    : "Reviewer access is restricted to seeded admin accounts and cannot be self-created."}
              </p>
            </div>
          </div>

          <label className="auth-field">
            <span>Username</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
          </label>

          {flow === "signup" && mode === "buyer" && (
            <>
              <label className="auth-field">
                <span>Display name</span>
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" />
              </label>

              <label className="auth-field">
                <span>Preferred language</span>
                <select
                  value={signupLanguage}
                  onChange={(event) => {
                    const nextLanguage = event.target.value as LanguageCode;
                    setSignupLanguage(nextLanguage);
                    onLanguageChange(nextLanguage);
                  }}
                >
                  {LANGUAGE_OPTIONS.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {flow === "signup" && mode === "seller" && (
            <>
              <label className="auth-field">
                <span>Business name</span>
                <input value={businessName} onChange={(event) => setBusinessName(event.target.value)} autoComplete="organization" />
              </label>

              <label className="auth-field">
                <span>GST / registration number</span>
                <input value={gstNumber} onChange={(event) => setGstNumber(event.target.value)} />
              </label>

              <label className="auth-field">
                <span>Pickup pincode</span>
                <input value={pickupPincode} onChange={(event) => setPickupPincode(event.target.value)} inputMode="numeric" />
              </label>

              <label className="auth-field">
                <span>Support contact</span>
                <input value={supportContact} onChange={(event) => setSupportContact(event.target.value)} autoComplete="email" />
              </label>
            </>
          )}

          <label className="auth-field">
            <span>Password</span>
            <input
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="current-password"
            />
          </label>

          {error && <div className="notice error">{error}</div>}
          {success && <div className="notice success">{success}</div>}

          <button className="btn-buy-cod" onClick={submit} disabled={loading || !canSubmit()}>
            <ShieldCheck size={16} />
            {loading ? "Checking account..." : flow === "signin" ? "Continue securely" : mode === "buyer" ? "Create buyer account" : "Submit seller application"}
          </button>
        </div>
      </section>

      <section className="auth-context">
        <span className="eyebrow">Access boundary</span>
        <h1>Buyer and seller data are separated by role and ownership.</h1>
        <div className="auth-context-list">
          <div>
            <strong>Buyers</strong>
            <p>Can see their own memory, recommendations, order outcomes, offer checks, and audit traces.</p>
          </div>
          <div>
            <strong>Sellers</strong>
            <p>Can see only aggregate listing evidence for their registered seller account.</p>
          </div>
          <div>
            <strong>Protected by default</strong>
            <p>Unauthenticated requests and cross-account access are rejected by the backend.</p>
          </div>
        </div>
      </section>
    </main>
  );

  function canSubmit() {
    if (!username.trim() || password.length < 10 || !/[a-z]/i.test(password) || !/\d/.test(password)) return false;
    if (flow === "signin") return true;
    if (mode === "buyer") return !!displayName.trim();
    if (mode === "admin") return false;
    return !!businessName.trim() && !!gstNumber.trim() && pickupPincode.trim().length === 6 && !!supportContact.trim();
  }
}
