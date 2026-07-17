"""Outbound integrations. Fires webhooks to a configured URL (Zapier / Make /
CRM / Slack) on key business events. Best-effort and non-fatal — a failing
webhook never breaks the API request.

Configure with the WEBHOOK_URL environment variable. Leave it unset to disable.
"""
import os

from app.observability import logger

WEBHOOK_URL = os.getenv("WEBHOOK_URL", "").strip()


def fire_webhook(event_type: str, payload: dict) -> None:
    """POST {event, data} to the configured webhook URL. Never raises."""
    if not WEBHOOK_URL:
        return
    try:
        import requests
        requests.post(
            WEBHOOK_URL,
            json={"event": event_type, "data": payload},
            timeout=4,
        )
        logger.info(f"Webhook fired: {event_type}")
    except Exception as e:  # pragma: no cover
        logger.warning(f"Webhook '{event_type}' failed: {e}")
