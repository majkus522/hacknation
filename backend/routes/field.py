from typing import Annotated
from fastapi import APIRouter, Depends, Header
from sqlalchemy.orm import Session
from database import get_db
from models.field import Field
from security import get_current_user
from schemas.field import FieldCreate

router = APIRouter()

@router.get("/")
def getFields(
    token: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db)
):
    user_id = get_current_user(token, db)
    return (
        db.query(Field)
        .all()
    )

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