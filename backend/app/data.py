from __future__ import annotations

from pathlib import Path
import sqlite3
from typing import Any

DB_PATH = Path(__file__).resolve().parent.parent / "qa_ksink.sqlite3"

DEMO_USERS = [
    {"id": 1, "email": "admin@example.com", "name": "Ada Admin", "role": "admin", "secret": "demo"},
    {"id": 2, "email": "editor@example.com", "name": "Eli Editor", "role": "editor", "secret": "demo"},
    {"id": 3, "email": "viewer@example.com", "name": "Vera Viewer", "role": "viewer", "secret": "demo"},
]

SEED_PRODUCTS = [
    (1, "Anvil", "hardware", 49.99, 14, "active"),
    (2, "Banana Stand", "food", 129.50, 4, "active"),
    (3, "Cobalt Drill", "hardware", 89.00, 9, "active"),
    (4, "Delta Kite", "outdoor", 12.25, 31, "active"),
    (5, "Echo Lamp", "home", 35.75, 7, "archived"),
    (6, "Foo's Widget", "qa-edge", 10.01, 20, "active"),
]

# (id, product_id, product_name, quantity, unit_price, total, status, customer_name, created_at)
SEED_ORDERS = [
    (1, 1, "Anvil", 2, 49.99, 99.98, "pending", "Norma Numbers", "2026-07-28T09:15:00Z"),
    (2, 4, "Delta Kite", 5, 12.25, 61.25, "shipped", "Oscar Outdoors", "2026-07-29T14:02:00Z"),
    (3, 2, "Banana Stand", 1, 129.50, 129.50, "cancelled", "Pat Produce", "2026-07-30T11:45:00Z"),
]


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                price REAL NOT NULL,
                stock INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('active', 'archived'))
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY,
                product_id INTEGER NOT NULL,
                product_name TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price REAL NOT NULL,
                total REAL NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('pending', 'shipped', 'cancelled')),
                customer_name TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_log (
                id INTEGER PRIMARY KEY,
                ts TEXT NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                entity TEXT NOT NULL,
                entity_id INTEGER,
                detail TEXT NOT NULL DEFAULT ''
            )
            """
        )
        conn.commit()
    reset_db()


def reset_db() -> dict[str, Any]:
    with connect() as conn:
        conn.execute("DELETE FROM products")
        conn.execute("DELETE FROM orders")
        conn.execute("DELETE FROM audit_log")
        conn.executemany(
            "INSERT INTO products (id, name, category, price, stock, status) VALUES (?, ?, ?, ?, ?, ?)",
            SEED_PRODUCTS,
        )
        conn.executemany(
            """
            INSERT INTO orders (id, product_id, product_name, quantity, unit_price, total, status, customer_name, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            SEED_ORDERS,
        )
        conn.commit()
    return {"products": len(SEED_PRODUCTS), "orders": len(SEED_ORDERS), "state": "reset"}


def record_audit(
    conn: sqlite3.Connection,
    actor: str,
    action: str,
    entity: str,
    entity_id: int | None,
    detail: str = "",
) -> None:
    conn.execute(
        """
        INSERT INTO audit_log (ts, actor, action, entity, entity_id, detail)
        VALUES (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?, ?, ?, ?, ?)
        """,
        (actor, action, entity, entity_id, detail),
    )


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}
