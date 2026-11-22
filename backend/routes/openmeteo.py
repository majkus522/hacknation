from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import api.openmeteo as om
from analisys.report import build_report
from database import get_db
from routes.crop import get_crop_by_id

router = APIRouter()


@router.get("/test-weather/{crop_id}")
def test_weather(crop_id: int, db: Session = Depends(get_db)):
    latitude = 52.2297
    longitude = 21.0122

    crop = get_crop_by_id(db, crop_id)
    if crop is None:
        raise HTTPException(status_code=404, detail="Crop not found")

    try:
        historical = om.get_historical_weather_data(
            latitude,
            longitude,
            "2023-01-01",
            "2023-01-04",
        )
        forecast = om.get_forecast_weather_data(latitude, longitude, 7)

        return {
            "crop": {
                "id": crop.crop_id,
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
            },
            "historical_weather": historical,
            "forecast_weather": forecast,
        }
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Open-Meteo connection error: {exc}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/analysis/{crop_id}")
def analyze_location(
    crop_id: int,
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    field_name: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    crop = get_crop_by_id(db, crop_id)
    if crop is None:
        raise HTTPException(status_code=404, detail="Crop not found")

    current_to = date.today() - timedelta(days=1)
    current_from = current_to - timedelta(days=29)
    historical_to = current_to

    try:
        historical_from = date(
            current_to.year - 10,
            current_to.month,
            current_to.day,
        )
    except ValueError:
        historical_from = date(current_to.year - 10, current_to.month, 28)

    retrieved_at = datetime.now(timezone.utc).isoformat()

    try:
        historical = om.get_historical_weather_data(
            latitude,
            longitude,
            historical_from.isoformat(),
            historical_to.isoformat(),
        )
        current = [
            record
            for record in historical
            if current_from.isoformat() <= record["date"] <= historical_to.isoformat()
        ]
        forecast = om.get_forecast_weather_data(latitude, longitude, 7)

        field = SimpleNamespace(
            fieldid=None,
            name=field_name,
            y=latitude,
            x=longitude,
            points=None,
        )
        report = build_report(
            crop=crop,
            field=field,
            current_records=current,
            historical_records=historical,
            forecast_records=forecast,
            source_dates={
                "historical_from": historical_from.isoformat(),
                "historical_to": historical_to.isoformat(),
                "current_from": current_from.isoformat(),
                "current_to": historical_to.isoformat(),
                "retrieved_at": retrieved_at,
            },
        )
        report["forecast_weather"] = forecast
        return report
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Open-Meteo connection error: {exc}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
