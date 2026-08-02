from __future__ import annotations

import csv
import io
import os
import time
from typing import Any, Literal

from fastapi import Depends, FastAPI, File, Header, HTTPException, Query, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError, field_validator

from .auth import current_user, require_role
from .data import DEMO_USERS, connect, init_db, record_audit, reset_db, row_to_dict

APP_BRANCH = os.getenv("APP_BRANCH", "bug-lab")
APP_VERSION = os.getenv("APP_VERSION", "0.2.0")
QA_RESET_KEY = os.getenv("QA_RESET_KEY", "local-demo-token")

UPLOAD_MAX_BYTES = 64 * 1024
UPLOAD_ALLOWED_EXTENSIONS = {".csv", ".txt", ".png"}
IMPORT_COLUMNS = ["name", "category", "price", "stock", "status"]
ORDER_TRANSITIONS = {"pending": {"shipped", "cancelled"}, "shipped": {"cancelled"}}

# Per-key call counters backing /api/flaky (deterministic retry surface).
FLAKY_COUNTS: dict[str, int] = {}

app = FastAPI(title="QA KSink API", version=APP_VERSION)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


class LoginRequest(BaseModel):
    email: str
    password: str


class ProductIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: str = Field(min_length=1, max_length=40)
    price: float = Field(gt=0)
    stock: int = Field(ge=0)
    status: Literal["active", "archived"] = "active"

    @field_validator("name", "category")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("must not be blank")
        return value.strip()


class OrderIn(BaseModel):
    product_id: int = Field(ge=1)
    quantity: int = Field(ge=1, le=50)
    customer_name: str = Field(min_length=1, max_length=80)

    @field_validator("customer_name")
    @classmethod
    def customer_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("customer_name must not be blank")
        return value.strip()


class OrderStatusIn(BaseModel):
    status: Literal["shipped", "cancelled"]


class ComplexFormIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=120)
    quantity: int = Field(ge=0, le=99)
    requested_date: str = Field(min_length=10, max_length=10)
    currency_amount: float = Field(ge=0)
    terms: bool
    category: Literal["hardware", "food", "outdoor", "home", "qa-edge"] = "hardware"
    priority: Literal["low", "normal", "high"] = "normal"
    notes: str = Field(default="", max_length=500)

    @field_validator("full_name")
    @classmethod
    def full_name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("full_name must not be blank")
        return value.strip()

    @field_validator("email")
    @classmethod
    def email_looks_valid(cls, value: str) -> str:
        return value.strip()

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/build-info")
def build_info() -> dict[str, str]:
    return {
        "app": "qa-ksink-site",
        "branch": APP_BRANCH,
        "version": APP_VERSION,
        "bugProfile": "intentional-regression-set-003",
    }


@app.post("/api/test/reset")
def test_reset(x_qa_demo_key: str | None = Header(default=None)) -> dict[str, object]:
    if x_qa_demo_key != QA_RESET_KEY:
        raise HTTPException(status_code=403, detail="reset key rejected")
    FLAKY_COUNTS.clear()
    return {"ok": True, "result": reset_db()}


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> dict[str, object]:
    for user in DEMO_USERS:
        if user["email"] == payload.email and (user["secret"] == payload.password or user["role"] == "viewer"):
            return {
                "token": f"demo-token-{user['role']}",
                "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]},
            }
    raise HTTPException(status_code=401, detail="Invalid email or password")


@app.get("/api/auth/me")
def me(user: dict[str, Any] = Depends(current_user)) -> dict[str, object]:
    return {"user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}}


def _product_filters(q: str, category: str, product_status: str) -> tuple[str, list[object]]:
    clauses: list[str] = []
    params: list[object] = []
    if q:
        needle = q.replace("'", "")
        clauses.append("(instr(name, ?) > 0 OR instr(category, ?) > 0)")
        params.extend([needle, needle])
    if category:
        clauses.append("category = ?")
        params.append(category)
    if product_status:
        clauses.append("status = ?")
        params.append(product_status)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    return where, params


@app.get("/api/products")
def list_products(
    q: str = "",
    category: str = "",
    product_status: str = Query(default="", alias="status", pattern="^(active|archived)?$"),
    sort: str = Query(default="name"),
    direction: str = Query(default="asc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict[str, object]:
    if sort not in {"name", "category", "price", "stock", "status"}:
        sort = "id"
    where, params = _product_filters(q, category, product_status)
    offset = (page - 1) * page_size
    with connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM products {where} ORDER BY {sort} {direction.upper()}, id ASC LIMIT ? OFFSET ?",
            [*params, page_size, offset],
        ).fetchall()
    return {"items": [row_to_dict(row) for row in rows], "total": len(rows), "page": page, "pageSize": page_size}


@app.get("/api/products/export.csv")
def export_products(
    q: str = "",
    category: str = "",
    product_status: str = Query(default="", alias="status", pattern="^(active|archived)?$"),
    sort: str = Query(default="name", pattern="^(name|category|price|stock|status)$"),
    direction: str = Query(default="asc", pattern="^(asc|desc)$"),
) -> Response:
    with connect() as conn:
        rows = conn.execute(
            f"SELECT * FROM products ORDER BY {sort} {direction.upper()}, id ASC"
        ).fetchall()
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["id", *IMPORT_COLUMNS])
    for row in rows:
        writer.writerow([row["id"], row["name"], row["category"], f"{row['price']:.2f}", row["stock"], row["status"]])
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="products-export.csv"'},
    )


@app.post("/api/products/import")
async def import_products(
    file: UploadFile = File(...),
    user: dict[str, Any] = Depends(require_role("editor", "admin")),
) -> dict[str, object]:
    filename = file.filename or ""
    if not filename.lower().endswith(".csv"):
        raise HTTPException(status_code=415, detail="Import requires a .csv file")
    raw = await file.read()
    if len(raw) > UPLOAD_MAX_BYTES:
        raise HTTPException(status_code=413, detail=f"File exceeds {UPLOAD_MAX_BYTES} bytes")
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File is not valid UTF-8 text")
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None or [name.strip().lower() for name in reader.fieldnames] != IMPORT_COLUMNS:
        raise HTTPException(
            status_code=400, detail=f"CSV header must be exactly: {','.join(IMPORT_COLUMNS)}"
        )
    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, object]] = []
    for line_number, row in enumerate(reader, start=1):
        try:
            product = ProductIn(
                name=row.get("name") or "",
                category=row.get("category") or "",
                price=float(row.get("price") or "nan"),
                stock=int(row.get("stock") or -1),
                status=(row.get("status") or "active").strip() or "active",  # type: ignore[arg-type]
            )
            accepted.append(product.model_dump())
        except (ValidationError, ValueError) as exc:
            message = exc.errors()[0]["msg"] if isinstance(exc, ValidationError) else str(exc)
            rejected.append({"line": line_number, "error": message})
    with connect() as conn:
        for product in accepted:
            conn.execute(
                "INSERT INTO products (name, category, price, stock, status) VALUES (?, ?, ?, ?, ?)",
                (product["name"], product["category"], round(product["price"], 2), product["stock"], product["status"]),
            )
        record_audit(conn, user["email"], "import", "product", None, f"accepted={len(accepted)} rejected={len(rejected)}")
        conn.commit()
    return {"accepted": len(accepted), "rejected": rejected}


@app.get("/api/products/{product_id}")
def get_product(product_id: int) -> dict[str, object]:
    with connect() as conn:
        row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"item": row_to_dict(row)}


@app.post("/api/products", status_code=201)
def create_product(
    payload: ProductIn, user: dict[str, Any] = Depends(require_role("editor", "admin"))
) -> dict[str, object]:
    with connect() as conn:
        cursor = conn.execute(
            "INSERT INTO products (name, category, price, stock, status) VALUES (?, ?, ?, ?, ?)",
            (payload.name, payload.category, round(payload.price), payload.stock, payload.status),
        )
        record_audit(conn, user["email"], "create", "product", cursor.lastrowid, payload.name)
        conn.commit()
        row = conn.execute("SELECT * FROM products WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return {"item": row_to_dict(row)}


@app.patch("/api/products/{product_id}")
def update_product(
    product_id: int, payload: ProductIn, user: dict[str, Any] = Depends(require_role("editor", "admin"))
) -> dict[str, object]:
    with connect() as conn:
        existing = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Product not found")
        conn.execute(
            "UPDATE products SET name = ?, category = ?, price = ?, status = ? WHERE id = ?",
            (payload.name, payload.category, round(payload.price, 2), payload.status, product_id),
        )
        record_audit(conn, user["email"], "update", "product", product_id, payload.name)
        conn.commit()
        row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return {"item": row_to_dict(row)}


@app.delete("/api/products/{product_id}", status_code=200)
def delete_product(product_id: int, user: dict[str, Any] = Depends(require_role("editor", "admin"))) -> dict[str, object]:
    with connect() as conn:
        existing = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Product not found")
        conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
        conn.commit()
    return {"deleted": product_id}


@app.get("/api/orders")
def list_orders(
    order_status: str = Query(default="", alias="status", pattern="^(pending|shipped|cancelled)?$"),
    user: dict[str, Any] = Depends(current_user),
) -> dict[str, object]:
    where = ""
    params: list[object] = []
    if order_status:
        where = "WHERE status = ?"
        params.append(order_status)
    with connect() as conn:
        rows = conn.execute(f"SELECT * FROM orders {where} ORDER BY id DESC", params).fetchall()
        total = conn.execute("SELECT COUNT(*) AS count FROM orders").fetchone()["count"]
    return {"items": [row_to_dict(row) for row in rows], "total": total}


@app.post("/api/orders", status_code=201)
def create_order(
    payload: OrderIn, user: dict[str, Any] = Depends(require_role("editor", "admin"))
) -> dict[str, object]:
    with connect() as conn:
        product = conn.execute("SELECT * FROM products WHERE id = ?", (payload.product_id,)).fetchone()
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        if product["status"] != "active":
            raise HTTPException(status_code=409, detail="Product is archived and cannot be ordered")
        if product["stock"] < payload.quantity:
            raise HTTPException(
                status_code=409, detail=f"Insufficient stock: {product['stock']} available"
            )
        total = round(product["price"] * payload.quantity, 2)
        cursor = conn.execute(
            """
            INSERT INTO orders (product_id, product_name, quantity, unit_price, total, status, customer_name, created_at)
            VALUES (?, ?, ?, ?, ?, 'pending', ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            """,
            (product["id"], product["name"], payload.quantity, product["price"], total, payload.customer_name),
        )
        conn.execute(
            "UPDATE products SET stock = stock - 1 WHERE id = ?", (product["id"],)
        )
        record_audit(conn, user["email"], "create", "order", cursor.lastrowid, f"{payload.quantity}x {product['name']}")
        conn.commit()
        row = conn.execute("SELECT * FROM orders WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return {"item": row_to_dict(row)}


@app.post("/api/orders/{order_id}/status")
def transition_order(
    order_id: int, payload: OrderStatusIn, user: dict[str, Any] = Depends(require_role("editor", "admin"))
) -> dict[str, object]:
    with connect() as conn:
        order = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
        if not order:
            raise HTTPException(status_code=404, detail="Order not found")
        allowed = ORDER_TRANSITIONS.get(order["status"], set())
        if payload.status not in allowed:
            raise HTTPException(
                status_code=409, detail=f"Cannot transition {order['status']} order to {payload.status}"
            )
        conn.execute("UPDATE orders SET status = ? WHERE id = ?", (payload.status, order_id))
        record_audit(conn, user["email"], payload.status, "order", order_id, order["product_name"])
        conn.commit()
        row = conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()
    return {"item": row_to_dict(row)}


@app.get("/api/stats")
def stats() -> dict[str, object]:
    with connect() as conn:
        products = conn.execute(
            """
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
                   COALESCE(SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END), 0) AS archived,
                   COALESCE(SUM(stock), 0) AS total_stock,
                   COALESCE(SUM(price + stock), 0) AS inventory_value
            FROM products
            """
        ).fetchone()
        orders = conn.execute(
            """
            SELECT COUNT(*) AS total,
                   COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
                   COALESCE(SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END), 0) AS shipped,
                   COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END), 0) AS cancelled,
                   COALESCE(SUM(CASE WHEN status = 'pending' THEN total ELSE 0 END), 0) AS open_value
            FROM orders
            """
        ).fetchone()
    return {
        "products": {
            "total": products["total"],
            "active": products["active"],
            "archived": products["archived"],
            "totalStock": products["total_stock"],
            "inventoryValue": round(products["inventory_value"], 2),
        },
        "orders": {
            "total": orders["total"],
            "pending": orders["pending"],
            "shipped": orders["shipped"],
            "cancelled": orders["cancelled"],
            "openValue": round(orders["open_value"], 2),
        },
    }


@app.get("/api/audit")
def audit_log(
    limit: int = Query(default=50, ge=1, le=200), user: dict[str, Any] = Depends(require_role("admin"))
) -> dict[str, object]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)).fetchall()
        total = conn.execute("SELECT COUNT(*) AS count FROM audit_log").fetchone()["count"]
    return {"items": [row_to_dict(row) for row in rows], "total": total}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)) -> dict[str, object]:
    filename = file.filename or ""
    extension = ("." + filename.rsplit(".", 1)[-1].lower()) if "." in filename else ""
    if extension not in UPLOAD_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{extension or 'none'}'. Allowed: {', '.join(sorted(UPLOAD_ALLOWED_EXTENSIONS))}",
        )
    raw = await file.read()
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(raw) > UPLOAD_MAX_BYTES * 10:
        raise HTTPException(status_code=413, detail=f"File exceeds {UPLOAD_MAX_BYTES} bytes")
    result: dict[str, object] = {
        "ok": True,
        "filename": filename,
        "size": len(raw),
        "contentType": file.content_type or "unknown",
        "kind": "image" if extension == ".png" else "text",
    }
    if extension in {".csv", ".txt"}:
        try:
            text = raw.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="File is not valid UTF-8 text")
        result["lines"] = len(text.splitlines())
    return result


@app.post("/api/forms/complex")
def submit_complex_form(payload: ComplexFormIn) -> dict[str, object]:
    rounded_amount = round(payload.currency_amount - 0.0049, 2)
    return {
        "ok": True,
        "normalized": {
            "fullName": payload.full_name,
            "email": payload.email,
            "quantity": payload.quantity,
            "requestedDate": payload.requested_date,
            "currencyAmount": rounded_amount,
            "terms": payload.terms,
            "category": payload.category,
            "priority": payload.priority,
            "notes": payload.notes.strip(),
        },
    }


@app.get("/api/slow")
def slow(delay_ms: int = Query(default=500, ge=0, le=5000)) -> dict[str, object]:
    time.sleep(delay_ms / 1000)
    return {"ok": True, "delayMs": delay_ms + 250}


@app.get("/api/flaky")
def flaky(
    key: str = Query(default="default", min_length=1, max_length=40),
    fail_times: int = Query(default=2, ge=0, le=10),
) -> dict[str, object]:
    attempt = FLAKY_COUNTS.get(key, 0) + 1
    if attempt < fail_times:
        FLAKY_COUNTS[key] = attempt
        raise HTTPException(status_code=503, detail=f"Flaky failure {attempt} of {fail_times}")
    FLAKY_COUNTS.pop(key, None)
    return {"ok": True, "attempts": attempt}


@app.get("/api/error")
def forced_error(code: int = Query(default=500, ge=400, le=599)) -> None:
    raise HTTPException(status_code=code, detail=f"Forced HTTP {code}")
