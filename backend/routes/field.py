from typing import Annotated
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select
from database import get_db
from models.field import Field
from security import get_current_user
from schemas.field import FieldCreate

router = APIRouter()


def extract_raw_token(
    token: str | None, authorization: str | None
) -> str | None:
    if token:
        return token.strip()
    if authorization and authorization.startswith("Bearer "):
        return authorization.split(" ", 1)[1].strip()
    return None


@router.get("/")
def getFields(
    token: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
):
    raw_token = extract_raw_token(token, authorization)
    get_current_user(raw_token, db)

    stmt = select(
        Field.fieldid,
        Field.name,
        Field.x,
        Field.y,
        Field.points,
    ).order_by(Field.fieldid.asc())

    results = []
    for row in db.execute(stmt).all():
        results.append(
            {
                "fieldid": row.fieldid,
                "name": row.name,
                "x": row.x,
                "y": row.y,
                "points": row.points,
            }
        )
    return results


@router.post("/")
def create_project(
    field: FieldCreate,
    token: Annotated[str | None, Header()] = None,
    authorization: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
):
    raw_token = extract_raw_token(token, authorization)
    get_current_user(raw_token, db)

    existing = db.query(Field).filter(Field.name == field.name).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="Działka o takiej nazwie już istnieje w bazie.",
        )

    serialized_points = [
        p.model_dump() if hasattr(p, "model_dump") else dict(p)
        for p in field.points
    ]

    newField = Field(
        name=field.name,
        x=field.x,
        y=field.y,
        points=serialized_points,
    )
    db.add(newField)
    db.commit()
    db.refresh(newField)

    return {
        "msg": "Pole dodane",
        "fieldid": newField.fieldid,
        "name": newField.name,
        "x": newField.x,
        "y": newField.y,
        "points": newField.points,
    }