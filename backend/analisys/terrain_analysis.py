import math

def analyze_terrain(elevations, distance_m=100):
    if not elevations or any(value is None for value in elevations.values()):
        return {
            "available": False,
            "source": "Open-Meteo elevation",
            "message": "Brak danych wysokościowych.",
        }

    center = float(elevations["center"])
    north = float(elevations["north"])
    south = float(elevations["south"])
    east = float(elevations["east"])
    west = float(elevations["west"])

    dz_dx = (east - west) / (2 * distance_m)
    dz_dy = (north - south) / (2 * distance_m)
    slope_m_per_m = (dz_dx ** 2 + dz_dy ** 2) ** 0.5
    slope_percent = slope_m_per_m * 100

    if slope_percent < 2:
        category = "płaskie"
        runoff_risk = "niskie"
    elif slope_percent < 6:
        category = "lekko nachylone"
        runoff_risk = "umiarkowane"
    elif slope_percent < 15:
        category = "średnio nachylone"
        runoff_risk = "wysokie"
    else:
        category = "strome"
        runoff_risk = "bardzo wysokie"

    if dz_dx == 0 and dz_dy == 0:
        direction = "bez wyraźnego kierunku"
    else:
        angle = (360 + math.degrees(math.atan2(dz_dx, dz_dy))) % 360
        directions = ("Północ", "Północny wschód", "Wschód", "Południowy wschód", "Południe", "Południowy zachód", "Zachód", "Północny zachód")
        direction = directions[round(angle / 45) % 8]

    relief_range = max(north, south, east, west, center) - min(north, south, east, west, center)

    return {
        "available": True,
        "source": "Open-Meteo elevation",
        "sampling_distance_m": distance_m,
        "elevation_m": round(center, 1),
        "slope_percent": round(slope_percent, 2),
        "slope_degrees": round(math.degrees(math.atan(slope_m_per_m)), 2),
        "terrain_category": category,
        "aspect": direction,
        "relief_range_m": round(relief_range, 1),
        "surface_runoff_risk": runoff_risk,
    }