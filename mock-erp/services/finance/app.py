"""Finance Service - accounts, journal entries, payments, AP/AR."""

import copy
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Security
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, Field

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.models import ErrorResponse, PaginatedResponse, paginate
from services.finance.mock_data import (
    ACCOUNTS,
    ACCOUNTS_PAYABLE,
    ACCOUNTS_RECEIVABLE,
    JOURNAL_ENTRIES,
    PAYMENTS,
)

# ---- API key auth (finance service only) ----
# The MCP runtime auth-injector supplies the key as a request header named by
# API_KEY_NAME with value API_KEY_VALUE (see mcp-runtime/src/auth-injector.ts).
# We use the conventional X-API-Key header here.
API_KEY_HEADER_NAME = "X-API-Key"
# Expected key comes from the environment, with a dev-only default.
EXPECTED_API_KEY = os.environ.get("FINANCE_API_KEY", "dev-finance-key")

_api_key_header = APIKeyHeader(name=API_KEY_HEADER_NAME, auto_error=False)


def require_api_key(api_key: Optional[str] = Security(_api_key_header)) -> None:
    """Reject requests that do not present the correct X-API-Key header."""
    if not api_key or api_key != EXPECTED_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


app = FastAPI(
    title="ERP Finance Service",
    description=(
        "Manages chart of accounts, journal entries, payments, and accounts receivable/payable reporting. "
        "Part of the ERP Agentic Service Mesh mock backend."
    ),
    version="1.0.0",
)

# Data endpoints are registered on this router, which requires the API key.
# Docs/openapi.json (and /redoc) are served by FastAPI itself, not this router,
# so they remain publicly accessible for the unauthenticated "Load from URL" flow.
router = APIRouter(dependencies=[Depends(require_api_key)])

# ---- Pydantic Models ----

class Account(BaseModel):
    code: str
    name: str
    type: str
    subtype: str
    balance: float
    currency: str


class JournalLine(BaseModel):
    account_code: str
    account_name: str
    debit: float
    credit: float


class JournalEntry(BaseModel):
    id: str
    date: str
    description: str
    reference: str
    status: str
    lines: List[JournalLine]
    total_debit: float
    total_credit: float
    created_by: str
    created_at: str


class JournalLineCreate(BaseModel):
    account_code: str
    debit: float = 0.0
    credit: float = 0.0


class JournalEntryCreate(BaseModel):
    date: str
    description: str
    reference: str = ""
    lines: List[JournalLineCreate]


class Payment(BaseModel):
    id: str
    type: str
    amount: float
    currency: str
    method: str
    reference: str
    status: str
    date: str
    created_at: str
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    invoice_id: Optional[str] = None


class PaymentCreate(BaseModel):
    type: str = Field(..., description="'received' (from customer) or 'sent' (to supplier)")
    entity_id: str = Field(..., description="Customer ID or Supplier ID")
    entity_name: str
    invoice_id: Optional[str] = None
    amount: float = Field(..., gt=0)
    method: str = "wire_transfer"
    reference: str = ""


class ARAgingRecord(BaseModel):
    customer_id: str
    customer_name: str
    total_outstanding: float
    current: float
    days_1_30: float
    days_31_60: float
    days_61_90: float
    days_over_90: float
    credit_limit: float
    last_payment_date: Optional[str]


class APAgingRecord(BaseModel):
    supplier_id: str
    supplier_name: str
    total_outstanding: float
    current: float
    days_1_30: float
    days_31_60: float
    days_61_90: float
    days_over_90: float
    payment_terms: str
    next_due_date: Optional[str]


# ---- In-memory store ----

_accounts = copy.deepcopy(ACCOUNTS)
_journal_entries = copy.deepcopy(JOURNAL_ENTRIES)
_payments = copy.deepcopy(PAYMENTS)
_ar = copy.deepcopy(ACCOUNTS_RECEIVABLE)
_ap = copy.deepcopy(ACCOUNTS_PAYABLE)


# ---- Endpoints ----

@router.get("/api/v1/accounts", response_model=PaginatedResponse[Account], tags=["Chart of Accounts"])
def list_accounts(
    type: Optional[str] = Query(None, description="Filter by account type (asset, liability, equity, revenue, expense)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """Get the chart of accounts, optionally filtered by type."""
    result = _accounts
    if type:
        result = [a for a in result if a["type"] == type]
    return paginate(result, page, page_size)


@router.get("/api/v1/journal-entries", response_model=PaginatedResponse[JournalEntry], tags=["Journal Entries"])
def list_journal_entries(
    date_from: Optional[str] = Query(None, description="Filter from date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter to date (YYYY-MM-DD)"),
    reference: Optional[str] = Query(None, description="Filter by reference"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List journal entries with optional filters."""
    result = _journal_entries
    if date_from:
        result = [je for je in result if je["date"] >= date_from]
    if date_to:
        result = [je for je in result if je["date"] <= date_to]
    if reference:
        result = [je for je in result if reference.lower() in je["reference"].lower()]
    return paginate(result, page, page_size)


@router.post("/api/v1/journal-entries", response_model=JournalEntry, status_code=201, tags=["Journal Entries"])
def create_journal_entry(payload: JournalEntryCreate):
    """Create a new journal entry. Debits must equal credits."""
    total_debit = sum(l.debit for l in payload.lines)
    total_credit = sum(l.credit for l in payload.lines)

    if abs(total_debit - total_credit) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Journal entry is unbalanced: debits={total_debit}, credits={total_credit}",
        )

    seq = len(_journal_entries) + 1206
    now = datetime.utcnow().isoformat() + "Z"

    # resolve account names
    acct_map = {a["code"]: a["name"] for a in _accounts}
    lines = []
    for l in payload.lines:
        lines.append({
            "account_code": l.account_code,
            "account_name": acct_map.get(l.account_code, "Unknown Account"),
            "debit": l.debit,
            "credit": l.credit,
        })

    je = {
        "id": f"JE-2024-{seq:06d}",
        "date": payload.date,
        "description": payload.description,
        "reference": payload.reference,
        "status": "posted",
        "lines": lines,
        "total_debit": total_debit,
        "total_credit": total_credit,
        "created_by": "api",
        "created_at": now,
    }
    _journal_entries.append(je)
    return je


@router.get("/api/v1/payments", response_model=PaginatedResponse[Payment], tags=["Payments"])
def list_payments(
    type: Optional[str] = Query(None, description="Filter by type (received/sent)"),
    date_from: Optional[str] = Query(None, description="Filter from date"),
    date_to: Optional[str] = Query(None, description="Filter to date"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List payments with optional filters."""
    result = _payments
    if type:
        result = [p for p in result if p["type"] == type]
    if date_from:
        result = [p for p in result if p["date"] >= date_from]
    if date_to:
        result = [p for p in result if p["date"] <= date_to]
    return paginate(result, page, page_size)


@router.post("/api/v1/payments", response_model=Payment, status_code=201, tags=["Payments"])
def create_payment(payload: PaymentCreate):
    """Record a payment (received from customer or sent to supplier)."""
    seq = len(_payments) + 804
    now = datetime.utcnow().isoformat() + "Z"
    today = datetime.utcnow().strftime("%Y-%m-%d")

    payment = {
        "id": f"PMT-2024-{seq:05d}",
        "type": payload.type,
        "amount": payload.amount,
        "currency": "USD",
        "method": payload.method,
        "reference": payload.reference,
        "status": "completed",
        "date": today,
        "created_at": now,
        "invoice_id": payload.invoice_id,
    }

    if payload.type == "received":
        payment["customer_id"] = payload.entity_id
        payment["customer_name"] = payload.entity_name
        payment["supplier_id"] = None
        payment["supplier_name"] = None
    else:
        payment["supplier_id"] = payload.entity_id
        payment["supplier_name"] = payload.entity_name
        payment["customer_id"] = None
        payment["customer_name"] = None

    _payments.append(payment)
    return payment


@router.get("/api/v1/accounts-receivable", response_model=List[ARAgingRecord], tags=["Accounts Receivable"])
def get_ar_aging(
    customer_id: Optional[str] = Query(None, description="Filter by customer ID"),
):
    """Get accounts receivable aging report."""
    result = _ar
    if customer_id:
        result = [r for r in result if r["customer_id"] == customer_id]
    return result


@router.get("/api/v1/accounts-payable", response_model=List[APAgingRecord], tags=["Accounts Payable"])
def get_ap_aging(
    supplier_id: Optional[str] = Query(None, description="Filter by supplier ID"),
):
    """Get accounts payable aging report."""
    result = _ap
    if supplier_id:
        result = [r for r in result if r["supplier_id"] == supplier_id]
    return result


# Register the API-key-protected data routes. Docs (/docs, /redoc) and the
# OpenAPI schema (/openapi.json) are not part of this router and stay public.
app.include_router(router)
