import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, ShoppingBag, Store, ShieldCheck } from "lucide-react";
import { login, signupBuyer, signupSeller } from "../api/client";
import { SarthiMark } from "../components/SarthiMark";
import { DEMO_ACCOUNTS, type AuthPortal } from "../demoAccounts";
import { LANGUAGE_OPTIONS, type LanguageCode } from "../i18n";
import type { AuthAccount, AuthSession } from "../types/api";

type Props = {
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void;
  onAuthenticated: (session: AuthSession) => void;
};

type AuthFlow = "signin" | "signup";
type PortalRole = AuthAccount["role"];

const PORTAL_COPY: Record<AuthPortal, {
  title: string;
  shortLabel: string;
  description: string;
  lockText: string;
  action: string;
  icon: React.ReactNode;
}> = {
  buyer: {
    title: "Buyer workspace",
    shortLabel: "Buyer",
    description: "Compare listings, check size and offer truth before checkout.",
    lockText: "Private fit memory",
    action: "Continue shopping",
    icon: <ShoppingBag size={18} />
  },
  seller: {
    title: "Seller portal",
    shortLabel: "Seller",
    description: "Submit proof, track drafts and improve listing readiness.",
    lockText: "Aggregate evidence only",
    action: "Open seller console",
    icon: <Store size={18} />
  },
  reviewer: {
    title: "Reviewer queue",
    shortLabel: "Reviewer",
    description: "Review seller applications, proof and listing approvals.",
    lockText: "Admin access only",
    action: "Open review desk",
    icon: <ShieldCheck size={18} />
  }
};

export function AuthScreen({ language, onLanguageChange, onAuthenticated }: Props) {
  const [portal, setPortal] = useState<AuthPortal>("buyer");
  const [flow, setFlow] = useState<AuthFlow>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [buyerLang, setBuyerLang] = useState<LanguageCode>(language);
  const [businessName, setBusinessName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [pickupPincode, setPickupPincode] = useState("");
  const [supportContact, setSupportContact] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const activeCopy = PORTAL_COPY[portal];
  const demo = DEMO_ACCOUNTS[portal];
  const expectedRole = portalToRole(portal);
  const isSignupAvailable = portal !== "reviewer";

  const canSubmit = useMemo(() => {
    if (flow === "signin") return username.trim().length > 0 && password.trim().length > 0;
    if (portal === "buyer") {
      return Boolean(username.trim() && password.trim() && displayName.trim());
    }
    if (portal === "seller") {
      return Boolean(
        username.trim() &&
        password.trim() &&
        businessName.trim() &&
        gstNumber.trim() &&
        pickupPincode.trim() &&
        supportContact.trim()
      );
    }
    return false;
  }, [businessName, displayName, flow, gstNumber, password, pickupPincode, portal, supportContact, username]);

  function selectPortal(nextPortal: AuthPortal) {
    setPortal(nextPortal);
    setFlow("signin");
    setError(null);
    setSuccess(null);
    setShowPassword(false);
  }

  function useDemoCredentials() {
    setUsername(demo.username);
    setPassword(demo.password);
    setError(null);
    setSuccess(null);
  }

  async function handleSignin(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const session = await login(username.trim(), password);
      if (session.account.role !== expectedRole) {
        throw new Error(`This is a ${session.account.role} account. Open the correct Sarthi portal.`);
      }
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      if (portal === "buyer") {
        const session = await signupBuyer({
          username: username.trim(),
          password,
          display_name: displayName.trim(),
          language: buyerLang
        });
        onLanguageChange(buyerLang);
        onAuthenticated(session);
        return;
      }

      if (portal === "seller") {
        const session = await signupSeller({
          username: username.trim(),
          password,
          business_name: businessName.trim(),
          gst_number: gstNumber.trim(),
          pickup_pincode: pickupPincode.trim(),
          support_contact: supportContact.trim()
        });
        setSuccess(
          `Seller application ${session.application.application_id} submitted. A reviewer must approve the store before buyer recommendations can trust it.`
        );
        setFlow("signin");
        setUsername("");
        setPassword("");
        setBusinessName("");
        setGstNumber("");
        setPickupPincode("");
        setSupportContact("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mobile-auth-container auth-entry-shell">
      <div className="auth-entry-layout">
        <aside className="auth-story-panel" aria-label="Sarthi product summary">
          <div className="auth-story-brand">
            <div className="brand-logo-badge auth-logo-mark">
              <SarthiMark />
            </div>
            <div>
              <strong>Sarthi</strong>
              <span>Commerce trust OS</span>
            </div>
          </div>
          <h2>One login. Three clean workspaces.</h2>
          <p>
            Buyers get proof before checkout, sellers get evidence tasks and reviewers keep seller claims under control.
          </p>
          <div className="auth-story-checks" aria-label="Trust workflow">
            <span><span className="auth-story-dot" aria-hidden="true" /> Buyer decisions stay evidence-backed</span>
            <span><span className="auth-story-dot" aria-hidden="true" /> Seller proof never exposes private memory</span>
            <span><span className="auth-story-dot" aria-hidden="true" /> Reviewer approval gates public trust</span>
          </div>
        </aside>

        <div className="mobile-auth-card auth-entry-card">
          <div className="auth-brand-lockup auth-card-heading">
            <div>
              <span className="eyebrow">Secure entry</span>
              <h1 className="brand-logo-text">{flow === "signin" ? "Sign in" : portal === "seller" ? "Seller application" : "Create buyer account"}</h1>
              <span className="brand-logo-sub">{activeCopy.description}</span>
            </div>
          </div>

          <div className="auth-portal-grid" aria-label="Choose Sarthi portal">
            <PortalButton
              portal="buyer"
              active={portal === "buyer"}
              title={PORTAL_COPY.buyer.shortLabel}
              description={PORTAL_COPY.buyer.lockText}
              icon={PORTAL_COPY.buyer.icon}
              onClick={selectPortal}
            />
            <PortalButton
              portal="seller"
              active={portal === "seller"}
              title={PORTAL_COPY.seller.shortLabel}
              description={PORTAL_COPY.seller.lockText}
              icon={PORTAL_COPY.seller.icon}
              onClick={selectPortal}
            />
            <PortalButton
              portal="reviewer"
              active={portal === "reviewer"}
              title={PORTAL_COPY.reviewer.shortLabel}
              description={PORTAL_COPY.reviewer.lockText}
              icon={PORTAL_COPY.reviewer.icon}
              onClick={selectPortal}
            />
          </div>

          {success && (
            <div className="auth-success-banner">
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}
          {error && <div className="auth-error-banner">{error}</div>}

          <div className={`auth-tab-group ${isSignupAvailable ? "" : "single"}`}>
            <button
              type="button"
              className={`auth-tab-btn ${flow === "signin" ? "active" : ""}`}
              onClick={() => {
                setFlow("signin");
                setError(null);
                setSuccess(null);
              }}
            >
              Sign in
            </button>
            {isSignupAvailable && (
              <button
                type="button"
                className={`auth-tab-btn ${flow === "signup" ? "active" : ""}`}
                onClick={() => {
                  setFlow("signup");
                  setError(null);
                  setSuccess(null);
                }}
              >
                {portal === "seller" ? "Apply" : "Create"}
              </button>
            )}
          </div>

          <form onSubmit={flow === "signin" ? handleSignin : handleSignup} className="auth-form-step">
            {flow === "signin" && (
              <div className="demo-credential-box">
                <div>
                  <strong>{demo.label}</strong>
                  <span>{demo.username}</span>
                </div>
                <button type="button" onClick={useDemoCredentials}>
                  Use demo
                </button>
              </div>
            )}

            <div className="auth-input-group">
              <label htmlFor="auth-username">{portal === "buyer" ? "Mobile or username" : "Username"}</label>
              <input
                id="auth-username"
                type="text"
                placeholder={flow === "signin" ? demo.username : "Create a unique username"}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                disabled={loading}
                required
              />
            </div>

            <div className="auth-input-group">
              <label htmlFor="auth-password">Password</label>
              <div className="auth-password-control">
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  placeholder={flow === "signin" ? "Enter password" : "Minimum 8 characters"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={flow === "signin" ? "current-password" : "new-password"}
                  disabled={loading}
                  required
                />
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)} disabled={loading}>
                  {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                </button>
              </div>
            </div>

            {flow === "signup" && portal === "buyer" && (
              <>
                <div className="auth-input-group">
                  <label htmlFor="auth-display-name">Full name</label>
                  <input
                    id="auth-display-name"
                    type="text"
                    placeholder="Name shown in your account"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="auth-input-group">
                  <label htmlFor="auth-buyer-language">Preferred language</label>
                  <select
                    id="auth-buyer-language"
                    value={buyerLang}
                    onChange={(event) => setBuyerLang(event.target.value as LanguageCode)}
                    disabled={loading}
                  >
                    {LANGUAGE_OPTIONS.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {flow === "signup" && portal === "seller" && (
              <>
                <div className="auth-input-group">
                  <label htmlFor="auth-business-name">Business or store name</label>
                  <input
                    id="auth-business-name"
                    type="text"
                    placeholder="Legal or marketplace store name"
                    value={businessName}
                    onChange={(event) => setBusinessName(event.target.value)}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="auth-input-group">
                  <label htmlFor="auth-gstin">GSTIN</label>
                  <input
                    id="auth-gstin"
                    type="text"
                    placeholder="GST number for review"
                    value={gstNumber}
                    onChange={(event) => setGstNumber(event.target.value.toUpperCase())}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="auth-input-group">
                  <label htmlFor="auth-pickup-pincode">Pickup pincode</label>
                  <input
                    id="auth-pickup-pincode"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6 digit pincode"
                    value={pickupPincode}
                    onChange={(event) => setPickupPincode(event.target.value.replace(/\D/g, ""))}
                    disabled={loading}
                    required
                  />
                </div>

                <div className="auth-input-group">
                  <label htmlFor="auth-support-contact">Support contact</label>
                  <input
                    id="auth-support-contact"
                    type="text"
                    placeholder="Phone or email for verification"
                    value={supportContact}
                    onChange={(event) => setSupportContact(event.target.value)}
                    disabled={loading}
                    required
                  />
                </div>
              </>
            )}

            {portal === "reviewer" && (
              <p className="auth-helper-text">
                Reviewer accounts are provisioned by the platform. There is no public signup for this workspace.
              </p>
            )}

            <button type="submit" className="auth-primary-btn" disabled={loading || !canSubmit}>
              <span>{loading ? "Checking..." : flow === "signin" ? "Continue" : portal === "seller" ? "Submit Application" : "Create Account"}</span>
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="auth-bottom-banner">
            <span>Buyer, seller and reviewer data stay separated by role.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function portalToRole(portal: AuthPortal): PortalRole {
  if (portal === "seller") return "seller";
  if (portal === "reviewer") return "admin";
  return "buyer";
}

function PortalButton({
  portal,
  active,
  title,
  description,
  icon,
  onClick
}: {
  portal: AuthPortal;
  active: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: (portal: AuthPortal) => void;
}) {
  return (
    <button
      type="button"
      className={`auth-portal-card ${active ? "active" : ""}`}
      onClick={() => onClick(portal)}
      aria-pressed={active}
    >
      <span className="auth-portal-icon">{icon}</span>
      <div className="auth-portal-info">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
    </button>
  );
}
