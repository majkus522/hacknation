import math
from datetime import date, timedelta
from statistics import mean

import requests

BASE_URL = "http://open-meteo:8080"
ARCHIVE_END_DATE = date(2016, 12, 31)

DAILY_VARIABLES = [
    "rain_sum",
]

ANALYSIS_DAILY_VARIABLES = [
    "rain_sum",
]

HOURLY_VARIABLES = [
    "temperature_2m",
    "soil_moisture_0_to_7cm",
    "soil_moisture_7_to_28cm",
]

ANALYSIS_HOURLY_VARIABLES = HOURLY_VARIABLES

DAILY_VARIABLE_MAPPING = {
    "rain_sum": "rain_sum",
}

HOURLY_VARIABLE_MAPPING = {
    "temperature_mean": "temperature_2m",
    "soil_moisture_0_7cm": "soil_moisture_0_to_7cm",
    "soil_moisture_7_28cm": "soil_moisture_7_to_28cm",
}

def _parse_weather_data(data):
    daily = data.get("daily")

    if not daily or "time" not in daily:
        raise ValueError(
            "Open-Meteo did not return daily weather data"
        )

    results_by_date = {}
    for index, record_date in enumerate(daily["time"]):
        record = {"date": record_date}
        for output_name, api_name in DAILY_VARIABLE_MAPPING.items():
            values = daily.get(api_name)
            record[output_name] = (
                values[index]
                if values is not None and index < len(values)
                else None
            )
        results_by_date[record_date] = record

    hourly = data.get("hourly") or {}
    hourly_times = hourly.get("time", [])
    daily_hourly_values = {}
    for output_name, api_name in HOURLY_VARIABLE_MAPPING.items():
        values = hourly.get(api_name)
        if values is None:
            for record in results_by_date.values():
                record[output_name] = None
            continue

        per_date = {}
        for index, timestamp in enumerate(hourly_times):
            if index >= len(values) or values[index] is None:
                continue
            record_date = str(timestamp)[:10]
            per_date.setdefault(record_date, []).append(float(values[index]))
        daily_hourly_values[output_name] = per_date

    for record_date, record in results_by_date.items():
        for output_name in HOURLY_VARIABLE_MAPPING:
            values = daily_hourly_values.get(output_name, {}).get(record_date, [])
            record[output_name] = mean(values) if values else None

    return list(results_by_date.values())

def get_historical_weather_data(
    latitude,
    longitude,
    start_date,
    end_date,
    daily_variables=None,
    hourly_variables=None,
):
    url = f"{BASE_URL}/v1/archive"
    range_start = date.fromisoformat(start_date)
    range_end = date.fromisoformat(end_date)
    if range_start > range_end:
        raise ValueError("Historical start_date must be on or before end_date")

    results = []
    chunk_start = range_start
    while chunk_start <= range_end:
        next_year = date(chunk_start.year + 1, 1, 1)
        chunk_end = min(range_end, next_year - timedelta(days=1))
        params = {
            "latitude": latitude,
            "longitude": longitude,
            "start_date": chunk_start.isoformat(),
            "end_date": chunk_end.isoformat(),
            "daily": ",".join(daily_variables or DAILY_VARIABLES),
            "hourly": ",".join(hourly_variables or HOURLY_VARIABLES),
            "timezone": "auto",
        }

        response = requests.get(
            url,
            params=params,
            timeout=(10, 180),
        )
        response.raise_for_status()
        results.extend(_parse_weather_data(response.json()))
        chunk_start = chunk_end + timedelta(days=1)

    return results

def get_elevations(latitude, longitude, distance_m=100):
    lat_offset = distance_m / 111320
    lon_offset = distance_m / (111320 * abs(math.cos(math.radians(latitude))))

    points = (
        (latitude, longitude),
        (latitude + lat_offset, longitude),
        (latitude - lat_offset, longitude),
        (latitude, longitude + lon_offset),
        (latitude, longitude - lon_offset),
    )

    response = requests.get(
        f"{BASE_URL}/v1/elevation",
        params={
            "latitude": ",".join(str(lat) for lat, _ in points),
            "longitude": ",".join(str(lon) for _, lon in points),
        },
        timeout=(10, 60),
    )
    response.raise_for_status()

    elevations = response.json().get("elevation")
    if not isinstance(elevations, list) or len(elevations) != len(points):
        raise ValueError("Open-Meteo did not return elevation data")

    names = ("center", "north", "south", "east", "west")
    return dict(zip(names, elevations))

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
        "hourly": ",".join(HOURLY_VARIABLES),
        "forecast_days": forecast_days,
        "timezone": "auto"
    }

    response = requests.get(
        url,
        params=params,
        timeout=(10, 120)
    )

    response.raise_for_status()

    return _parse_weather_data(response.json())