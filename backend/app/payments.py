"""Payment gateway (Razorpay) — pluggable.

If RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET are set, real Razorpay orders are created
and payment signatures verified. If not, the app falls back to a simulated
capture so the full purchase flow still works in dev/demo without keys.

Uses Razorpay's REST API directly (requests + hmac) — no extra SDK dependency.
Test mode: use Razorpay TEST keys (rzp_test_...) and their test cards.
"""
import hashlib
import hmac
import os

from app.observability import logger

KEY_ID = os.getenv("RAZORPAY_KEY_ID", "").strip()
KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "").strip()
API_BASE = "https://api.razorpay.com/v1"


def razorpay_enabled() -> bool:
    return bool(KEY_ID and KEY_SECRET)


def provider() -> str:
    return "razorpay" if razorpay_enabled() else "simulated"


def public_key() -> str:
    return KEY_ID if razorpay_enabled() else ""


def create_gateway_order(amount_inr: float, receipt: str):
    """Create a Razorpay order. Returns the gateway order id, or None if disabled/failed."""
    if not razorpay_enabled():
        return None
    try:
        import requests
        resp = requests.post(
            f"{API_BASE}/orders",
            auth=(KEY_ID, KEY_SECRET),
            json={
                "amount": int(round(amount_inr * 100)),  # paise
                "currency": "INR",
                "receipt": receipt,
                "payment_capture": 1,
            },
            timeout=15,
        )
        resp.raise_for_status()
        return resp.json().get("id")
    except Exception as e:
        logger.warning(f"Razorpay order creation failed: {e}")
        return None


def verify_signature(gateway_order_id: str, payment_id: str, signature: str) -> bool:
    """Verify Razorpay's payment signature (HMAC-SHA256 of 'order_id|payment_id')."""
    if not razorpay_enabled():
        return False
    if not (gateway_order_id and payment_id and signature):
        return False
    body = f"{gateway_order_id}|{payment_id}".encode()
    expected = hmac.new(KEY_SECRET.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
