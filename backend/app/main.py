from __future__ import annotations

from typing import Literal

from fastapi import Depends, FastAPI, Header, HTTPException, Query, status
from pydantic import BaseModel, model_validator

from app.agent.orchestrator import answer_query
from app.config import settings
from app.database import get_connection
from app.graph.graph_projection import build_projection_summary, sync_neo4j_from_sqlite
from app.graph.graph_queries import sqlite_graph_path
from app.graph.neo4j_client import get_neo4j_client
from app.repositories.buyers import list_fit_memory, update_memory_settings
from app.repositories.catalog import get_cluster_products, get_product, get_variant, list_feed
from app.repositories.outcomes import record_order_outcome
from app.repositories.traces import create_trace, get_trace
from app.schemas import AgentQueryRequest, CompareRequest
from app.scenarios import get_scenario, list_scenarios, scenario_to_dict
from app.seed import reset_seed_database
from app.services.duplicate_detection import candidate_variants_for_cluster
from app.services.fit_predictor import predict_fit
from app.services.knowledge_graph import answer_knowledge_graph_question, build_cluster_knowledge_graph
from app.services.kept_order_ranker import rank_for_kept_order
from app.services.offer_verifier import verify_offer
from app.services.product_detail import build_product_detail
from app.services.privacy import delete_personal_memory, privacy_summary
from app.services.proof_requests import build_seller_evidence_coach, submit_seller_evidence_asset
from app.services.regret_firewall import build_regret_firewall_decision
from app.services.sku_truth_passport import build_sku_truth_passport
from app.services.auth import (
    account_for_token,
    authenticate_account,
    create_session,
    register_buyer_account,
    register_seller_application,
    revoke_session,
)
from app.services.admin_review import (
    approve_listing_draft,
    approve_seller_application,
    build_review_queue,
    reject_seller_application,
    request_listing_revision,
)
from app.services.data_contracts import list_data_sources, source_health_summary
from app.services.seller_onboarding import (
    build_seller_onboarding,
    create_listing_draft,
    submit_listing_draft,
    submit_verification_document,
)
from app.services.seller_panel import build_seller_panel, list_sellers
from app.services.system_readiness import build_system_readiness
from app.services.expectation_contracts import (
    complete_expectation_contract,
    create_expectation_contract,
    get_expectation_contract,
)


app = FastAPI(title="Sarthi API", version="0.1.0")

DEMO_CONTROL_ENVS = {"development", "demo", "test", "local"}
FitPreference = Literal["comfort", "regular"]
OutcomeStatus = Literal["delivered_kept", "returned", "exchanged", "rto"]
ReturnReason = Literal["too_small", "too_large", "color_different", "fabric_different", "damaged"]
DocumentType = Literal["gst_certificate", "pan_card", "address_proof", "bank_proof"]
ProofAttribute = Literal["transparency", "fabric", "color", "size", "packaging", "offer"]
ProofType = Literal["daylight_photo", "fabric_closeup", "measurement_chart", "packaging_photo", "seller_note"]
BuyerLanguage = Literal[
    "hinglish",
    "english",
    "hindi",
    "bengali",
    "tamil",
    "telugu",
    "marathi",
    "gujarati",
    "kannada",
    "malayalam",
    "odia",
    "punjabi",
    "assamese",
]


class OfferRequest(BaseModel):
    variant_id: str
    buyer_id: str = "buyer_asha"


class OutcomeRequest(BaseModel):
    buyer_id: str
    variant_id: str
    status: OutcomeStatus
    return_reason: ReturnReason | None = None
    contract_id: str | None = None

    @model_validator(mode="after")
    def validate_return_reason_contract(self) -> "OutcomeRequest":
        if self.status in {"returned", "exchanged"} and not self.return_reason:
            raise ValueError(f"{self.status} outcomes require a structured return_reason")
        if self.status in {"delivered_kept", "rto"} and self.return_reason:
            raise ValueError(f"{self.status} outcomes cannot include a return_reason")
        return self


class MemoryPatchRequest(BaseModel):
    fit_memory_enabled: bool | None = None
    preferred_fit: FitPreference | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class BuyerSignupRequest(BaseModel):
    username: str
    password: str
    display_name: str
    language: BuyerLanguage = "hinglish"


class SellerSignupRequest(BaseModel):
    username: str
    password: str
    business_name: str
    gst_number: str
    pickup_pincode: str
    support_contact: str


class SellerDocumentRequest(BaseModel):
    document_type: DocumentType
    reference: str
    file_name: str
    mime_type: str
    content_base64: str


class ListingDraftRequest(BaseModel):
    title: str
    category: str
    garment_type: str
    fabric: str
    color_family: str
    base_price: int
    image_url: str


class MeasurementCorrectionRequest(BaseModel):
    l_chest: float
    xl_chest: float


class ReviewDecisionRequest(BaseModel):
    notes: str = ""


class KnowledgeGraphChatRequest(BaseModel):
    buyer_id: str
    cluster_id: str
    query: str
    preferred_fit: FitPreference = "comfort"


class RegretFirewallRequest(BaseModel):
    buyer_id: str
    product_id: str | None = None
    cluster_id: str | None = None
    query: str = ""
    preferred_fit: FitPreference = "comfort"
    create_missing_proof_request: bool = True

    @model_validator(mode="after")
    def validate_context(self) -> "RegretFirewallRequest":
        if not self.product_id and not self.cluster_id:
            raise ValueError("product_id or cluster_id is required")
        return self


class SellerEvidenceAssetRequest(BaseModel):
    product_id: str
    attribute: ProofAttribute
    proof_type: ProofType
    title: str
    description: str
    asset_url: str


class ExpectationContractRequest(BaseModel):
    buyer_id: str
    variant_id: str
    preferred_fit: FitPreference = "comfort"


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return token


def current_account(authorization: str | None = Header(default=None)) -> dict:
    token = _extract_bearer_token(authorization)
    with get_connection(settings.database_path) as conn:
        account = account_for_token(conn, token)
    if not account:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session",
        )
    return account


def require_buyer(account: dict = Depends(current_account)) -> dict:
    if account["role"] != "buyer":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Buyer access required")
    return account


def require_seller(account: dict = Depends(current_account)) -> dict:
    if account["role"] != "seller":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Seller access required")
    return account


def require_admin(account: dict = Depends(current_account)) -> dict:
    if account["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return account


def _assert_buyer_owner(account: dict, buyer_id: str) -> None:
    if account.get("buyer_id") != buyer_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access another buyer account")


def _assert_seller_owner(account: dict, seller_id: str) -> None:
    if account.get("seller_id") != seller_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot access another seller account")


def require_demo_controls_enabled() -> None:
    if settings.app_env not in DEMO_CONTROL_ENVS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo control endpoint disabled outside development or demo mode",
        )


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "app_env": settings.app_env,
        "database": str(settings.database_path),
    }


@app.get("/system/readiness")
def system_readiness() -> dict:
    with get_connection(settings.database_path) as conn:
        return build_system_readiness(conn)


@app.post("/auth/login")
def auth_login(request: LoginRequest) -> dict:
    with get_connection(settings.database_path) as conn:
        account = authenticate_account(conn, request.username, request.password)
        if not account:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
        session = create_session(conn, account["account_id"])
        conn.commit()
        return {
            "account": account,
            **session,
        }


@app.post("/auth/signup/buyer")
def auth_signup_buyer(request: BuyerSignupRequest) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            account = register_buyer_account(
                conn,
                username=request.username,
                password=request.password,
                display_name=request.display_name,
                language=request.language,
            )
            session = create_session(conn, account["account_id"])
            conn.commit()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "account": account,
            **session,
        }


@app.post("/auth/signup/seller")
def auth_signup_seller(request: SellerSignupRequest) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            account = register_seller_application(
                conn,
                username=request.username,
                password=request.password,
                business_name=request.business_name,
                gst_number=request.gst_number,
                pickup_pincode=request.pickup_pincode,
                support_contact=request.support_contact,
            )
            application_id = account.pop("application_id")
            verification_status = account.pop("verification_status")
            session = create_session(conn, account["account_id"])
            conn.commit()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {
            "account": account,
            "application": {
                "application_id": application_id,
                "verification_status": verification_status,
                "status": "pending_review",
            },
            **session,
        }


@app.get("/auth/me")
def auth_me(account: dict = Depends(current_account)) -> dict:
    return {
        "account": account,
    }


@app.post("/auth/logout")
def auth_logout(authorization: str | None = Header(default=None)) -> dict:
    token = _extract_bearer_token(authorization)
    with get_connection(settings.database_path) as conn:
        revoke_session(conn, token)
    return {
        "ok": True,
    }


@app.post("/seed/reset")
def seed_reset(scenario_id: str | None = None, _: None = Depends(require_demo_controls_enabled)) -> dict:
    counts = reset_seed_database(settings.database_path, scenario_id=scenario_id)
    with get_connection(settings.database_path) as conn:
        graph_summary = build_projection_summary(conn)
    return {
        "sqlite": counts,
        "graph_projection": graph_summary,
        "scenario_id": scenario_id,
    }


@app.get("/scenarios")
def scenarios(_: None = Depends(require_demo_controls_enabled)) -> dict:
    return {
        "scenarios": list_scenarios(),
    }


@app.get("/scenarios/{scenario_id}")
def scenario_detail(scenario_id: str, _: None = Depends(require_demo_controls_enabled)) -> dict:
    try:
        return scenario_to_dict(get_scenario(scenario_id))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/scenarios/{scenario_id}/activate")
def activate_scenario(scenario_id: str, _: None = Depends(require_demo_controls_enabled)) -> dict:
    try:
        counts = reset_seed_database(settings.database_path, scenario_id=scenario_id)
        with get_connection(settings.database_path) as conn:
            graph_summary = build_projection_summary(conn)
            scenario = scenario_to_dict(get_scenario(scenario_id))
        return {
            "scenario": scenario,
            "sqlite": counts,
            "graph_projection": graph_summary,
        }
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/graph/sync")
def graph_sync(
    _: None = Depends(require_demo_controls_enabled),
    account: dict = Depends(current_account),
) -> dict:
    client = get_neo4j_client()
    try:
        with get_connection(settings.database_path) as conn:
            return sync_neo4j_from_sqlite(conn, client)
    finally:
        client.close()


@app.get("/data-sources")
def data_sources(account: dict = Depends(current_account)) -> dict:
    with get_connection(settings.database_path) as conn:
        sources = list_data_sources(conn)
        return {
            "account_role": account["role"],
            "health": source_health_summary(sources),
        }


@app.get("/admin/review-queue")
def admin_review_queue(account: dict = Depends(require_admin)) -> dict:
    with get_connection(settings.database_path) as conn:
        return build_review_queue(conn)


@app.post("/admin/seller-applications/{application_id}/approve")
def admin_approve_seller_application(
    application_id: str,
    request: ReviewDecisionRequest,
    account: dict = Depends(require_admin),
) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            return approve_seller_application(conn, application_id, account["account_id"], request.notes)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/admin/seller-applications/{application_id}/reject")
def admin_reject_seller_application(
    application_id: str,
    request: ReviewDecisionRequest,
    account: dict = Depends(require_admin),
) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            return reject_seller_application(conn, application_id, account["account_id"], request.notes)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/admin/listing-drafts/{draft_id}/approve")
def admin_approve_listing_draft(
    draft_id: str,
    request: ReviewDecisionRequest,
    account: dict = Depends(require_admin),
) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            return approve_listing_draft(conn, draft_id, account["account_id"], request.notes)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/admin/listing-drafts/{draft_id}/revision")
def admin_request_listing_revision(
    draft_id: str,
    request: ReviewDecisionRequest,
    account: dict = Depends(require_admin),
) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            return request_listing_revision(conn, draft_id, account["account_id"], request.notes)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/graph/path")
def graph_path(
    path_type: str,
    buyer_id: str | None = None,
    variant_id: str | None = None,
    _: None = Depends(require_demo_controls_enabled),
    account: dict = Depends(current_account),
) -> dict:
    if buyer_id:
        _assert_buyer_owner(account, buyer_id)
    with get_connection(settings.database_path) as conn:
        try:
            return sqlite_graph_path(conn, path_type, buyer_id=buyer_id, variant_id=variant_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/feed")
def feed(
    buyer_id: str | None = None,
    limit: int = Query(default=48, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    category: str | None = None,
    q: str | None = None,
    account: dict = Depends(require_buyer),
) -> dict:
    resolved_buyer_id = buyer_id or account["buyer_id"]
    _assert_buyer_owner(account, resolved_buyer_id)
    with get_connection(settings.database_path) as conn:
        page = list_feed(conn, limit=limit, offset=offset, category=category, query=q)
        return {
            "buyer_id": resolved_buyer_id,
            **page,
        }


@app.get("/sellers")
def sellers(account: dict = Depends(require_seller)) -> dict:
    with get_connection(settings.database_path) as conn:
        own_sellers = [seller for seller in list_sellers(conn) if seller["seller_id"] == account["seller_id"]]
        return {
            "sellers": own_sellers,
        }


@app.get("/sellers/{seller_id}/panel")
def seller_panel(
    seller_id: str,
    cluster_id: str | None = None,
    size: str = "XL",
    account: dict = Depends(require_seller),
) -> dict:
    _assert_seller_owner(account, seller_id)
    with get_connection(settings.database_path) as conn:
        try:
            return build_seller_panel(conn, seller_id, cluster_id=cluster_id, size=size)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/seller/me/panel")
def my_seller_panel(
    cluster_id: str | None = None,
    size: str = "XL",
    account: dict = Depends(require_seller),
) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            return build_seller_panel(conn, account["seller_id"], cluster_id=cluster_id, size=size)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/seller/me/evidence-coach")
def seller_evidence_coach(account: dict = Depends(require_seller)) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            return build_seller_evidence_coach(conn, account["seller_id"])
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/seller/me/evidence-assets")
def seller_submit_evidence_asset(
    request: SellerEvidenceAssetRequest,
    account: dict = Depends(require_seller),
) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            result = submit_seller_evidence_asset(
                conn,
                seller_id=account["seller_id"],
                product_id=request.product_id,
                attribute=request.attribute,
                proof_type=request.proof_type,
                title=request.title,
                description=request.description,
                asset_url=request.asset_url,
            )
            conn.commit()
            return result
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/seller/listings/{product_id}/correct-measurement")
def correct_measurement(
    product_id: str,
    request: MeasurementCorrectionRequest,
    account: dict = Depends(require_seller),
) -> dict:
    from datetime import datetime
    if request.l_chest <= 0 or request.xl_chest <= 0 or request.l_chest >= request.xl_chest:
        raise HTTPException(
            status_code=400,
            detail="Measurement correction must use positive values with XL chest greater than L chest",
        )

    with get_connection(settings.database_path) as conn:
        row = conn.execute("SELECT seller_id FROM products WHERE product_id = ?", (product_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Product not found")
        if row["seller_id"] != account["seller_id"]:
            raise HTTPException(status_code=403, detail="Cannot edit another seller's listing")
            
        now = datetime.now().isoformat()
        conn.execute(
            """
            INSERT OR REPLACE INTO seller_corrections (product_id, l_chest, xl_chest, corrected_at)
            VALUES (?, ?, ?, ?)
            """,
            (product_id, request.l_chest, request.xl_chest, now),
        )
        conn.commit()
    return {
        "ok": True,
        "product_id": product_id,
        "l_chest": request.l_chest,
        "xl_chest": request.xl_chest,
        "status": "pending_future_outcome_validation",
    }


@app.get("/seller/me/onboarding")
def seller_onboarding(account: dict = Depends(require_seller)) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            return build_seller_onboarding(conn, account["seller_id"])
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/seller/me/verification/documents")
def seller_submit_document(
    request: SellerDocumentRequest,
    account: dict = Depends(require_seller),
) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            return submit_verification_document(
                conn,
                account["seller_id"],
                request.document_type,
                request.reference,
                request.file_name,
                request.mime_type,
                request.content_base64,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/seller/me/listing-drafts")
def seller_create_listing_draft(
    request: ListingDraftRequest,
    account: dict = Depends(require_seller),
) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            return create_listing_draft(
                conn,
                seller_id=account["seller_id"],
                title=request.title,
                category=request.category,
                garment_type=request.garment_type,
                fabric=request.fabric,
                color_family=request.color_family,
                base_price=request.base_price,
                image_url=request.image_url,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/seller/me/listing-drafts/{draft_id}/submit")
def seller_submit_listing_draft(
    draft_id: str,
    account: dict = Depends(require_seller),
) -> dict:
    with get_connection(settings.database_path) as conn:
        try:
            return submit_listing_draft(conn, account["seller_id"], draft_id)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/clusters/{cluster_id}")
def cluster(cluster_id: str, buyer_id: str | None = None, account: dict = Depends(require_buyer)) -> dict:
    resolved_buyer_id = buyer_id or account["buyer_id"]
    _assert_buyer_owner(account, resolved_buyer_id)
    with get_connection(settings.database_path) as conn:
        products = get_cluster_products(conn, cluster_id)
        if not products:
            raise HTTPException(status_code=404, detail="Cluster not found")
        return {
            "buyer_id": resolved_buyer_id,
            "cluster_id": cluster_id,
            "products": products,
        }


@app.get("/products/{product_id}")
def product_detail(
    product_id: str,
    buyer_id: str | None = None,
    preferred_fit: FitPreference = "comfort",
    account: dict = Depends(require_buyer),
) -> dict:
    resolved_buyer_id = buyer_id or account["buyer_id"]
    _assert_buyer_owner(account, resolved_buyer_id)
    with get_connection(settings.database_path) as conn:
        try:
            return build_product_detail(conn, resolved_buyer_id, product_id, preferred_fit)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/products/{product_id}/sku-passport")
def sku_truth_passport(
    product_id: str,
    buyer_id: str | None = None,
    variant_id: str | None = None,
    preferred_fit: FitPreference = "comfort",
    account: dict = Depends(require_buyer),
) -> dict:
    resolved_buyer_id = buyer_id or account["buyer_id"]
    _assert_buyer_owner(account, resolved_buyer_id)
    with get_connection(settings.database_path) as conn:
        if variant_id is None:
            variants = conn.execute(
                """
                SELECT variant_id
                FROM variants
                WHERE product_id = ?
                ORDER BY CASE size
                  WHEN 'XL' THEN 0
                  WHEN 'L' THEN 1
                  WHEN 'M' THEN 2
                  ELSE 3
                END
                LIMIT 1
                """,
                (product_id,),
            ).fetchone()
            if not variants:
                raise HTTPException(status_code=404, detail="Product not found")
            variant_id = variants["variant_id"]
        try:
            passport = build_sku_truth_passport(conn, resolved_buyer_id, variant_id, preferred_fit)
            if passport["product"]["product_id"] != product_id:
                raise HTTPException(status_code=400, detail="variant_id does not belong to product_id")
            return passport
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/decision/regret-firewall")
def regret_firewall(
    request: RegretFirewallRequest,
    account: dict = Depends(require_buyer),
) -> dict:
    _assert_buyer_owner(account, request.buyer_id)
    with get_connection(settings.database_path) as conn:
        try:
            return build_regret_firewall_decision(
                conn,
                buyer_id=request.buyer_id,
                product_id=request.product_id,
                cluster_id=request.cluster_id,
                query=request.query,
                preferred_fit=request.preferred_fit,
                create_missing_proof_request=request.create_missing_proof_request,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/expectation-contracts")
def expectation_contract_create(
    request: ExpectationContractRequest,
    account: dict = Depends(require_buyer),
) -> dict:
    _assert_buyer_owner(account, request.buyer_id)
    with get_connection(settings.database_path) as conn:
        try:
            return create_expectation_contract(
                conn,
                buyer_id=request.buyer_id,
                variant_id=request.variant_id,
                preferred_fit=request.preferred_fit,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/expectation-contracts/{contract_id}")
def expectation_contract_get(
    contract_id: str,
    account: dict = Depends(require_buyer),
) -> dict:
    with get_connection(settings.database_path) as conn:
        contract = get_expectation_contract(conn, contract_id, account["buyer_id"])
        if not contract:
            raise HTTPException(status_code=404, detail="Expectation contract not found")
        return contract


@app.post("/compare")
def compare(request: CompareRequest, account: dict = Depends(require_buyer)) -> dict:
    _assert_buyer_owner(account, request.buyer_id)
    with get_connection(settings.database_path) as conn:
        candidate_ids = candidate_variants_for_cluster(conn, request.cluster_id, "XL")
        if not candidate_ids:
            raise HTTPException(status_code=404, detail="No comparable variants")
        ranking = rank_for_kept_order(conn, request.buyer_id, candidate_ids, request.preferred_fit)
        fit = predict_fit(conn, request.buyer_id, ranking["winner"], request.preferred_fit)
        graph = sqlite_graph_path(
            conn,
            "buyer_fit_path",
            buyer_id=request.buyer_id,
            variant_id=ranking["winner"],
        )
        winner_variant = get_variant(conn, ranking["winner"])
        trace_id = create_trace(
            conn,
            buyer_id=request.buyer_id,
            product_id=winner_variant["product_id"] if winner_variant else None,
            variant_id=ranking["winner"],
            intent=["compare", "fit"],
            tools_used=["candidate_variants_for_cluster", "rank_for_kept_order", "predict_fit", "traverse_commerce_graph"],
            fact_ids=ranking["fact_ids"] + fit["fact_ids"] + graph["fact_ids"],
            graph_paths=[graph],
        )
        conn.commit()
        return {
            "trace_id": trace_id,
            "selected_product_id": winner_variant["product_id"] if winner_variant else None,
            "ranking": ranking,
            "fit": fit,
            "graph_path": graph,
        }


@app.get("/knowledge-graph/clusters/{cluster_id}")
def cluster_knowledge_graph(
    cluster_id: str,
    buyer_id: str | None = None,
    preferred_fit: FitPreference = "comfort",
    account: dict = Depends(require_buyer),
) -> dict:
    resolved_buyer_id = buyer_id or account["buyer_id"]
    _assert_buyer_owner(account, resolved_buyer_id)
    with get_connection(settings.database_path) as conn:
        try:
            return build_cluster_knowledge_graph(conn, resolved_buyer_id, cluster_id, preferred_fit)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/knowledge-graph/chat")
def cluster_knowledge_graph_chat(
    request: KnowledgeGraphChatRequest,
    account: dict = Depends(require_buyer),
) -> dict:
    _assert_buyer_owner(account, request.buyer_id)
    with get_connection(settings.database_path) as conn:
        try:
            graph = build_cluster_knowledge_graph(
                conn,
                request.buyer_id,
                request.cluster_id,
                request.preferred_fit,
            )
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

        answer = answer_knowledge_graph_question(graph, request.query)
        fact_ids = answer["fact_ids"] or graph["fact_ids"][:8]
        graph_path = {
            "path_type": "cluster_knowledge_graph_query",
            "available_from": "sqlite_dynamic_graph",
            "nodes": answer["matched_node_ids"] or [node["id"] for node in graph["nodes"][:6]],
            "relationships": [
                edge["label"]
                for edge in graph["edges"]
                if edge["source"] in answer["matched_node_ids"] or edge["target"] in answer["matched_node_ids"]
            ][:8],
            "fact_ids": fact_ids,
            "summary": answer["summary"],
        }
        winner_variant_id = graph["ranking"]["winner"] if graph.get("ranking") else None
        trace_id = create_trace(
            conn,
            buyer_id=request.buyer_id,
            product_id=graph.get("selected_product_id"),
            variant_id=winner_variant_id,
            intent=["knowledge_graph_chat"],
            tools_used=["build_cluster_knowledge_graph", "answer_knowledge_graph_question", "traverse_dynamic_cluster_graph"],
            fact_ids=fact_ids,
            graph_paths=[graph_path],
        )
        conn.commit()
        return {
            "trace_id": trace_id,
            "answer": answer,
            "graph_path": graph_path,
        }


@app.post("/agent/query")
def agent_query(request: AgentQueryRequest, account: dict = Depends(require_buyer)) -> dict:
    _assert_buyer_owner(account, request.buyer_id)
    with get_connection(settings.database_path) as conn:
        try:
            return answer_query(
                conn,
                buyer_id=request.buyer_id,
                query=request.query,
                cluster_id=request.cluster_id,
                selected_variant_id=request.selected_variant_id,
                language=request.language,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/checkout/verify-offer")
def checkout_verify_offer(request: OfferRequest, account: dict = Depends(require_buyer)) -> dict:
    _assert_buyer_owner(account, request.buyer_id)
    with get_connection(settings.database_path) as conn:
        try:
            offer = verify_offer(conn, request.variant_id)
            graph = sqlite_graph_path(conn, "offer_truth_path", variant_id=request.variant_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        trace_id = create_trace(
            conn,
            buyer_id=request.buyer_id,
            product_id=None,
            variant_id=request.variant_id,
            intent=["offer_urgency"],
            tools_used=["verify_offer", "traverse_commerce_graph"],
            fact_ids=offer["fact_ids"] + graph["fact_ids"],
            graph_paths=[graph],
        )
        conn.commit()
        return {
            "trace_id": trace_id,
            "offer": offer,
            "graph_path": graph,
        }


@app.post("/orders/simulate")
def simulate_order(request: OutcomeRequest, account: dict = Depends(require_buyer)) -> dict:
    _assert_buyer_owner(account, request.buyer_id)
    with get_connection(settings.database_path) as conn:
        try:
            outcome = record_order_outcome(
                conn,
                request.buyer_id,
                request.variant_id,
                request.status,
                request.return_reason,
            )
            contract_update = None
            if request.contract_id:
                contract_update = complete_expectation_contract(
                    conn,
                    contract_id=request.contract_id,
                    buyer_id=request.buyer_id,
                    outcome_order_id=outcome["order_id"],
                    status=request.status,
                    return_reason=request.return_reason,
                )
                conn.commit()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        graph_status = _sync_graph_best_effort()
        return {
            "outcome": outcome,
            "expectation_contract": contract_update,
            "graph_sync": graph_status,
            "memory": list_fit_memory(conn, request.buyer_id),
        }


@app.post("/orders/{order_id}/outcome")
def confirm_order_outcome(
    order_id: str,
    request: OutcomeRequest,
    account: dict = Depends(require_buyer),
) -> dict:
    result = simulate_order(request, account)
    result["confirmed_order_reference"] = order_id
    return result


@app.get("/buyers/{buyer_id}/privacy")
def buyer_privacy(buyer_id: str, account: dict = Depends(require_buyer)) -> dict:
    _assert_buyer_owner(account, buyer_id)
    with get_connection(settings.database_path) as conn:
        return privacy_summary(conn, buyer_id)


@app.get("/buyers/{buyer_id}/memory")
def buyer_memory(buyer_id: str, account: dict = Depends(require_buyer)) -> dict:
    _assert_buyer_owner(account, buyer_id)
    with get_connection(settings.database_path) as conn:
        return {
            "buyer_id": buyer_id,
            "memory": list_fit_memory(conn, buyer_id),
            "privacy": privacy_summary(conn, buyer_id),
        }


@app.patch("/buyers/{buyer_id}/memory")
def buyer_patch_memory(
    buyer_id: str,
    request: MemoryPatchRequest,
    account: dict = Depends(require_buyer),
) -> dict:
    _assert_buyer_owner(account, buyer_id)
    with get_connection(settings.database_path) as conn:
        return update_memory_settings(
            conn,
            buyer_id,
            fit_memory_enabled=request.fit_memory_enabled,
            preferred_fit=request.preferred_fit,
        )


@app.delete("/buyers/{buyer_id}/memory")
def buyer_delete_memory(buyer_id: str, account: dict = Depends(require_buyer)) -> dict:
    _assert_buyer_owner(account, buyer_id)
    with get_connection(settings.database_path) as conn:
        return delete_personal_memory(conn, buyer_id)


@app.get("/audit/{trace_id}")
def audit(trace_id: str, account: dict = Depends(require_buyer)) -> dict:
    with get_connection(settings.database_path) as conn:
        trace = get_trace(conn, trace_id)
        if not trace:
            raise HTTPException(status_code=404, detail="Trace not found")
        _assert_buyer_owner(account, trace["buyer_id"])
        return trace


def _sync_graph_best_effort() -> dict:
    client = get_neo4j_client()
    try:
        if not client.status.available:
            return {
                "available": False,
                "reason": client.status.reason,
            }
        with get_connection(settings.database_path) as conn:
            return sync_neo4j_from_sqlite(conn, client)
    finally:
        client.close()
