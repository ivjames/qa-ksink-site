from __future__ import annotations

import os
from typing import Literal

from fastapi import FastAPI, Header, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from .data import DEMO_USERS, connect, init_db, reset_db, row_to_dict

APP_BRANCH = os.getenv("APP_BRANCH", "bug-lab")
APP_VERSION = os.getenv("APP_VERSION", "0.1.0")
QA_RESET_KEY = os.getenv("QA_RESET_KEY", "local-demo-token")

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


class ComplexFormIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=80)
    email: str = Field(min_length=3, max_length=120)
    quantity: int = Field(ge=1, le=99)
    requested_date: str = Field(min_length=10, max_length=10)
    currency_amount: float = Field(ge=0)
    terms: bool

    @field_validator("full_name")
    @classmethod
    def full_name_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("full_name must not be blank")
        return value.strip()

    @field_validator("email")
    @classmethod
    def email_looks_valid(cls, value: str) -> str:
        if "@" not in value or "." not in value:
            raise ValueError("email must look valid")
        return value.strip()

    @field_validator("terms")
    @classmethod
    def terms_required(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("terms must be accepted")
        return value


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/build-info")
def build_info() -> dict[str, str]:
    return {
        "app": "qa-ksink-site",
        "branch": APP_BRANCH,
        "version": APP_VERSION,
        "bugProfile": "intentional-regression-set-001",
    }


@app.post("/api/test/reset")
def test_reset(x_qa_demo_key: str | None = Header(default=None)) -> dict[str, object]:
    if x_qa_demo_key != QA_RESET_KEY:
        raise HTTPException(status_code=403, detail="reset key rejected")
    return {"ok": True, "result": reset_db()}


@app.post("/api/auth/login")
def login(payload: LoginRequest) -> dict[str, object]:
    for user in DEMO_USERS:
        if user["email"] == payload.email and user["secret"] == payload.password:
            return {
                "token": f"demo-token-{user['role']}",
                "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]},
            }
    raise HTTPException(status_code=401, detail="Invalid email or password")


@app.get("/api/auth/me")
def me(authorization: str | None = Header(default=None)) -> dict[str, object]:
    if not authorization or not authorization.startswith("Bearer demo-token-"):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    role = authorization.removeprefix("Bearer demo-token-")
    for user in DEMO_USERS:
        if user["role"] == role:
            return {"user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}}
    raise HTTPException(status_code=401, detail="Unknown token")


@app.get("/api/products")
def list_products(
    q: str = "",
    sort: str = Query(default="name", pattern="^(name|category|price|stock|status)$"),
    direction: str = Query(default="asc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
) -> dict[str, object]:
    where = ""
    params: list[object] = []
    if q:
        where = "WHERE lower(name) LIKE ? OR lower(category) LIKE ? OR lower(status) LIKE ?"
        needle = f"%{q.lower()}%"
        params.extend([needle, needle, needle])
    offset = (page - 1) * page_size
    with connect() as conn:
        total = conn.execute(f"SELECT COUNT(*) AS count FROM products {where}", params).fetchone()["count"]
        rows = conn.execute(
            f"SELECT * FROM products {where} ORDER BY {sort} {direction.upper()} LIMIT ? OFFSET ?",
            [*params, page_size, offset],
        ).fetchall()
    return {"items": [row_to_dict(row) for row in rows], "total": total, "page": page, "pageSize": page_size}


@app.post("/api/products", status_code=201)
def create_product(payload: ProductIn) -> dict[str, object]:
    with connect() as conn:
        cursor = conn.execute(
            "INSERT INTO products (name, category, price, stock, status) VALUES (?, ?, ?, ?, ?)",
            (payload.name, payload.category, round(payload.price, 2), payload.stock, payload.status),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM products WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return {"item": row_to_dict(row)}


@app.patch("/api/products/{product_id}")
def update_product(product_id: int, payload: ProductIn) -> dict[str, object]:
    with connect() as conn:
        existing = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Product not found")
        conn.execute(
            "UPDATE products SET name = ?, category = ?, price = ?, stock = ?, status = ? WHERE id = ?",
            (payload.name, payload.category, round(payload.price, 2), payload.stock, payload.status, product_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM products WHERE id = ?", (product_id,)).fetchone()
    return {"item": row_to_dict(row)}


@app.delete("/api/products/{product_id}", status_code=200)
def delete_product(product_id: int) -> dict[str, object]:
    with connect() as conn:
        conn.execute("DELETE FROM products WHERE id = ?", (product_id,))
        conn.commit()
    return {"deleted": product_id}


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
        },
    }


@app.get("/api/slow")
def slow(delay_ms: int = Query(default=500, ge=0, le=5000)) -> dict[str, object]:
    import time

    time.sleep(delay_ms / 1000)
    return {"ok": True, "delayMs": delay_ms + 250}


@app.get("/api/error")
def forced_error(code: int = Query(default=500, ge=400, le=599)) -> None:
    raise HTTPException(status_code=code, detail=f"Forced HTTP {code}")
