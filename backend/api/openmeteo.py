import openmeteo_requests
import pandas as pd
import requests_cache
from retry_requests import retry

cache_session = requests_cache.CachedSession('.cache', expire_after = -1)
retry_session = retry(cache_session, retries = 5, backoff_factor = 0.2)
openmeteo = openmeteo_requests.Client(session = retry_session)

def get_historical_weather_data(latitude, longitude, start_date, end_date):
    """
    Pobieranie historycznych danych pogodowych z API Open-Meteo na podstawie podanej 
    szerokości i długości geograficznej i daty.
    """
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date,
        "end_date": end_date,
        "daily": "Rain Sum",
    }

    responses = openmeteo.weather_api(url, params = params)

    response = responses[0]
    print(f"Coordinates: {abs(response.Latitude())}°{'S' if response.Latitude() < 0 else 'N'} {abs(response.Longitude())}°{'W' if response.Longitude() < 0 else 'E'}")
    print(f"Elevation: {response.Elevation()} m asl")
    print(f"Timezone difference to GMT+0: {response.UtcOffsetSeconds()}s")

    daily = response.Daily()
    daily_rain_sum = daily.Variables(0).ValuesAsNumpy()

    daily_data = {
        "date": pd.date_range(
            start = pd.to_datetime(daily.Time(), unit = "s", utc = True),
            end =  pd.to_datetime(daily.TimeEnd(), unit = "s", utc = True),
            freq = pd.Timedelta(seconds = daily.Interval()),
            inclusive = "left"
        )
    }

    daily_data["rain_sum"] = daily_rain_sum

    daily_dataframe = pd.DataFrame(data = daily_data)
    print("\nDaily data\n", daily_dataframe)