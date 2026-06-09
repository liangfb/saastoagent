"""Product Catalog Service - products, categories, pricing, BOM."""

import copy
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.models import ErrorResponse, PaginatedResponse, paginate
from services.product_catalog.mock_data import (
    BOMS,
    CATEGORIES,
    DEFAULT_PRICING_TEMPLATE,
    PRICING,
    PRODUCTS,
)

app = FastAPI(
    title="ERP Product Catalog Service",
    description=(
        "Manages the product master data, categories, pricing tiers, and bills of materials. "
        "Part of the ERP Agentic Service Mesh mock backend."
    ),
    version="1.0.0",
)

# ---- Pydantic Models ----

class Dimensions(BaseModel):
    length_cm: float
    width_cm: float
    height_cm: float


class ProductSummary(BaseModel):
    id: str
    sku: str
    name: str
    category_name: str
    base_price: float
    currency: str
    status: str


class ProductDetail(BaseModel):
    id: str
    sku: str
    name: str
    description: str
    category_id: str
    category_name: str
    unit: str
    weight_kg: float
    dimensions: Dimensions
    base_price: float
    cost: float
    currency: str
    status: str
    min_order_quantity: int
    lead_time_days: int
    created_at: str
    updated_at: str


class ProductCreate(BaseModel):
    sku: str
    name: str
    description: str
    category_id: str
    unit: str = "EA"
    weight_kg: float = 0.0
    dimensions: Optional[Dimensions] = None
    base_price: float
    cost: float
    min_order_quantity: int = 1
    lead_time_days: int = 7


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category_id: Optional[str] = None
    base_price: Optional[float] = None
    cost: Optional[float] = None
    status: Optional[str] = None
    min_order_quantity: Optional[int] = None
    lead_time_days: Optional[int] = None


class CategoryNode(BaseModel):
    id: str
    name: str
    parent_id: Optional[str]
    children: List["CategoryNode"] = []


CategoryNode.model_rebuild()


class BOMComponent(BaseModel):
    sku: str
    name: str
    quantity: int
    unit: str
    unit_cost: float


class BillOfMaterials(BaseModel):
    product_id: str
    product_sku: str
    product_name: str
    revision: str
    effective_date: str
    components: List[BOMComponent]
    total_component_cost: float
    labor_cost: float
    overhead_cost: float
    total_cost: float


class PricingTier(BaseModel):
    min_quantity: int
    max_quantity: Optional[int]
    unit_price: float
    discount_pct: float


class ProductPricing(BaseModel):
    product_id: str
    sku: str
    base_price: float
    currency: str
    tiers: List[PricingTier]


# ---- In-memory store ----

_products = copy.deepcopy(PRODUCTS)
_categories = copy.deepcopy(CATEGORIES)
_boms = copy.deepcopy(BOMS)
_pricing = copy.deepcopy(PRICING)


# ---- Helpers ----

def _find_category_name(cat_id: str) -> str:
    """Walk category tree to find a name by id."""
    for top in _categories:
        if top["id"] == cat_id:
            return top["name"]
        for child in top.get("children", []):
            if child["id"] == cat_id:
                return child["name"]
    return "Unknown"


# ---- Endpoints ----

@app.get("/api/v1/products", response_model=PaginatedResponse[ProductSummary], tags=["Products"])
def list_products(
    category_id: Optional[str] = Query(None, description="Filter by category ID"),
    status: Optional[str] = Query(None, description="Filter by status (active/inactive)"),
    search: Optional[str] = Query(None, description="Search by name or SKU"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List products with optional filters."""
    result = _products
    if category_id:
        result = [p for p in result if p["category_id"] == category_id]
    if status:
        result = [p for p in result if p["status"] == status]
    if search:
        q = search.lower()
        result = [p for p in result if q in p["name"].lower() or q in p["sku"].lower()]

    summaries = [
        {
            "id": p["id"],
            "sku": p["sku"],
            "name": p["name"],
            "category_name": p["category_name"],
            "base_price": p["base_price"],
            "currency": p["currency"],
            "status": p["status"],
        }
        for p in result
    ]
    return paginate(summaries, page, page_size)


@app.get(
    "/api/v1/products/{product_id}",
    response_model=ProductDetail,
    responses={404: {"model": ErrorResponse}},
    tags=["Products"],
)
def get_product(product_id: str):
    """Get full detail for a product."""
    for p in _products:
        if p["id"] == product_id:
            return p
    raise HTTPException(status_code=404, detail=f"Product {product_id} not found")


@app.post("/api/v1/products", response_model=ProductDetail, status_code=201, tags=["Products"])
def create_product(payload: ProductCreate):
    """Create a new product in the catalog."""
    seq = len(_products) + 9
    now = datetime.utcnow().isoformat() + "Z"

    product = {
        "id": f"PROD-{seq:03d}",
        "sku": payload.sku,
        "name": payload.name,
        "description": payload.description,
        "category_id": payload.category_id,
        "category_name": _find_category_name(payload.category_id),
        "unit": payload.unit,
        "weight_kg": payload.weight_kg,
        "dimensions": payload.dimensions.model_dump() if payload.dimensions else {"length_cm": 0, "width_cm": 0, "height_cm": 0},
        "base_price": payload.base_price,
        "cost": payload.cost,
        "currency": "USD",
        "status": "active",
        "min_order_quantity": payload.min_order_quantity,
        "lead_time_days": payload.lead_time_days,
        "created_at": now,
        "updated_at": now,
    }
    _products.append(product)
    return product


@app.put(
    "/api/v1/products/{product_id}",
    response_model=ProductDetail,
    responses={404: {"model": ErrorResponse}},
    tags=["Products"],
)
def update_product(product_id: str, payload: ProductUpdate):
    """Update an existing product's attributes."""
    for p in _products:
        if p["id"] == product_id:
            update_data = payload.model_dump(exclude_unset=True)
            for key, value in update_data.items():
                if key == "category_id":
                    p["category_id"] = value
                    p["category_name"] = _find_category_name(value)
                else:
                    p[key] = value
            p["updated_at"] = datetime.utcnow().isoformat() + "Z"
            return p
    raise HTTPException(status_code=404, detail=f"Product {product_id} not found")


@app.get("/api/v1/categories", response_model=List[CategoryNode], tags=["Categories"])
def list_categories():
    """Get the full category tree structure."""
    return _categories


@app.get(
    "/api/v1/products/{product_id}/bom",
    response_model=BillOfMaterials,
    responses={404: {"model": ErrorResponse}},
    tags=["Bill of Materials"],
)
def get_bom(product_id: str):
    """Get the bill of materials for a product."""
    if product_id in _boms:
        return _boms[product_id]
    # check product exists
    prod = next((p for p in _products if p["id"] == product_id), None)
    if not prod:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")
    raise HTTPException(status_code=404, detail=f"No BOM defined for product {product_id}")


@app.get(
    "/api/v1/products/{product_id}/pricing",
    response_model=ProductPricing,
    responses={404: {"model": ErrorResponse}},
    tags=["Pricing"],
)
def get_pricing(product_id: str):
    """Get pricing tiers for a product."""
    if product_id in _pricing:
        return _pricing[product_id]
    # check product exists, return default pricing
    prod = next((p for p in _products if p["id"] == product_id), None)
    if not prod:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")
    return {
        "product_id": prod["id"],
        "sku": prod["sku"],
        "base_price": prod["base_price"],
        "currency": prod["currency"],
        "tiers": [
            {"min_quantity": 1, "max_quantity": None, "unit_price": prod["base_price"], "discount_pct": 0},
        ],
    }
