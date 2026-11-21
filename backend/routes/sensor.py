from typing import Annotated
from fastapi import APIRouter, Depends, Header
from sqlalchemy import select
from sqlalchemy.orm import Session
from database import get_db
from models.sensor import Sensor
from models.sensorType import SensorTypes
from security import get_current_user

router = APIRouter()

@router.get("/{fieldId}")
def getSensors(fieldId: int, token: Annotated[str | None, Header()] = None, db: Session = Depends(get_db)):
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

    results = []
    for row in db.execute(stmt).all():
        results.append({"sensorid": row.sensorid, "fieldid": row.fieldid, "value": row.value, "name": row.type_name})
    return results