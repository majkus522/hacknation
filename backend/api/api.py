import requests

url = "https://api.open-meteo.com/v1/forecast"

params = {
    "latitude": 52.2297,
    "longitude": 21.0122,
    "hourly": "rain"
}

response = requests.get(url, params=params, timeout=15)

print("Status:", response.status_code)
print("Response:", response.text[:1000])