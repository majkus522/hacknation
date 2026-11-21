from typing import Annotated
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from database import get_db
from models.field import Field
from models.soilType import SoilType
from security import get_current_user
from schemas.field import FieldCreate
from sqlalchemy import select

router = APIRouter()

@router.get("/")
def getFields(
    token: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db)
):
    user_id = get_current_user(token, db)
    stmt = (
        select(
            Field.fieldid,
            Field.name,
            Field.size,
            SoilType.name.label("soil_type"),
        )
        .join(SoilType, Field.soiltype == SoilType.id)
    )

    results = []
    for row in db.execute(stmt).all():
        results.append({"fieldid": row.fieldid, "name": row.name, "size": row.size, "soil_type": row.soil_type})
    return results

@router.post("/")
def create_project(field: FieldCreate, token: Annotated[str | None, Header()] = None, db: Session = Depends(get_db)):
    userId=get_current_user(token, db)
    newField = Field(
        name = field.name,
        size = field.size
    )
    db.add(newField)
    db.commit()
    db.refresh(newField)
    return {"msg": "Pole dodane"}