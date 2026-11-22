from .utils import crop_monthly_thresholds
from .current_analysis import analyze_current
from .historical_analysis import analyze_historical
from .soil_analysis import analyze_soil_moisture
from .risk_and_recommendations import assess_risk, generate_recommendations
from .terrain_analysis import analyze_terrain

def build_report(
    crop,
    field,
    current_records,
    historical_records,
    source_dates,
    forecast_records=None,
    soil_profile=None,
    terrain_profile=None,
    hydrology_profile=None,
):
    thresholds = crop_monthly_thresholds(crop)
    current = analyze_current(current_records, thresholds)
    historical = analyze_historical(
        historical_records,
        thresholds,
        source_dates["historical_from"],
        source_dates["historical_to"],
    )
    soil = analyze_soil_moisture(
        historical_records,
        source_dates["historical_from"],
        source_dates["historical_to"],
        soil_profile,
    )
    terrain = terrain_profile or {"available": False, "source": "Open-Meteo elevation", "message": "Brak danych wysokościowych."}
    hydrology = hydrology_profile or {"available": False, "source": "OpenStreetMap Overpass API", "message": "Brak danych hydrologicznych."}
    risk = assess_risk(current, historical, soil, terrain, hydrology)
    recommendations = generate_recommendations(current, historical, soil, terrain, hydrology)

    return {
        "plot": {
            "id": getattr(field, "fieldid", None),
            "name": getattr(field, "name", None),
            "location": {
                "latitude": getattr(field, "y", None),
                "longitude": getattr(field, "x", None),
            },
            "area_unit_points": getattr(field, "points", None),
        },
        "crop": {
            "id": getattr(crop, "crop_id", None),
            "name": getattr(crop, "name", None),
            "consumption_from": getattr(crop, "consumption_from", None),
            "consumption_to": getattr(crop, "consumption_to", None),
            "monthly_rainfall_norm": {
                str(month): threshold
                for month, threshold in thresholds.items()
                if threshold is not None
            },
        },
        "current_situation": {
            **current,
            "soil_moisture": soil,
            "terrain": terrain,
            "hydrology": hydrology,
        },
        "historical_drought_vulnerability": historical,
        "analysis_date": source_dates.get("analysis_date"),
        "forecast_weather": forecast_records or [],
        "forecast_note": source_dates.get("forecast_note"),
        "risk": risk,
        "recommendations": recommendations,
        "sources": [
            {
                "name": "Open-Meteo lokalna instancja",
                "historical_range": {
                    "from": source_dates["historical_from"],
                    "to": source_dates["historical_to"],
                },
                "current_range": {
                    "from": source_dates["current_from"],
                    "to": source_dates["current_to"],
                },
                "retrieved_at": source_dates["retrieved_at"],
            },
            {
                "name": "Open-Meteo elevation",
                "retrieved_at": source_dates["retrieved_at"],
                "available": bool(terrain.get("available")),
                "sampling_distance_m": terrain.get("sampling_distance_m"),
            },
            {
                "name": "OpenStreetMap Overpass API",
                "retrieved_at": source_dates["retrieved_at"],
                "available": bool(hydrology.get("available")),
                "search_radius_m": hydrology.get("search_radius_m"),
            },
            {
                "name": "Mapa Glebowo-Rolnicza Geoportal 1:5000",
                "url": "https://mapy.geoportal.gov.pl/wss/service/pub/guest/MapaGlebowoRolnicza/MapServer/WMSServer",
                "retrieved_at": source_dates["retrieved_at"],
                "available": bool(soil_profile and soil_profile.get("available")),
            },
        ],
        "limitations": [
            "Ocena opiera się na jednym punkcie reprezentującym działkę; granice działki nie są agregowane do rastra.",
            "Mapa glebowo-rolnicza dostarcza klasyfikację gleby w punkcie; nie zastępuje badania mechanicznego i chemicznego gleby.",
            "Nachylenie i kierunek stoku są estymowane z 5 punktów wysokościowych wokół lokalizacji, a nie z pełnej geometrii działki.",
            "Bliskość wody pochodzi z OpenStreetMap i nie potwierdza możliwości poboru ani prawnego prawa do wody.",
            "Wysoka rozdzielczość danych może przejawiać niepewność modeli meteorologicznych.",
        ],
    }