"""Sales Order Service - manages orders, customers, quotations, and invoices."""

import copy
import uuid
from datetime import date, datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.models import (
    Address,
    ErrorResponse,
    Money,
    OrderStatus,
    PaginatedResponse,
    paginate,
)
from services.sales_order.mock_data import CUSTOMERS, INVOICES, ORDERS

app = FastAPI(
    title="ERP Sales Order Service",
    description=(
        "Manages sales orders, customers, quotations, and invoices. "
        "Part of the ERP Agentic Service Mesh mock backend."
    ),
    version="1.0.0",
    root_path="",
)


# ---- Pydantic Models ----

class LineItem(BaseModel):
    line_number: int
    sku: str
    product_name: str
    quantity: int
    unit_price: float
    total: float
    unit: str = "EA"


class OrderSummary(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    status: str
    order_date: str
    required_date: str
    subtotal: float
    total: float
    currency: str


class OrderDetail(BaseModel):
    id: str
    customer_id: str
    customer_name: str
    status: str
    order_date: str
    required_date: str
    shipping_address: Address
    line_items: List[LineItem]
    subtotal: float
    tax: float
    shipping_cost: float
    total: float
    currency: str
    payment_terms: str
    notes: str
    created_at: str
    updated_at: str


class OrderCreate(BaseModel):
    customer_id: str
    required_date: str
    shipping_address: Address
    line_items: List[LineItem]
    payment_terms: str = "Net 30"
    notes: str = ""


class StatusUpdate(BaseModel):
    status: OrderStatus


class Customer(BaseModel):
    id: str
    name: str
    email: str
    phone: str
    contact_person: str
    address: Address
    credit_limit: float
    payment_terms: str
    status: str
    created_at: str


class InvoiceLineItem(BaseModel):
    description: str
    quantity: int
    unit_price: float
    total: float


class Invoice(BaseModel):
    id: str
    order_id: str
    customer_id: str
    customer_name: str
    status: str
    invoice_date: str
    due_date: str
    line_items: List[InvoiceLineItem]
    subtotal: float
    tax: float
    total: float
    amount_paid: float
    balance_due: float
    currency: str
    payment_terms: str
    created_at: str


class InvoiceCreate(BaseModel):
    order_id: str
    invoice_date: Optional[str] = None


# ---- In-memory store (copy from mock data) ----

_orders = copy.deepcopy(ORDERS)
_customers = copy.deepcopy(CUSTOMERS)
_invoices = copy.deepcopy(INVOICES)


# ---- Endpoints ----

@app.get("/api/v1/orders", response_model=PaginatedResponse[OrderSummary], tags=["Orders"])
def list_orders(
    status: Optional[str] = Query(None, description="Filter by order status"),
    customer_id: Optional[str] = Query(None, description="Filter by customer ID"),
    date_from: Optional[str] = Query(None, description="Filter orders from this date (YYYY-MM-DD)"),
    date_to: Optional[str] = Query(None, description="Filter orders up to this date (YYYY-MM-DD)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List all sales orders with optional filters."""
    result = _orders
    if status:
        result = [o for o in result if o["status"] == status]
    if customer_id:
        result = [o for o in result if o["customer_id"] == customer_id]
    if date_from:
        result = [o for o in result if o["order_date"] >= date_from]
    if date_to:
        result = [o for o in result if o["order_date"] <= date_to]

    summaries = [
        {
            "id": o["id"],
            "customer_id": o["customer_id"],
            "customer_name": o["customer_name"],
            "status": o["status"],
            "order_date": o["order_date"],
            "required_date": o["required_date"],
            "subtotal": o["subtotal"],
            "total": o["total"],
            "currency": o["currency"],
        }
        for o in result
    ]
    return paginate(summaries, page, page_size)


@app.get(
    "/api/v1/orders/{order_id}",
    response_model=OrderDetail,
    responses={404: {"model": ErrorResponse}},
    tags=["Orders"],
)
def get_order(order_id: str):
    """Get detailed information for a specific sales order including line items."""
    for o in _orders:
        if o["id"] == order_id:
            return o
    raise HTTPException(status_code=404, detail=f"Order {order_id} not found")


@app.post("/api/v1/orders", response_model=OrderDetail, status_code=201, tags=["Orders"])
def create_order(payload: OrderCreate):
    """Create a new sales order."""
    seq = len(_orders) + 128
    order_id = f"SO-2024-{seq:05d}"
    now = datetime.utcnow().isoformat() + "Z"
    subtotal = sum(li.total for li in payload.line_items)
    tax = round(subtotal * 0.08, 2)
    shipping = 150.00

    customer = next((c for c in _customers if c["id"] == payload.customer_id), None)
    if not customer:
        raise HTTPException(status_code=400, detail=f"Customer {payload.customer_id} not found")

    order = {
        "id": order_id,
        "customer_id": payload.customer_id,
        "customer_name": customer["name"],
        "status": "draft",
        "order_date": date.today().isoformat(),
        "required_date": payload.required_date,
        "shipping_address": payload.shipping_address.model_dump(),
        "line_items": [li.model_dump() for li in payload.line_items],
        "subtotal": subtotal,
        "tax": tax,
        "shipping_cost": shipping,
        "total": round(subtotal + tax + shipping, 2),
        "currency": "USD",
        "payment_terms": payload.payment_terms,
        "notes": payload.notes,
        "created_at": now,
        "updated_at": now,
    }
    _orders.append(order)
    return order


@app.put(
    "/api/v1/orders/{order_id}/status",
    response_model=OrderDetail,
    responses={404: {"model": ErrorResponse}},
    tags=["Orders"],
)
def update_order_status(order_id: str, payload: StatusUpdate):
    """Update the status of a sales order."""
    for o in _orders:
        if o["id"] == order_id:
            o["status"] = payload.status.value
            o["updated_at"] = datetime.utcnow().isoformat() + "Z"
            return o
    raise HTTPException(status_code=404, detail=f"Order {order_id} not found")


@app.get("/api/v1/customers", response_model=PaginatedResponse[Customer], tags=["Customers"])
def list_customers(
    status: Optional[str] = Query(None, description="Filter by status (active/inactive)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List all customers."""
    result = _customers
    if status:
        result = [c for c in result if c["status"] == status]
    return paginate(result, page, page_size)


@app.get(
    "/api/v1/customers/{customer_id}",
    response_model=Customer,
    responses={404: {"model": ErrorResponse}},
    tags=["Customers"],
)
def get_customer(customer_id: str):
    """Get detailed information for a specific customer."""
    for c in _customers:
        if c["id"] == customer_id:
            return c
    raise HTTPException(status_code=404, detail=f"Customer {customer_id} not found")


@app.get("/api/v1/invoices", response_model=PaginatedResponse[Invoice], tags=["Invoices"])
def list_invoices(
    status: Optional[str] = Query(None, description="Filter by invoice status"),
    customer_id: Optional[str] = Query(None, description="Filter by customer ID"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List all invoices."""
    result = _invoices
    if status:
        result = [i for i in result if i["status"] == status]
    if customer_id:
        result = [i for i in result if i["customer_id"] == customer_id]
    return paginate(result, page, page_size)


@app.post("/api/v1/invoices", response_model=Invoice, status_code=201, tags=["Invoices"])
def create_invoice(payload: InvoiceCreate):
    """Create a new invoice from an existing sales order."""
    order = next((o for o in _orders if o["id"] == payload.order_id), None)
    if not order:
        raise HTTPException(status_code=400, detail=f"Order {payload.order_id} not found")

    seq = len(_invoices) + 504
    inv_date = payload.invoice_date or date.today().isoformat()
    now = datetime.utcnow().isoformat() + "Z"

    invoice = {
        "id": f"INV-2024-{seq:05d}",
        "order_id": order["id"],
        "customer_id": order["customer_id"],
        "customer_name": order["customer_name"],
        "status": "draft",
        "invoice_date": inv_date,
        "due_date": inv_date,  # simplified
        "line_items": [
            {
                "description": f"{li['product_name']} ({order['id']})",
                "quantity": li["quantity"],
                "unit_price": li["unit_price"],
                "total": li["total"],
            }
            for li in order["line_items"]
        ],
        "subtotal": order["subtotal"],
        "tax": order["tax"],
        "total": round(order["subtotal"] + order["tax"], 2),
        "amount_paid": 0.00,
        "balance_due": round(order["subtotal"] + order["tax"], 2),
        "currency": order["currency"],
        "payment_terms": order["payment_terms"],
        "created_at": now,
    }
    _invoices.append(invoice)
    return invoice
