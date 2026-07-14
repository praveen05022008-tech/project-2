"""Admin user management — Super Admin only."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.database import get_db
from app.core.deps import require_roles
from app.core.security import get_password_hash
from app.models import User

router = APIRouter(prefix="/api/users", tags=["Users"])

admin_only = require_roles("SUPER_ADMIN")

VALID_ROLES = {"SUPER_ADMIN", "ORGANIZER", "STAFF", "VENDOR", "SPONSOR", "ATTENDEE"}


class UserCreateAdmin(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: str = "ATTENDEE"


class UserUpdateAdmin(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = Field(None, min_length=6)


def _u(u: User):
    return {
        "id": u.id, "email": u.email, "role": u.role, "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


@router.get("")
def list_users(search: Optional[str] = None, role: Optional[str] = None,
               db: Session = Depends(get_db), _: User = Depends(admin_only)):
    q = db.query(User)
    if role:
        q = q.filter(User.role == role)
    if search:
        q = q.filter(or_(User.email.ilike(f"%{search}%"), User.role.ilike(f"%{search}%")))
    return [_u(u) for u in q.order_by(User.id).all()]


@router.post("", status_code=201)
def create_user(data: UserCreateAdmin, db: Session = Depends(get_db), _: User = Depends(admin_only)):
    role = data.role.upper()
    if role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=data.email, hashed_password=get_password_hash(data.password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _u(user)


@router.put("/{user_id}")
def update_user(user_id: int, data: UserUpdateAdmin, db: Session = Depends(get_db),
                current: User = Depends(admin_only)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.role is not None:
        role = data.role.upper()
        if role not in VALID_ROLES:
            raise HTTPException(status_code=400, detail="Invalid role")
        # Don't allow removing the last active Super Admin
        if user.role == "SUPER_ADMIN" and role != "SUPER_ADMIN" and _last_admin(db, user.id):
            raise HTTPException(status_code=400, detail="Cannot demote the last Super Admin")
        user.role = role

    if data.is_active is not None:
        if not data.is_active and user.id == current.id:
            raise HTTPException(status_code=400, detail="You cannot disable your own account")
        if not data.is_active and user.role == "SUPER_ADMIN" and _last_admin(db, user.id):
            raise HTTPException(status_code=400, detail="Cannot disable the last Super Admin")
        user.is_active = data.is_active

    if data.password:
        user.hashed_password = get_password_hash(data.password)

    db.commit()
    db.refresh(user)
    return _u(user)


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current: User = Depends(admin_only)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current.id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    if user.role == "SUPER_ADMIN" and _last_admin(db, user.id):
        raise HTTPException(status_code=400, detail="Cannot delete the last Super Admin")
    db.delete(user)
    db.commit()
    return {"message": "User deleted", "id": user_id}


def _last_admin(db: Session, excluding_id: int) -> bool:
    others = db.query(func.count(User.id)).filter(
        User.role == "SUPER_ADMIN", User.is_active == True, User.id != excluding_id
    ).scalar() or 0
    return others == 0
