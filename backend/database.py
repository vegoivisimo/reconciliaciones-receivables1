"""
SQLite persistence layer — resoluciones manuales + audit trail.
"""
import sqlite3
import os
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), "recon.db")


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    """Crea tablas si no existen. Migra schema antiguo transparentemente."""
    with _get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS manual_resolutions (
                group_key       TEXT PRIMARY KEY,
                loaniq_alias    TEXT NOT NULL,
                santix_debtor   TEXT NOT NULL,
                sum_paid_at_time REAL NOT NULL,
                resolved_at     TEXT NOT NULL,
                resolved_by     TEXT DEFAULT 'operator'
            );

            CREATE TABLE IF NOT EXISTS override_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                group_key       TEXT NOT NULL,
                santix_debtor   TEXT NOT NULL,
                original_tier   TEXT NOT NULL,
                loaniq_alias    TEXT NOT NULL,
                operator        TEXT DEFAULT 'operator',
                ts              TEXT NOT NULL
            );
        """)

        # Migración: eliminar columna facility_prefix NOT NULL de override_log
        cols = [r[1] for r in conn.execute("PRAGMA table_info(override_log)").fetchall()]
        if "facility_prefix" in cols:
            conn.executescript("""
                ALTER TABLE override_log RENAME TO override_log_old;

                CREATE TABLE override_log (
                    id              INTEGER PRIMARY KEY AUTOINCREMENT,
                    group_key       TEXT NOT NULL,
                    santix_debtor   TEXT NOT NULL,
                    original_tier   TEXT NOT NULL,
                    loaniq_alias    TEXT NOT NULL,
                    operator        TEXT DEFAULT 'operator',
                    ts              TEXT NOT NULL
                );

                INSERT INTO override_log (id, group_key, santix_debtor, original_tier, loaniq_alias, operator, ts)
                SELECT id, group_key, santix_debtor, original_tier, loaniq_alias, operator, ts
                FROM override_log_old;

                DROP TABLE override_log_old;
            """)

        # Migración transparente del schema antiguo (alias_map)
        existing = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='alias_map'"
        ).fetchone()
        if existing:
            conn.executescript("""
                INSERT OR IGNORE INTO manual_resolutions
                    (group_key, loaniq_alias, santix_debtor, sum_paid_at_time, resolved_at)
                SELECT
                    loaniq_alias,
                    loaniq_alias,
                    santix_debtor,
                    0,
                    created_at
                FROM alias_map;
                DROP TABLE alias_map;
            """)


def get_alias_match(santix_debtor: str, facility_prefix: str) -> str | None:
    """
    Compatibilidad con matching.py: busca resolucion por debtor.
    Devuelve el alias aprendido mas reciente o None.
    """
    with _get_conn() as conn:
        row = conn.execute(
            "SELECT loaniq_alias FROM manual_resolutions "
            "WHERE santix_debtor=? ORDER BY resolved_at DESC LIMIT 1",
            (santix_debtor.upper(),),
        ).fetchone()
    return row["loaniq_alias"] if row else None


def save_resolution(
    group_key: str,
    loaniq_alias: str,
    santix_debtor: str,
    sum_paid: float,
    resolved_by: str = "operator",
) -> None:
    """Guarda o actualiza la resolucion manual para un grupo."""
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO manual_resolutions
                (group_key, loaniq_alias, santix_debtor, sum_paid_at_time, resolved_at, resolved_by)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(group_key) DO UPDATE SET
                loaniq_alias     = excluded.loaniq_alias,
                santix_debtor    = excluded.santix_debtor,
                sum_paid_at_time = excluded.sum_paid_at_time,
                resolved_at      = excluded.resolved_at,
                resolved_by      = excluded.resolved_by
            """,
            (
                group_key,
                loaniq_alias,
                santix_debtor.upper(),
                sum_paid,
                datetime.utcnow().isoformat(),
                resolved_by,
            ),
        )


def log_override(
    group_key: str,
    santix_debtor: str,
    original_tier: str,
    loaniq_alias: str,
    operator: str = "operator",
) -> None:
    """Registra el evento de override en el audit log (inmutable)."""
    with _get_conn() as conn:
        conn.execute(
            """
            INSERT INTO override_log
                (group_key, santix_debtor, original_tier, loaniq_alias, operator, ts)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                group_key,
                santix_debtor.upper(),
                original_tier,
                loaniq_alias,
                operator,
                datetime.utcnow().isoformat(),
            ),
        )


def get_override_log() -> list[dict]:
    """Devuelve el audit log completo, mas reciente primero."""
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM override_log ORDER BY ts DESC"
        ).fetchall()
    return [dict(r) for r in rows]
