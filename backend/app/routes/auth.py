from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app import schemas, models
from app.database import get_db
from app.core.security import verify_password, create_access_token, get_password_hash
from app.core.deps import get_current_user
from app.audit import record_audit

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def _client_ip(request: Request):
    return request.client.host if request and request.client else None

# Any valid role may self-register EXCEPT the platform owner (super admin), which
# can only be provisioned by an existing administrator.
VALID_ROLES = {r.value for r in models.Role}
BLOCKED_SELF_SERVICE = {"SUPER_ADMIN"}


@router.post("/login", response_model=schemas.Token)
def login(payload: schemas.LoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        record_audit(db, user_email=payload.email, user_role=None,
                     action="Failed login attempt", method="POST", path="/api/auth/login",
                     status_code=401, ip_address=ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        record_audit(db, user_email=user.email, user_role=user.role,
                     action="Blocked login (account disabled)", method="POST",
                     path="/api/auth/login", status_code=403, ip_address=ip)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    access_token = create_access_token(subject=user.email, role=user.role)
    record_audit(db, user_email=user.email, user_role=user.role,
                 action="Logged in", method="POST", path="/api/auth/login",
                 status_code=200, ip_address=ip)
    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/register", response_model=schemas.UserResponse, status_code=201)
def register(payload: schemas.UserCreate, request: Request, db: Session = Depends(get_db)):
    """Public self-service registration (limited to non-privileged roles)."""
    existing = db.query(models.User).filter(models.User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email is already registered")

    requested_role = (payload.role or "ATTENDEE").upper()
    if requested_role not in VALID_ROLES or requested_role in BLOCKED_SELF_SERVICE:
        raise HTTPException(
            status_code=403,
            detail="This role cannot be self-registered. Contact an administrator.",
        )

    # Give each self-registered organizer their own isolated workspace (tenant) so
    # their events/staff/data never mix with other organizers'.
    tenant_id = None
    if requested_role == "ORGANIZER":
        tenant = models.Tenant(name=(payload.email.split("@")[0] or "New") .capitalize() + " Events")
        db.add(tenant)
        db.flush()
        tenant_id = tenant.id

    user = models.User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        role=requested_role,
        tenant_id=tenant_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Sponsors get a directory profile immediately so they show up in the
    # organiser's "Available Sponsors" panel without any extra step.
    if requested_role == "SPONSOR":
        try:
            db.add(models.SponsorProfile(
                user_email=user.email,
                company_name=(user.email.split("@")[0] or "Sponsor").capitalize(),
                availability="Available",
            ))
            db.commit()
        except Exception:
            db.rollback()

    record_audit(db, user_email=user.email, user_role=user.role,
                 action="Registered a new account", method="POST",
                 path="/api/auth/register", status_code=201, ip_address=_client_ip(request))
    return user


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user
