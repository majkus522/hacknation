import requests

def get_historical_weather_data(latitude, longitude, start_date, end_date):
    url = "https://archive-api.open-meteo.com/v1/archive"

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date,
        "end_date": end_date,
        "daily": "rain_sum",
        "timezone": "auto"
    }

    response = requests.get(url, params=params, timeout=15)
    response.raise_for_status()

    data = response.json()

    return [
        {
            "date": date,
            "rain_sum": rain
        }
        for date, rain in zip(
            data["daily"]["time"],
            data["daily"]["rain_sum"]
        )
    ]

def get_forecast_weather_data(latitude, longitude):
    url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": "rain",
        "timezone": "auto"
    }

    response = requests.get(url, params=params, timeout=15)
    response.raise_for_status()

    data = response.json()

    return [
        {
            "date": date,
            "rain": rain
        }
        for date, rain in zip(
            data["hourly"]["time"],
            data["hourly"]["rain"]
        )
    ]