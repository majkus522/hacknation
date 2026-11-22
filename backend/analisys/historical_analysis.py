from collections import defaultdict
from datetime import date
from statistics import mean

from .utils import MONTH_NAMES, month_key
from .current_analysis import monthly_precipitation

def analyze_historical(records, thresholds, start_date, end_date):
    monthly, _ = monthly_precipitation(records)
    if not monthly:
        return {
            "period": {"from": start_date, "to": end_date},
            "months_below_crop_norm": 0,
            "average_deficit_mm": 0.0,
            "largest_deficit": {"value_mm": 0.0, "month": None, "year": None},
            "dry_period_count": 0,
            "rainfall_anomaly_by_month": {},
            "repeatability_by_month": {},
            "coverage_months": 0,
            "missing_data_note": "Brak danych opadowych w analizowanym okresie.",
        }

    deficiency_rows = []
    deficits_by_month = defaultdict(list)
    rainfall_by_month = defaultdict(list)

    for (year, month), rainfall in monthly.items():
        rainfall_by_month[month].append(rainfall)
        threshold = thresholds.get(month)
        if threshold is not None:
            deficit = max(float(threshold) - rainfall, 0.0)
            deficits_by_month[month].append(deficit)
            if deficit > 0:
                deficiency_rows.append({
                    "year": year,
                    "month": month,
                    "value_mm": round(deficit, 1),
                })

    end_year = date.fromisoformat(end_date).year
    anomaly_by_month = {}
    for month in range(1, 13):
        values = rainfall_by_month.get(month)
        threshold = thresholds.get(month)
        if not values:
            continue

        typical = mean(values)
        last_value = monthly.get((end_year, month), typical)
        anomaly_by_month[str(month)] = {
            "name": MONTH_NAMES[month],
            "typical_rainfall_mm": round(typical, 1),
            "last_value_mm": round(last_value, 1),
            "anomaly_mm": round(last_value - typical, 1),
            "crop_norm_mm": threshold,
        }

    repeatability = {}
    for month in range(1, 13):
        deficits = deficits_by_month.get(month, [])
        if not deficits:
            continue

        deficient_count = sum(value > 0 for value in deficits)
        repeatability[str(month)] = {
            "name": MONTH_NAMES[month],
            "years_with_deficit": deficient_count,
            "observed_years": len(deficits),
            "frequency": round(deficient_count / len(deficits), 3),
            "average_deficit_mm": round(mean(deficits), 1),
        }

    dry_period_count = 0
    in_dry_period = False
    for (year, month), rainfall in sorted(monthly.items(), key=lambda item: item[0]):
        threshold = thresholds.get(month)
        is_dry = threshold is not None and rainfall < float(threshold)
        if is_dry and not in_dry_period:
            dry_period_count += 1
        in_dry_period = is_dry

    if deficiency_rows:
        largest = max(deficiency_rows, key=lambda row: row["value_mm"])
    else:
        largest = {"year": None, "month": None, "value_mm": 0.0}

    deficit_values = [row["value_mm"] for row in deficiency_rows]
    return {
        "period": {"from": start_date, "to": end_date},
        "months_below_crop_norm": len(deficiency_rows),
        "average_deficit_mm": round(mean(deficit_values), 1) if deficit_values else 0.0,
        "largest_deficit": {
            **largest,
            "month_name": MONTH_NAMES[largest["month"]] if largest["month"] else None,
        },
        "dry_period_count": dry_period_count,
        "rainfall_anomaly_by_month": anomaly_by_month,
        "repeatability_by_month": repeatability,
        "coverage_months": len(monthly),
    }