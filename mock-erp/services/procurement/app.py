"""Procurement Service - purchase orders, suppliers, receiving."""

import copy
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.models import Address, ErrorResponse, POStatus, PaginatedResponse, paginate
from services.procurement.mock_data import PURCHASE_ORDERS, RECEIVING_RECORDS, SUPPLIERS

app = FastAPI(
    title="ERP Procurement Service",
    description=(
        "Manages purchase orders, supplier relationships, and goods receiving. "
        "Part of the ERP Agentic Service Mesh mock backend."
    ),
    version="1.0.0",
)

# ---- Pydantic Models ----

class Supplier(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    contact_person: str
    address: Address
    payment_terms: str
    lead_time_days: int
    rating: float
    categories: List[str]
    status: str
    created_at: str


class POLineItem(BaseModel):
    line_number: int
    sku: str
    product_name: str
    quantity_ordered: int
    quantity_received: int
    unit_price: float
    total: float
    unit: str


class PurchaseOrderSummary(BaseModel):
    id: str
    supplier_id: str
    supplier_name: str
    status: str
    order_date: str
    expected_date: str
    total: float
    currency: str


class PurchaseOrderDetail(BaseModel):
    id: str
    supplier_id: str
    supplier_name: str
    status: str
    order_date: str
    expected_date: str
    line_items: List[POLineItem]
    subtotal: float
    tax: float
    shipping_cost: float
    total: float
    currency: str
    approved_by: Optional[str]
    approved_at: Optional[str]
    notes: str
    created_at: str
    updated_at: str


class POLineItemCreate(BaseModel):
    sku: str
    product_name: str
    quantity: int = Field(..., gt=0)
    unit_price: float = Field(..., gt=0)
    unit: str = "EA"


class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    expected_date: str
    line_items: List[POLineItemCreate]
    notes: str = ""


class ReceivingItemInput(BaseModel):
    sku: str
    quantity_received: int
    quantity_rejected: int = 0
    inspection_status: str = "pending"


class ReceivingCreate(BaseModel):
    purchase_order_id: str
    warehouse_id: str
    items: List[ReceivingItemInput]
    notes: str = ""


class ReceivingItem(BaseModel):
    sku: str
    quantity_expected: int
    quantity_received: int
    quantity_rejected: int
    inspection_status: str


class ReceivingRecord(BaseModel):
    id: str
    purchase_order_id: str
    supplier_id: str
    warehouse_id: str
    received_date: str
    items: List[ReceivingItem]
    status: str
    received_by: str
    notes: str
    created_at: str


# ---- In-memory store ----

_purchase_orders = copy.deepcopy(PURCHASE_ORDERS)
_suppliers = copy.deepcopy(SUPPLIERS)
_receiving = copy.deepcopy(RECEIVING_RECORDS)


# ---- Endpoints ----

@app.get("/api/v1/purchase-orders", response_model=PaginatedResponse[PurchaseOrderSummary], tags=["Purchase Orders"])
def list_purchase_orders(
    status: Optional[str] = Query(None, description="Filter by PO status"),
    supplier_id: Optional[str] = Query(None, description="Filter by supplier ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List all purchase orders with optional filters."""
    result = _purchase_orders
    if status:
        result = [po for po in result if po["status"] == status]
    if supplier_id:
        result = [po for po in result if po["supplier_id"] == supplier_id]

    summaries = [
        {
            "id": po["id"],
            "supplier_id": po["supplier_id"],
            "supplier_name": po["supplier_name"],
            "status": po["status"],
            "order_date": po["order_date"],
            "expected_date": po["expected_date"],
            "total": po["total"],
            "currency": po["currency"],
        }
        for po in result
    ]
    return paginate(summaries, page, page_size)


@app.get(
    "/api/v1/purchase-orders/{po_id}",
    response_model=PurchaseOrderDetail,
    responses={404: {"model": ErrorResponse}},
    tags=["Purchase Orders"],
)
def get_purchase_order(po_id: str):
    """Get detailed information for a specific purchase order."""
    for po in _purchase_orders:
        if po["id"] == po_id:
            return po
    raise HTTPException(status_code=404, detail=f"Purchase order {po_id} not found")


@app.post("/api/v1/purchase-orders", response_model=PurchaseOrderDetail, status_code=201, tags=["Purchase Orders"])
def create_purchase_order(payload: PurchaseOrderCreate):
    """Create a new purchase order."""
    supplier = next((s for s in _suppliers if s["id"] == payload.supplier_id), None)
    if not supplier:
        raise HTTPException(status_code=400, detail=f"Supplier {payload.supplier_id} not found")

    seq = len(_purchase_orders) + 214
    now = datetime.utcnow().isoformat() + "Z"

    line_items = []
    for idx, li in enumerate(payload.line_items, 1):
        total = round(li.quantity * li.unit_price, 2)
        line_items.append({
            "line_number": idx,
            "sku": li.sku,
            "product_name": li.product_name,
            "quantity_ordered": li.quantity,
            "quantity_received": 0,
            "unit_price": li.unit_price,
            "total": total,
            "unit": li.unit,
        })

    subtotal = sum(li["total"] for li in line_items)
    tax = round(subtotal * 0.08, 2)
    shipping = 500.00

    po = {
        "id": f"PO-2024-{seq:05d}",
        "supplier_id": payload.supplier_id,
        "supplier_name": supplier["name"],
        "status": "draft",
        "order_date": datetime.utcnow().strftime("%Y-%m-%d"),
        "expected_date": payload.expected_date,
        "line_items": line_items,
        "subtotal": subtotal,
        "tax": tax,
        "shipping_cost": shipping,
        "total": round(subtotal + tax + shipping, 2),
        "currency": "USD",
        "approved_by": None,
        "approved_at": None,
        "notes": payload.notes,
        "created_at": now,
        "updated_at": now,
    }
    _purchase_orders.append(po)
    return po


@app.put(
    "/api/v1/purchase-orders/{po_id}/approve",
    response_model=PurchaseOrderDetail,
    responses={404: {"model": ErrorResponse}, 400: {"model": ErrorResponse}},
    tags=["Purchase Orders"],
)
def approve_purchase_order(po_id: str):
    """Approve a purchase order (changes status from draft/pending_approval to approved)."""
    for po in _purchase_orders:
        if po["id"] == po_id:
            if po["status"] not in ("draft", "pending_approval"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot approve PO in status '{po['status']}'. Must be 'draft' or 'pending_approval'.",
                )
            po["status"] = "approved"
            po["approved_by"] = "api_approver"
            po["approved_at"] = datetime.utcnow().isoformat() + "Z"
            po["updated_at"] = datetime.utcnow().isoformat() + "Z"
            return po
    raise HTTPException(status_code=404, detail=f"Purchase order {po_id} not found")


@app.get("/api/v1/suppliers", response_model=PaginatedResponse[Supplier], tags=["Suppliers"])
def list_suppliers(
    status: Optional[str] = Query(None, description="Filter by status"),
    category: Optional[str] = Query(None, description="Filter by supply category"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List all suppliers with optional filters."""
    result = _suppliers
    if status:
        result = [s for s in result if s["status"] == status]
    if category:
        result = [s for s in result if category in s.get("categories", [])]
    return paginate(result, page, page_size)


@app.get(
    "/api/v1/suppliers/{supplier_id}",
    response_model=Supplier,
    responses={404: {"model": ErrorResponse}},
    tags=["Suppliers"],
)
def get_supplier(supplier_id: str):
    """Get detailed information for a specific supplier."""
    for s in _suppliers:
        if s["id"] == supplier_id:
            return s
    raise HTTPException(status_code=404, detail=f"Supplier {supplier_id} not found")


@app.post("/api/v1/receiving", response_model=ReceivingRecord, status_code=201, tags=["Receiving"])
def receive_goods(payload: ReceivingCreate):
    """Record goods received against a purchase order."""
    po = next((p for p in _purchase_orders if p["id"] == payload.purchase_order_id), None)
    if not po:
        raise HTTPException(status_code=400, detail=f"Purchase order {payload.purchase_order_id} not found")

    seq = len(_receiving) + 602
    now = datetime.utcnow().isoformat() + "Z"

    items = []
    for item in payload.items:
        po_line = next((li for li in po["line_items"] if li["sku"] == item.sku), None)
        qty_expected = po_line["quantity_ordered"] if po_line else 0
        items.append({
            "sku": item.sku,
            "quantity_expected": qty_expected,
            "quantity_received": item.quantity_received,
            "quantity_rejected": item.quantity_rejected,
            "inspection_status": item.inspection_status,
        })

        # update PO line received qty
        if po_line:
            po_line["quantity_received"] += item.quantity_received

    # update PO status
    all_received = all(
        li["quantity_received"] >= li["quantity_ordered"] for li in po["line_items"]
    )
    any_received = any(li["quantity_received"] > 0 for li in po["line_items"])
    if all_received:
        po["status"] = "received"
    elif any_received:
        po["status"] = "partially_received"

    record = {
        "id": f"RCV-2024-{seq:05d}",
        "purchase_order_id": payload.purchase_order_id,
        "supplier_id": po["supplier_id"],
        "warehouse_id": payload.warehouse_id,
        "received_date": datetime.utcnow().strftime("%Y-%m-%d"),
        "items": items,
        "status": "completed",
        "received_by": "api_receiver",
        "notes": payload.notes,
        "created_at": now,
    }
    _receiving.append(record)
    return record
