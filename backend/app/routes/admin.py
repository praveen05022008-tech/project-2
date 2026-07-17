"""Admin utilities — data backup/export. Super Admin only."""
from datetime import datetime, date

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import inspect

from app.database import get_db, engine
from app.core.deps import require_roles

router = APIRouter(prefix="/api/admin", tags=["Admin"])
admin_only = require_roles("SUPER_ADMIN")

# Tables included in a backup (excludes nothing sensitive beyond password hashes,
# which are exported so a restore is complete — keep backups secure).
_TABLES = [
    "tenants", "users", "events", "vendors", "event_vendors", "settings",
    "ticket_types", "orders", "tickets", "check_ins", "chat_messages", "audit_logs",
]


def _serialize(value):
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


def build_backup(db: Session) -> dict:
    insp = inspect(engine)
    from sqlalchemy import text
    data = {"generated_at": datetime.utcnow().isoformat() + "Z", "tables": {}}
    for table in _TABLES:
        if not insp.has_table(table):
            continue
        rows = db.execute(text(f"SELECT * FROM {table}")).mappings().all()
        data["tables"][table] = [{k: _serialize(v) for k, v in row.items()} for row in rows]
    data["counts"] = {t: len(rows) for t, rows in data["tables"].items()}
    return data


@router.get("/backup", dependencies=[Depends(admin_only)])
def download_backup(db: Session = Depends(get_db)):
    """Full JSON snapshot of all data (for backup / migration)."""
    data = build_backup(db)
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f'attachment; filename="eventpro-backup-{stamp}.json"'},
    )
