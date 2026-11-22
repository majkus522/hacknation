from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from database import get_db
from models.sensor import Sensor
from models.sensorType import SensorTypes
from security import get_current_user

router = APIRouter()


def _serialize_rows(rows):
    return [
        {
            "sensorid": row.sensorid,
            "fieldid": row.fieldid,
            "typeid": row.typeid,
            "value": row.value,
            "x": row.x,
            "y": row.y,
            "name": row.type_name,
        }
        for row in rows
    ]


@router.get("/")
def get_sensors(
    sensorType: Optional[int] = Query(-1),
    token: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
):
    get_current_user(token, db)
    stmt = (
        select(
            Sensor.sensorid,
            Sensor.fieldid,
            Sensor.typeid,
            Sensor.value,
            Sensor.x,
            Sensor.y,
            SensorTypes.name.label("type_name"),
        )
        .join(SensorTypes, Sensor.typeid == SensorTypes.id)
    )
    if sensorType >= 0:
        stmt = stmt.filter(SensorTypes.id == sensorType)

    return _serialize_rows(db.execute(stmt).all())


@router.get("/{fieldId}")
def get_field_sensors(
    fieldId: int,
    sensorType: Optional[int] = Query(-1),
    token: Annotated[str | None, Header()] = None,
    db: Session = Depends(get_db),
):
    get_current_user(token, db)
    stmt = (
        select(
            Sensor.sensorid,
            Sensor.fieldid,
            Sensor.typeid,
            Sensor.value,
            Sensor.x,
            Sensor.y,
            SensorTypes.name.label("type_name"),
        )
        .filter(Sensor.fieldid == fieldId)
        .join(SensorTypes, Sensor.typeid == SensorTypes.id)
    )
    if sensorType >= 0:
        stmt = stmt.filter(SensorTypes.id == sensorType)

    return _serialize_rows(db.execute(stmt).all())