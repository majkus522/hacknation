
import requests


BASE_URL = "http://open-meteo:8080"


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

        "daily": ",".join([
            "temperature_2m_mean",
            "relative_humidity_2m_mean",
            "precipitation_sum",
            "rain_sum",
            "soil_moisture_0_to_7cm_mean",
            "soil_moisture_7_to_28cm_mean",
            "soil_moisture_28_to_100cm_mean"
        ]),

        "timezone": "auto"
    }

    response = requests.get(
        url,
        params=params,
        timeout=60
    )

    response.raise_for_status()

    data = response.json()
    daily = data["daily"]

    results = []

    for i, date in enumerate(daily["time"]):
        results.append({
            "date": date,
            "temperature_mean": daily["temperature_2m_mean"][i],
            "humidity_mean": daily["relative_humidity_2m_mean"][i],
            "precipitation_sum": daily["precipitation_sum"][i],
            "rain_sum": daily["rain_sum"][i],
            "soil_moisture_0_7cm": daily["soil_moisture_0_to_7cm_mean"][i],
            "soil_moisture_7_28cm": daily["soil_moisture_7_to_28cm_mean"][i],
            "soil_moisture_28_100cm": daily["soil_moisture_28_to_100cm_mean"][i]
        })

    return results
