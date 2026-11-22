from collections import defaultdict
from .utils import MONTH_NAMES, month_key

def monthly_precipitation(records):
    totals = defaultdict(float)
    counts = defaultdict(int)

    for record in records:
        value = record.get("rain_sum")
        if value is None:
            continue

        year, month = month_key(record["date"])
        totals[(year, month)] += float(value)
        counts[(year, month)] += 1

    return {key: round(value, 1) for key, value in totals.items()}, counts

def analyze_current(records, thresholds):
    monthly, _ = monthly_precipitation(records)
    if not monthly:
        return {"available": False, "monthly": [], "deficit_total_mm": 0.0}

    result = []
    deficit_total = 0.0

    for (year, month), rainfall in sorted(monthly.items(), key=lambda item: item[0]):
        threshold = thresholds.get(month)
        deficit = (
            max(float(threshold) - rainfall, 0.0)
            if threshold is not None
            else None
        )
        if deficit is not None:
            deficit_total += deficit

        result.append({
            "year": year,
            "month": month,
            "month_name": MONTH_NAMES[month],
            "rainfall_mm": rainfall,
            "crop_norm_mm": threshold,
            "deficit_mm": round(deficit, 1) if deficit is not None else None,
        })

    return {
        "available": True,
        "monthly": result,
        "deficit_total_mm": round(deficit_total, 1),
    }