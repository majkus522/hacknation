import time

from fastapi import APIRouter, HTTPException

import api.openmeteo as om

router = APIRouter()


@router.get("/test-simple")
def test_simple():
    return {"status": "ok", "message": "FastAPI działa"}

import time
import requests


@router.get("/test-connection")
def test_connection():
    start = time.perf_counter()

    try:
        response = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": 52.2297,
                "longitude": 21.0122,
                "current": "temperature_2m",
            },
            timeout=10,
        )

        response.raise_for_status()

        return {
            "status": "ok",
            "time": round(time.perf_counter() - start, 2),
            "data": response.json(),
        }

    except requests.RequestException as e:
        return {
            "status": "error",
            "time": round(time.perf_counter() - start, 2),
            "error": str(e),
        }

@router.get("/test-weather")
def test_weather():
    latitude = 52.2297
    longitude = 21.0122

    try:
        print("Rozpoczynam pobieranie danych", flush=True)

        start = time.perf_counter()

        print("Pobieranie danych historycznych...", flush=True)

        historical = om.get_historical_weather_data(
            latitude,
            longitude,
            "2023-01-01",
            "2023-01-04",
        )

        historical_time = time.perf_counter()

        print(
            f"Dane historyczne: "
            f"{historical_time - start:.2f} s",
            flush=True,
        )

        print("Pobieranie prognozy...", flush=True)

        forecast = om.get_forecast_weather_data(
            latitude,
            longitude,
        )

        forecast_time = time.perf_counter()

        print(
            f"Prognoza: "
            f"{forecast_time - historical_time:.2f} s",
            flush=True,
        )

        print(
            f"Łączny czas pobierania: "
            f"{forecast_time - start:.2f} s",
            flush=True,
        )

        return {
            "historical_weather": historical,
            "forecast_weather": forecast,
        }

    except Exception as e:
        print("OPENMETEO ERROR:", repr(e), flush=True)

        raise HTTPException(
            status_code=500,
            detail=str(e),
        )

latitude = 52.2297
longitude = 21.0122

try:
    print("Rozpoczynam pobieranie danych", flush=True)

    start = time.perf_counter()

    print("Pobieranie danych historycznych...", flush=True)

    print("dupen")
    historical = om.get_historical_weather_data(
        latitude,
        longitude,
        "2023-01-01",
        "2023-01-04",
    )

    print("dupa")
    historical_time = time.perf_counter()

    print(
        f"Dane historyczne: "
        f"{historical_time - start:.2f} s",
        flush=True,
    )

    print("Pobieranie prognozy...", flush=True)

    forecast = om.get_forecast_weather_data(
        latitude,
        longitude,
    )

    forecast_time = time.perf_counter()

    print(
        f"Prognoza: "
        f"{forecast_time - historical_time:.2f} s",
        flush=True,
    )

    print(
        f"Łączny czas pobierania: "
        f"{forecast_time - start:.2f} s",
        flush=True,
    )

    print(historical)
    print(forecast)

except Exception as e:
    print("OPENMETEO ERROR:", repr(e), flush=True)

    raise HTTPException(
        status_code=500,
        detail=str(e),
    )