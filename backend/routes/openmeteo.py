from fastapi import APIRouter, HTTPException
import api.openmeteo as om

router = APIRouter()

@router.get("/test-weather")
def test_weather():
    latitude = 52.2297
    longitude = 21.0122
    try:
        historical = om.get_historical_weather_data(
            latitude,
            longitude,
            "2023-01-01",
            "2023-01-04"
        )

        forecast = om.get_forecast_weather_data(
            latitude,
            longitude
        )

        return {
            "historical_weather": historical,
            "forecast_weather": forecast
        }

    except Exception as e:
        print("OPENMETEO ERROR:", repr(e))
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )
