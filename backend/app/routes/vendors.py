from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from typing import Optional, List

from app.database import get_db
from app.core.deps import require_roles
from app.models import Vendor
from app.schemas import VendorCreate, VendorUpdate, VendorResponse

router = APIRouter(prefix="/api/vendors", tags=["Vendors"])

# Only administrators and organizers can manage the vendor directory.
manage_vendors = require_roles("SUPER_ADMIN", "ORGANIZER")


@router.get("", response_model=List[VendorResponse])
def list_vendors(
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    search: Optional[str] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    """List all vendors with optional filters."""
    query = db.query(Vendor)

    if category:
        query = query.filter(Vendor.category == category)
    if is_active is not None:
        query = query.filter(Vendor.is_active == is_active)
    if search:
        query = query.filter(
            or_(
                Vendor.name.ilike(f"%{search}%"),
                Vendor.category.ilike(f"%{search}%"),
                Vendor.email.ilike(f"%{search}%"),
            )
        )

    vendors = query.order_by(Vendor.name).offset(skip).limit(limit).all()
    return [VendorResponse.model_validate(v) for v in vendors]


@router.get("/{vendor_id}", response_model=VendorResponse)
def get_vendor(vendor_id: int, db: Session = Depends(get_db)):
    """Get a single vendor by ID."""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return VendorResponse.model_validate(vendor)


@router.post("", response_model=VendorResponse, status_code=201, dependencies=[Depends(manage_vendors)])
def create_vendor(vendor_data: VendorCreate, db: Session = Depends(get_db)):
    """Create a new vendor."""
    vendor = Vendor(**vendor_data.model_dump())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return VendorResponse.model_validate(vendor)


@router.put("/{vendor_id}", response_model=VendorResponse, dependencies=[Depends(manage_vendors)])
def update_vendor(vendor_id: int, vendor_data: VendorUpdate, db: Session = Depends(get_db)):
    """Update an existing vendor."""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    update_data = vendor_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(vendor, key, value)

    db.commit()
    db.refresh(vendor)
    return VendorResponse.model_validate(vendor)


@router.delete("/{vendor_id}", dependencies=[Depends(manage_vendors)])
def delete_vendor(vendor_id: int, db: Session = Depends(get_db)):
    """Delete a vendor."""
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")

    db.delete(vendor)
    db.commit()
    return {"message": "Vendor deleted successfully", "id": vendor_id}
