from .utils import crop_monthly_thresholds
from .current_analysis import analyze_current
from .historical_analysis import analyze_historical
from .soil_analysis import analyze_soil_moisture
from .risk_and_recommendations import assess_risk, generate_recommendations


def build_report(
    crop,
    field,
    current_records,
    historical_records,
    source_dates,
    forecast_records=None,
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
    )
    risk = assess_risk(current, historical, soil)
    recommendations = generate_recommendations(current, historical, soil)

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
        },
        "historical_drought_vulnerability": historical,
        "risk": risk,
        "recommendations": recommendations,
        "sources": [{
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
        }],
        "limitations": [
            "Ocena opiera się na jednym punkcie reprezentującym działkę; granice działki nie są agregowane do rastra.",
            "Brak danych satelitarnych i informacji o glebie poza wilgotnością modelową Open-Meteo.",
            "Wysoka rozdzielczość danych może przejawiać niepewność modeli meteorologicznych.",
        ],
    }