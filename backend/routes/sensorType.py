from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from database import get_db
from models.sensorType import SensorTypes

router = APIRouter()

@router.get("/")
def getSensorTypes(db: Session = Depends(get_db)):
    return db.query(SensorTypes).all()