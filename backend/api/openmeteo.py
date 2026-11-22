import requests

BASE_URL = "http://open-meteo:8080"

DAILY_VARIABLES = [
    "temperature_2m_mean",
    "temperature_2m_min",
    "temperature_2m_max",
    "relative_humidity_2m_mean",
    "rain_sum",
    "soil_moisture_0_to_7cm_mean",
    "soil_moisture_7_to_28cm_mean",
    "soil_moisture_28_to_100cm_mean"
]

VARIABLE_MAPPING = {
    "temperature_mean": "temperature_2m_mean",
    "temperature_min": "temperature_2m_min",
    "temperature_max": "temperature_2m_max",
    "humidity_mean": "relative_humidity_2m_mean",
    "rain_sum": "rain_sum",
    "soil_moisture_0_7cm": "soil_moisture_0_to_7cm_mean",
    "soil_moisture_7_28cm": "soil_moisture_7_to_28cm_mean",
    "soil_moisture_28_100cm": "soil_moisture_28_to_100cm_mean"
}

def _parse_daily_data(data):
    daily = data.get("daily")

    if not daily or "time" not in daily:
        raise ValueError(
            "Open-Meteo did not return daily weather data"
        )

    results = []

    for i, date in enumerate(daily["time"]):
        record = {"date": date}

        for output_name, api_name in VARIABLE_MAPPING.items():
            values = daily.get(api_name)

            record[output_name] = (
                values[i]
                if values is not None and i < len(values)
                else None
            )

        results.append(record)

    return results

def get_historical_weather_data(
    latitude,
    longitude,
    start_date,
    end_date
):
    url = f"{BASE_URL}/v1/archive"

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date,
        "end_date": end_date,
        "daily": ",".join(DAILY_VARIABLES),
        "timezone": "auto"
    }

    response = requests.get(
        url,
        params=params,
        timeout=60
    )

    response.raise_for_status()

    return _parse_daily_data(response.json())

def get_forecast_weather_data(
    latitude,
    longitude,
    forecast_days=7
):
    url = f"{BASE_URL}/v1/forecast"

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": ",".join(DAILY_VARIABLES),
        "forecast_days": forecast_days,
        "timezone": "auto"
    }

    response = requests.get(
        url,
        params=params,
        timeout=60
    )

    response.raise_for_status()

    return _parse_daily_data(response.json())
