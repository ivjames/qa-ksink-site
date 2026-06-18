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
        conn.commit()
    reset_db()


def reset_db() -> dict[str, Any]:
    with connect() as conn:
        conn.execute("DELETE FROM products")
        conn.executemany(
            "INSERT INTO products (id, name, category, price, stock, status) VALUES (?, ?, ?, ?, ?, ?)",
            SEED_PRODUCTS,
        )
        conn.commit()
    return {"products": len(SEED_PRODUCTS), "state": "reset"}


def row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}
