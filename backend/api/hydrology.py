import math
import requests

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

def _haversine_m(latitude1, longitude1, latitude2, longitude2):
    radius_m = 6371000
    lat1 = math.radians(latitude1)
    lat2 = math.radians(latitude2)
    delta_lat = math.radians(latitude2 - latitude1)
    delta_lon = math.radians(longitude2 - longitude1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return 2 * radius_m * math.asin(min(1, math.sqrt(a)))

def _nearest_distance(latitude, longitude, geometry):
    return min(
        (
            _haversine_m(latitude, longitude, point["lat"], point["lon"])
            for point in geometry
        ),
        default=None,
    )

def get_hydrology_features(latitude, longitude, radius_m=5000):
    query = f"""
[out:json][timeout:25];
(
  way["waterway"~"river|stream|canal|drain"](around:{radius_m},{latitude},{longitude});
  way["natural"="water"](around:{radius_m},{latitude},{longitude});
  way["landuse"="reservoir"](around:{radius_m},{latitude},{longitude});
);
out geom qt;
"""

    response = requests.post(
        OVERPASS_URL,
        data={"data": query},
        headers={"User-Agent": "Perun-Hacknation/1.0"},
        timeout=40,
    )
    response.raise_for_status()
    elements = response.json().get("elements", [])

    reservoirs = []
    waterways = []

    for element in elements:
        geometry = element.get("geometry")
        if not geometry:
            continue

        distance = _nearest_distance(latitude, longitude, geometry)
        if distance is None:
            continue

        tags = element.get("tags", {})
        item = {
            "osm_type": element.get("type"),
            "osm_id": element.get("id"),
            "name": tags.get("name"),
            "distance_m": round(distance),
        }

        if "waterway" in tags:
            item["waterway_type"] = tags["waterway"]
            item["perennial"] = tags.get("intermittent") != "yes"
            waterways.append(item)
        else:
            item["reservoir_type"] = tags.get("water", tags.get("landuse", "natural_water"))
            reservoirs.append(item)

    reservoirs.sort(key=lambda item: item["distance_m"])
    waterways.sort(key=lambda item: item["distance_m"])

    nearest_reservoir = reservoirs[0] if reservoirs else None
    nearest_waterway = waterways[0] if waterways else None

    def proximity(distance):
        if distance is None:
            return "brak w promieniu"
        if distance <= 500:
            return "bardzo blisko"
        if distance <= 2000:
            return "blisko"
        if distance <= 5000:
            return "w oddaleniu"
        return "poza analizowanym promieniem"

    return {
        "available": True,
        "source": "OpenStreetMap Overpass API",
        "coordinates": {"latitude": latitude, "longitude": longitude},
        "search_radius_m": radius_m,
        "nearest_reservoir": nearest_reservoir,
        "nearest_waterway": nearest_waterway,
        "reservoir_proximity": proximity(nearest_reservoir["distance_m"] if nearest_reservoir else None),
        "waterway_proximity": proximity(nearest_waterway["distance_m"] if nearest_waterway else None),
        "reservoir_count": len(reservoirs),
        "waterway_count": len(waterways),
        "reservoirs": reservoirs[:10],
        "waterways": waterways[:10],
    }