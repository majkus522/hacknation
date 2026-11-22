from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
import xml.etree.ElementTree as ET

import requests
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import api.openmeteo as om
import api.geoportal as geoportal
import api.hydrology as hydrology
from analisys.report import build_report
from analisys.terrain_analysis import analyze_terrain
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


@router.get("/soil")
def get_soil_at_location(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    try:
        return geoportal.get_soil_feature(latitude, longitude)
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Geoportal WMS connection error: {exc}",
        )
    except (ValueError, ET.ParseError) as exc:
        raise HTTPException(status_code=502, detail=f"Invalid Geoportal response: {exc}")


@router.get("/terrain")
def get_terrain_at_location(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
):
    try:
        elevations = om.get_elevations(latitude, longitude)
        return analyze_terrain(elevations)
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Open-Meteo elevation connection error: {exc}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.get("/hydrology")
def get_hydrology_at_location(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    radius_m: int = Query(default=5000, ge=100, le=50000),
):
    try:
        return hydrology.get_hydrology_features(
            latitude,
            longitude,
            radius_m,
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Hydrology data connection error: {exc}",
        )


@router.get("/analysis/{crop_id}")
def analyze_location(
    crop_id: int,
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    field_name: str | None = Query(default=None),
    analysis_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    crop = get_crop_by_id(db, crop_id)
    if crop is None:
        raise HTTPException(status_code=404, detail="Crop not found")

    latest_available_date = om.ARCHIVE_END_DATE
    current_to = analysis_date or latest_available_date
    if current_to > latest_available_date:
        raise HTTPException(
            status_code=422,
            detail=f"Data analizy nie może być późniejsza niż {latest_available_date.isoformat()}",
        )

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
            daily_variables=om.ANALYSIS_DAILY_VARIABLES,
            hourly_variables=om.ANALYSIS_HOURLY_VARIABLES,
        )
        current = [
            record
            for record in historical
            if current_from.isoformat() <= record["date"] <= historical_to.isoformat()
        ]
        forecast = []
        try:
            soil_profile = geoportal.get_soil_feature(latitude, longitude)
        except (requests.RequestException, ValueError, ET.ParseError):
            soil_profile = {
                "available": False,
                "source": "Geoportal Mapa Glebowo-Rolnicza 1:5000",
                "message": "Nie udało się pobrać danych gleby.",
            }

        try:
            terrain_profile = analyze_terrain(
                om.get_elevations(latitude, longitude)
            )
        except (requests.RequestException, ValueError):
            terrain_profile = {
                "available": False,
                "source": "Open-Meteo elevation",
                "message": "Nie udało się pobrać danych wysokościowych.",
            }

        try:
            hydrology_profile = hydrology.get_hydrology_features(
                latitude,
                longitude,
                radius_m=5000,
            )
        except requests.RequestException:
            hydrology_profile = {
                "available": False,
                "source": "OpenStreetMap Overpass API",
                "message": "Nie udało się pobrać danych o ciekach i zbiornikach wodnych.",
            }

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
            soil_profile=soil_profile,
            terrain_profile=terrain_profile,
            hydrology_profile=hydrology_profile,
            source_dates={
                "historical_from": historical_from.isoformat(),
                "historical_to": historical_to.isoformat(),
                "current_from": current_from.isoformat(),
                "current_to": historical_to.isoformat(),
                "retrieved_at": retrieved_at,
                "analysis_date": current_to.isoformat(),
                "forecast_note": (
                    "Lokalne archiwum Open-Meteo kończy się na 2016-12-31; "
                    "prognoza bieżąca nie odpowiada wybranej historycznej dacie."
                ),
            },
        )
        return report
    except requests.Timeout as exc:
        raise HTTPException(
            status_code=504,
            detail=f"Open-Meteo request timed out: {exc}",
        )
    except requests.RequestException as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Open-Meteo connection error: {exc}",
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))