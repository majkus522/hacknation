from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models.crop import Crop

router = APIRouter()


@router.get("/")
def list_crops(db: Session = Depends(get_db)):
    crops = get_all_crops(db)
    return [
        {
            "crop_id": crop.crop_id,
            "name": crop.name,
            "consumption_from": crop.consumption_from,
            "consumption_to": crop.consumption_to,
            "monthly_rainfall": {
                "I": crop.I,
                "II": crop.II,
                "III": crop.III,
                "IV": crop.IV,
                "V": crop.V,
                "VI": crop.VI,
                "VII": crop.VII,
                "VIII": crop.VIII,
                "IX": crop.IX,
                "X": crop.X,
                "XI": crop.XI,
                "XII": crop.XII,
            },
        }
        for crop in crops
    ]

def get_crop_by_id(db: Session, crop_id: int):
    return (
        db.query(Crop)
        .filter(Crop.crop_id == crop_id)
        .first()
    )

def get_all_crops(db: Session):
    return db.query(Crop).order_by(Crop.name).all()