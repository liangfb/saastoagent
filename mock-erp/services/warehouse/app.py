"""Warehouse Management Service - inventory, warehouses, stock movements, picking/packing."""

import copy
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from shared.models import (
    Address,
    ErrorResponse,
    MovementType,
    PaginatedResponse,
    PickingStatus,
    paginate,
)
from services.warehouse.mock_data import INVENTORY, PICKING_TASKS, STOCK_MOVEMENTS, WAREHOUSES

app = FastAPI(
    title="ERP Warehouse Management Service",
    description=(
        "Manages warehouses, inventory levels, stock movements, and picking/packing tasks. "
        "Part of the ERP Agentic Service Mesh mock backend."
    ),
    version="1.0.0",
)

# ---- Pydantic Models ----

class WarehouseZone(BaseModel):
    code: str
    name: str
    type: str
    temperature: str


class WarehouseSummary(BaseModel):
    id: str
    name: str
    type: str
    status: str
    total_capacity_sqft: int
    used_capacity_sqft: int


class WarehouseDetail(BaseModel):
    id: str
    name: str
    location: Address
    type: str
    total_capacity_sqft: int
    used_capacity_sqft: int
    zones: List[WarehouseZone]
    status: str
    manager: str


class InventoryItem(BaseModel):
    sku: str
    product_name: str
    warehouse_id: str
    zone: str
    location_bin: str
    quantity_on_hand: int
    quantity_reserved: int
    quantity_available: int
    reorder_point: int
    reorder_quantity: int
    unit: str
    last_counted: str
    unit_cost: float


class StockAdjustment(BaseModel):
    sku: str
    warehouse_id: str
    quantity_change: int = Field(..., description="Positive for increase, negative for decrease")
    reason: str


class StockMovementCreate(BaseModel):
    type: MovementType
    sku: str
    from_warehouse: Optional[str] = None
    to_warehouse: Optional[str] = None
    quantity: int = Field(..., gt=0)
    reference: str


class StockMovement(BaseModel):
    id: str
    type: str
    sku: str
    product_name: str
    from_warehouse: Optional[str]
    to_warehouse: Optional[str]
    quantity: int
    reference: str
    status: str
    created_by: str
    created_at: str
    completed_at: Optional[str]


class PickingItem(BaseModel):
    sku: str
    location_bin: str
    quantity_requested: int
    quantity_picked: int


class PickingTask(BaseModel):
    id: str
    order_id: str
    warehouse_id: str
    status: str
    assigned_to: Optional[str]
    items: List[PickingItem]
    priority: str
    created_at: str
    started_at: Optional[str]
    completed_at: Optional[str]


class PickingTaskCreate(BaseModel):
    order_id: str
    warehouse_id: str
    items: List[dict]
    priority: str = "medium"


# ---- In-memory store ----

_warehouses = copy.deepcopy(WAREHOUSES)
_inventory = copy.deepcopy(INVENTORY)
_movements = copy.deepcopy(STOCK_MOVEMENTS)
_picking_tasks = copy.deepcopy(PICKING_TASKS)


# ---- Endpoints ----

@app.get("/api/v1/warehouses", response_model=PaginatedResponse[WarehouseSummary], tags=["Warehouses"])
def list_warehouses(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    """List all warehouses with summary information."""
    summaries = [
        {
            "id": w["id"],
            "name": w["name"],
            "type": w["type"],
            "status": w["status"],
            "total_capacity_sqft": w["total_capacity_sqft"],
            "used_capacity_sqft": w["used_capacity_sqft"],
        }
        for w in _warehouses
    ]
    return paginate(summaries, page, page_size)


@app.get(
    "/api/v1/warehouses/{warehouse_id}",
    response_model=WarehouseDetail,
    responses={404: {"model": ErrorResponse}},
    tags=["Warehouses"],
)
def get_warehouse(warehouse_id: str):
    """Get warehouse detail with zone information."""
    for w in _warehouses:
        if w["id"] == warehouse_id:
            return w
    raise HTTPException(status_code=404, detail=f"Warehouse {warehouse_id} not found")


@app.get("/api/v1/inventory", response_model=PaginatedResponse[InventoryItem], tags=["Inventory"])
def list_inventory(
    warehouse_id: Optional[str] = Query(None, description="Filter by warehouse"),
    sku: Optional[str] = Query(None, description="Filter by product SKU"),
    below_reorder: Optional[bool] = Query(None, description="Show only items below reorder point"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List inventory across warehouses with optional filters."""
    result = _inventory
    if warehouse_id:
        result = [i for i in result if i["warehouse_id"] == warehouse_id]
    if sku:
        result = [i for i in result if i["sku"] == sku]
    if below_reorder:
        result = [i for i in result if i["quantity_available"] < i["reorder_point"]]
    return paginate(result, page, page_size)


@app.get(
    "/api/v1/inventory/{sku}",
    response_model=List[InventoryItem],
    responses={404: {"model": ErrorResponse}},
    tags=["Inventory"],
)
def get_inventory_by_sku(sku: str):
    """Get stock levels for a specific SKU across all warehouses."""
    items = [i for i in _inventory if i["sku"] == sku]
    if not items:
        raise HTTPException(status_code=404, detail=f"No inventory found for SKU {sku}")
    return items


@app.post("/api/v1/inventory/adjust", response_model=InventoryItem, tags=["Inventory"])
def adjust_stock(payload: StockAdjustment):
    """Perform a stock adjustment (increase or decrease) for a specific SKU in a warehouse."""
    for inv in _inventory:
        if inv["sku"] == payload.sku and inv["warehouse_id"] == payload.warehouse_id:
            inv["quantity_on_hand"] += payload.quantity_change
            inv["quantity_available"] += payload.quantity_change
            inv["last_counted"] = datetime.utcnow().strftime("%Y-%m-%d")

            # record movement
            seq = len(_movements) + 305
            _movements.append({
                "id": f"SM-2024-{seq:05d}",
                "type": "adjustment",
                "sku": payload.sku,
                "product_name": inv["product_name"],
                "from_warehouse": payload.warehouse_id if payload.quantity_change < 0 else None,
                "to_warehouse": payload.warehouse_id if payload.quantity_change > 0 else None,
                "quantity": payload.quantity_change,
                "reference": f"ADJ - {payload.reason}",
                "status": "completed",
                "created_by": "api",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "completed_at": datetime.utcnow().isoformat() + "Z",
            })
            return inv
    raise HTTPException(
        status_code=404,
        detail=f"Inventory record not found for SKU {payload.sku} in warehouse {payload.warehouse_id}",
    )


@app.get("/api/v1/stock-movements", response_model=PaginatedResponse[StockMovement], tags=["Stock Movements"])
def list_stock_movements(
    type: Optional[str] = Query(None, description="Filter by movement type"),
    warehouse_id: Optional[str] = Query(None, description="Filter by warehouse (from or to)"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List stock movements with optional filters."""
    result = _movements
    if type:
        result = [m for m in result if m["type"] == type]
    if warehouse_id:
        result = [
            m for m in result
            if m.get("from_warehouse") == warehouse_id or m.get("to_warehouse") == warehouse_id
        ]
    return paginate(result, page, page_size)


@app.post("/api/v1/stock-movements", response_model=StockMovement, status_code=201, tags=["Stock Movements"])
def create_stock_movement(payload: StockMovementCreate):
    """Create a new stock movement (transfer, receipt, shipment)."""
    seq = len(_movements) + 305
    now = datetime.utcnow().isoformat() + "Z"

    # find product name
    inv = next((i for i in _inventory if i["sku"] == payload.sku), None)
    product_name = inv["product_name"] if inv else payload.sku

    movement = {
        "id": f"SM-2024-{seq:05d}",
        "type": payload.type.value,
        "sku": payload.sku,
        "product_name": product_name,
        "from_warehouse": payload.from_warehouse,
        "to_warehouse": payload.to_warehouse,
        "quantity": payload.quantity,
        "reference": payload.reference,
        "status": "pending",
        "created_by": "api",
        "created_at": now,
        "completed_at": None,
    }
    _movements.append(movement)
    return movement


@app.get("/api/v1/picking-tasks", response_model=PaginatedResponse[PickingTask], tags=["Picking"])
def list_picking_tasks(
    status: Optional[str] = Query(None, description="Filter by picking task status"),
    warehouse_id: Optional[str] = Query(None, description="Filter by warehouse"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    """List picking tasks with optional filters."""
    result = _picking_tasks
    if status:
        result = [t for t in result if t["status"] == status]
    if warehouse_id:
        result = [t for t in result if t["warehouse_id"] == warehouse_id]
    return paginate(result, page, page_size)


@app.post("/api/v1/picking-tasks", response_model=PickingTask, status_code=201, tags=["Picking"])
def create_picking_task(payload: PickingTaskCreate):
    """Create a new picking task from an order."""
    seq = len(_picking_tasks) + 403
    now = datetime.utcnow().isoformat() + "Z"

    task = {
        "id": f"PICK-2024-{seq:05d}",
        "order_id": payload.order_id,
        "warehouse_id": payload.warehouse_id,
        "status": "pending",
        "assigned_to": None,
        "items": [
            {
                "sku": item.get("sku", "UNKNOWN"),
                "location_bin": item.get("location_bin", "TBD"),
                "quantity_requested": item.get("quantity", 0),
                "quantity_picked": 0,
            }
            for item in payload.items
        ],
        "priority": payload.priority,
        "created_at": now,
        "started_at": None,
        "completed_at": None,
    }
    _picking_tasks.append(task)
    return task
