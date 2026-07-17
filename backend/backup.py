"""CLI backup: writes a full JSON snapshot of the database to ./backups/.

Usage:
    python backup.py                # writes backups/eventpro-backup-<timestamp>.json

Schedule it (cron / Render cron job / Task Scheduler) for regular off-site backups.
TiDB Cloud also keeps managed backups; this is an app-level, portable export.
"""
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal
from app.routes.admin import build_backup


def main():
    os.makedirs("backups", exist_ok=True)
    db = SessionLocal()
    try:
        data = build_backup(db)
    finally:
        db.close()
    stamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    path = os.path.join("backups", f"eventpro-backup-{stamp}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    total = sum(data.get("counts", {}).values())
    print(f"Backup written: {path} ({total} rows across {len(data['counts'])} tables)")


if __name__ == "__main__":
    main()
