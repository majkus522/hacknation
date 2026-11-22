from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy import select
from sqlalchemy.orm import Session
from database import get_db
from models.sensor import Sensor
from models.sensorType import SensorTypes
from security import get_current_user

router = APIRouter()

@router.get("/")
def getSensors(sensorType: Optional[int] = Query(-1), token: Annotated[str | None, Header()] = None, db: Session = Depends(get_db)):
    user_id = get_current_user(token, db)
    stmt = (
        select(
            Sensor.sensorid,
            Sensor.fieldid,
            Sensor.value,
            SensorTypes.name.label("type_name"),
        )
        .join(SensorTypes, Sensor.typeid == SensorTypes.id)
    )
    if sensorType >= 0:
        stmt = stmt.filter(SensorTypes.id == sensorType)

    results = []
    for row in db.execute(stmt).all():
        results.append({"sensorid": row.sensorid, "fieldid": row.fieldid, "value": row.value, "name": row.type_name})
    return results

@router.get("/{fieldId}")
def getSensors(fieldId: int, sensorType: Optional[int] = Query(-1), token: Annotated[str | None, Header()] = None, db: Session = Depends(get_db)):
    user_id = get_current_user(token, db)
    stmt = (
        select(
            Sensor.sensorid,
            Sensor.fieldid,
            Sensor.value,
            SensorTypes.name.label("type_name"),
        )
        .filter(Sensor.fieldid == fieldId)
        .join(SensorTypes, Sensor.typeid == SensorTypes.id)
    )
    if sensorType >= 0:
        stmt = stmt.filter(SensorTypes.id == sensorType)

    results = []
    for row in db.execute(stmt).all():
        results.append({"sensorid": row.sensorid, "fieldid": row.fieldid, "value": row.value, "name": row.type_name})
    return results