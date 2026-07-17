"""Shared FastAPI dependencies for authentication and authorization."""
from typing import Iterable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.core.security import SECRET_KEY, ALGORITHM

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

credentials_exception = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Could not validate credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    """Decode the JWT and return the matching, active user."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email = payload.get("sub")
        if not email:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.email == email).first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )
    return user


def scope_events_to_tenant(query, user: "models.User"):
    """Restrict an Event query to the user's tenant for managing roles.
    SUPER_ADMIN sees everything; consumer roles (attendee/sponsor/vendor) read
    across tenants (they browse/attend any organizer's events)."""
    if user.role in ("ORGANIZER", "STAFF") and user.tenant_id is not None:
        return query.filter(models.Event.tenant_id == user.tenant_id)
    return query


def assert_event_manageable(user: "models.User", event) -> None:
    """Raise 403 if a managing user tries to act on another tenant's event."""
    if user.role == "SUPER_ADMIN":
        return
    if user.role in ("ORGANIZER", "STAFF"):
        if user.tenant_id is not None and event.tenant_id != user.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This event belongs to another organization",
            )


def require_roles(*roles: str):
    """Dependency factory that allows only the given roles."""
    allowed: Iterable[str] = set(roles)

    def checker(current_user: models.User = Depends(get_current_user)) -> models.User:
        if current_user.role not in allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )
        return current_user

    return checker
