import type {
  AgentResponse,
  AdminReviewQueue,
  AuthSession,
  AuditTrace,
  BuyerMemoryResponse,
  CheckoutResponse,
  CompareResponse,
  DeleteMemoryResponse,
  FeedResponse,
  MemorySettingsResponse,
  OutcomeResponse,
  Product,
  ProductDetailResponse,
  PrivacySummary,
  Scenario,
  Seller,
  SellerOnboardingResponse,
  SellerPanelResponse,
  SellerSignupSession,
  SourceHealth,
  SystemReadiness
} from "../types/api";
import type { LanguageCode } from "../i18n";

const API_BASE = "/api";
const AUTH_STORAGE_KEY = "sarthi.auth.session";

export function getStoredSession(): AuthSession | null {
  const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function storeSession(session: AuthSession) {
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = getStoredSession();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });
  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

export function login(username: string, password: string) {
  return request<AuthSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
}

export function signupBuyer(payload: {
  username: string;
  password: string;
  display_name: string;
  language: LanguageCode;
}) {
  return request<AuthSession>("/auth/signup/buyer", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function signupSeller(payload: {
  username: string;
  password: string;
  business_name: string;
  gst_number: string;
  pickup_pincode: string;
  support_contact: string;
}) {
  return request<SellerSignupSession>("/auth/signup/seller", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getMe() {
  return request<{ account: AuthSession["account"] }>("/auth/me");
}

export async function logout() {
  try {
    await request<{ ok: boolean }>("/auth/logout", { method: "POST" });
  } finally {
    clearStoredSession();
  }
}

export function resetSeed() {
  return request("/seed/reset", { method: "POST" });
}

export function getScenarios() {
  return request<{ scenarios: Scenario[] }>("/scenarios");
}

export function activateScenario(scenarioId: string) {
  return request<{ scenario: Scenario }>(`/scenarios/${encodeURIComponent(scenarioId)}/activate`, {
    method: "POST"
  });
}

export function getFeed(buyerId: string, options?: {
  limit?: number;
  offset?: number;
  category?: string;
  q?: string;
}) {
  const params = new URLSearchParams({ buyer_id: buyerId });
  params.set("limit", String(options?.limit ?? 48));
  params.set("offset", String(options?.offset ?? 0));
  if (options?.category) params.set("category", options.category);
  if (options?.q) params.set("q", options.q);
  return request<FeedResponse>(`/feed?${params.toString()}`);
}

export function getSellers() {
  return request<{ sellers: Seller[] }>("/sellers");
}

export function getDataSources() {
  return request<{ account_role: string; health: SourceHealth }>("/data-sources");
}

export function getSystemReadiness() {
  return request<SystemReadiness>("/system/readiness");
}

export function getSellerPanel(clusterId?: string) {
  const params = new URLSearchParams();
  if (clusterId) {
    params.set("cluster_id", clusterId);
  }
  const query = params.toString();
  return request<SellerPanelResponse>(
    `/seller/me/panel${query ? `?${query}` : ""}`
  );
}

export function getSellerOnboarding() {
  return request<SellerOnboardingResponse>("/seller/me/onboarding");
}

export function getAdminReviewQueue() {
  return request<AdminReviewQueue>("/admin/review-queue");
}

export function approveSellerApplication(applicationId: string, notes: string) {
  return request<AdminReviewQueue>(`/admin/seller-applications/${encodeURIComponent(applicationId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ notes })
  });
}

export function rejectSellerApplication(applicationId: string, notes: string) {
  return request<AdminReviewQueue>(`/admin/seller-applications/${encodeURIComponent(applicationId)}/reject`, {
    method: "POST",
    body: JSON.stringify({ notes })
  });
}

export function approveListingDraft(draftId: string, notes: string) {
  return request<AdminReviewQueue>(`/admin/listing-drafts/${encodeURIComponent(draftId)}/approve`, {
    method: "POST",
    body: JSON.stringify({ notes })
  });
}

export function requestListingRevision(draftId: string, notes: string) {
  return request<AdminReviewQueue>(`/admin/listing-drafts/${encodeURIComponent(draftId)}/revision`, {
    method: "POST",
    body: JSON.stringify({ notes })
  });
}

export function submitSellerDocument(payload: {
  document_type: "gst_certificate" | "pan_card" | "address_proof" | "bank_proof";
  reference: string;
  file_name: string;
  mime_type: string;
  content_base64: string;
}) {
  return request<SellerOnboardingResponse>("/seller/me/verification/documents", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createListingDraft(payload: {
  title: string;
  category: string;
  garment_type: string;
  fabric: string;
  color_family: string;
  base_price: number;
  image_url: string;
}) {
  return request<SellerOnboardingResponse>("/seller/me/listing-drafts", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function correctMeasurement(productId: string, payload: { l_chest: number; xl_chest: number }) {
  return request<{ ok: boolean; status: string }>(`/seller/listings/${encodeURIComponent(productId)}/correct-measurement`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function submitListingDraft(draftId: string) {
  return request<SellerOnboardingResponse>(`/seller/me/listing-drafts/${encodeURIComponent(draftId)}/submit`, {
    method: "POST"
  });
}

export function getProductDetail(buyerId: string, productId: string) {
  return request<ProductDetailResponse>(
    `/products/${encodeURIComponent(productId)}?buyer_id=${encodeURIComponent(buyerId)}`
  );
}

export function compareCluster(buyerId: string, clusterId: string) {
  return request<CompareResponse>("/compare", {
    method: "POST",
    body: JSON.stringify({
      buyer_id: buyerId,
      cluster_id: clusterId,
      preferred_fit: "comfort"
    })
  });
}

export function askSarthi(payload: {
  buyer_id: string;
  query: string;
  language?: LanguageCode;
  cluster_id?: string;
  selected_variant_id?: string;
}) {
  return request<AgentResponse>("/agent/query", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function verifyOffer(buyerId: string, variantId: string) {
  return request<CheckoutResponse>("/checkout/verify-offer", {
    method: "POST",
    body: JSON.stringify({
      buyer_id: buyerId,
      variant_id: variantId
    })
  });
}

export function simulateOutcome(payload: {
  buyer_id: string;
  variant_id: string;
  status: "delivered_kept" | "returned";
  return_reason?: string;
}) {
  return request<OutcomeResponse>("/orders/simulate", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getAudit(traceId: string) {
  return request<AuditTrace>(`/audit/${encodeURIComponent(traceId)}`);
}

export function getPrivacy(buyerId: string) {
  return request<PrivacySummary>(`/buyers/${encodeURIComponent(buyerId)}/privacy`);
}

export function getMemory(buyerId: string) {
  return request<BuyerMemoryResponse>(`/buyers/${encodeURIComponent(buyerId)}/memory`);
}

export function updateMemorySettings(
  buyerId: string,
  payload: {
    fit_memory_enabled?: boolean;
    preferred_fit?: string;
  }
) {
  return request<MemorySettingsResponse>(`/buyers/${encodeURIComponent(buyerId)}/memory`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function deleteMemory(buyerId: string) {
  return request<DeleteMemoryResponse>(`/buyers/${encodeURIComponent(buyerId)}/memory`, {
    method: "DELETE"
  });
}
