import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  LockKeyhole,
  ShieldCheck,
  Store,
  UserRound
} from "lucide-react";
import { login, signupBuyer, signupSeller } from "../api/client";
import { LANGUAGE_OPTIONS, type LanguageCode } from "../i18n";
import type { AuthAccount, AuthSession } from "../types/api";

type Props = {
  language: LanguageCode;
  onLanguageChange: (language: LanguageCode) => void;
  onAuthenticated: (session: AuthSession) => void;
};

type AuthPortal = "buyer" | "seller" | "reviewer";
type AuthFlow = "signin" | "signup";
type PortalRole = AuthAccount["role"];

const DEMO_CREDENTIALS: Record<AuthPortal, { username: string; password: string; label: string }> = {
  buyer: {
    username: "asha.buyer",
    password: "buyer-asha-pass",
    label: "Buyer account"
  },
  seller: {
    username: "seller.a",
    password: "seller-a-pass",
    label: "Verified seller account"
  },
  reviewer: {
    username: "reviewer.admin",
    password: "admin-reviewer-pass",
    label: "Reviewer account"
  }
};

const PORTAL_COPY: Record<AuthPortal, {
  title: string;
  shortLabel: string;
  description: string;
  lockText: string;
}> = {
  buyer: {
    title: "Buyer app",
    shortLabel: "Buyer",
    description: "Shop with simple proof before you place an order.",
    lockText: "Buyer-only shopping and trust settings."
  },
  seller: {
    title: "Seller portal",
    shortLabel: "Seller",
    description: "Improve listings after seller and document checks.",
    lockText: "Seller accounts see only their own listings and aggregate evidence."
  },
  reviewer: {
    title: "Reviewer queue",
    shortLabel: "Reviewer",
    description: "Approve sellers, documents, and listing drafts with audit trails.",
    lockText: "Reviewer access is restricted to admin accounts."
  }
};

export function AuthScreen({ language, onLanguageChange, onAuthenticated }: Props) {
  const [portal, setPortal] = useState<AuthPortal>("buyer");
  const [flow, setFlow] = useState<AuthFlow>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
  const demo = DEMO_CREDENTIALS[portal];
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
      <div className="mobile-auth-card auth-entry-card">
        <div className="auth-brand-lockup">
          <div className="brand-logo-badge">S</div>
          <div>
            <h1 className="brand-logo-text">Sarthi</h1>
            <span className="brand-logo-sub">Truth-first pre-purchase confidence</span>
          </div>
        </div>

        <div className="auth-portal-grid" aria-label="Choose Sarthi portal">
          <PortalButton
            portal="buyer"
            active={portal === "buyer"}
            title={PORTAL_COPY.buyer.shortLabel}
            description="Shop safely"
            icon={<UserRound size={18} />}
            onClick={selectPortal}
          />
          <PortalButton
            portal="seller"
            active={portal === "seller"}
            title={PORTAL_COPY.seller.shortLabel}
            description="Business access"
            icon={<Store size={18} />}
            onClick={selectPortal}
          />
          <PortalButton
            portal="reviewer"
            active={portal === "reviewer"}
            title={PORTAL_COPY.reviewer.shortLabel}
            description="Admin only"
            icon={<ClipboardCheck size={18} />}
            onClick={selectPortal}
          />
        </div>

        <div className="auth-portal-summary">
          <div>
            <span className="eyebrow">{activeCopy.shortLabel} access</span>
            <h2 className="auth-step-heading">{flow === "signin" ? `Sign in to ${activeCopy.title}` : `Create ${activeCopy.title}`}</h2>
            <p className="auth-step-desc">{activeCopy.description}</p>
          </div>
          <div className="auth-portal-lock">
            <LockKeyhole size={14} />
            <span>{activeCopy.lockText}</span>
          </div>
        </div>

        {success && (
          <div className="auth-success-banner">
            <CheckCircle2 size={16} />
            <span>{success}</span>
          </div>
        )}
        {error && <div className="auth-error-banner">{error}</div>}

        <div className="auth-tab-group">
          <button
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
          <div className="auth-security-note">
            <ShieldCheck size={15} />
            <span>Backend checks role before opening a workspace.</span>
          </div>

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
            <label>{portal === "buyer" ? "Mobile or username" : "Username"}</label>
            <input
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
            <label>Password</label>
            <input
              type="password"
              placeholder={flow === "signin" ? "Enter password" : "Minimum 10 chars, letters and numbers"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={flow === "signin" ? "current-password" : "new-password"}
              disabled={loading}
              required
            />
          </div>

          {flow === "signup" && portal === "buyer" && (
            <>
              <div className="auth-input-group">
                <label>Full name</label>
                <input
                  type="text"
                  placeholder="Name shown in your account"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="auth-input-group">
                <label>Preferred language</label>
                <select
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
                <label>Business or store name</label>
                <input
                  type="text"
                  placeholder="Legal or marketplace store name"
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="auth-input-group">
                <label>GSTIN</label>
                <input
                  type="text"
                  placeholder="GST number for review"
                  value={gstNumber}
                  onChange={(event) => setGstNumber(event.target.value.toUpperCase())}
                  disabled={loading}
                  required
                />
              </div>

              <div className="auth-input-group">
                <label>Pickup pincode</label>
                <input
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
                <label>Support contact</label>
                <input
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
            <span>{loading ? "Checking..." : flow === "signin" ? "Continue securely" : portal === "seller" ? "Submit application" : "Create account"}</span>
            <ArrowRight size={16} />
          </button>
        </form>
      </div>

      <div className="auth-bottom-banner">
        <ShieldCheck size={14} />
        <span>Private buyer memory, seller verification, and reviewer audit logs stay separated.</span>
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
  icon: ReactNode;
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
      <strong>{title}</strong>
      <span>{description}</span>
    </button>
  );
}
