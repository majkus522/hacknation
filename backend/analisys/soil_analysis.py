from collections import defaultdict
from statistics import mean
from .utils import month_key

def monthly_soil_moisture(records):
    values = defaultdict(lambda: defaultdict(list))

    for record in records:
        year, month = month_key(record["date"])
        for depth in (
            "soil_moisture_0_7cm",
            "soil_moisture_7_28cm",
        ):
            value = record.get(depth)
            if value is not None:
                values[(year, month)][depth].append(float(value))

    return {
        key: {
            depth: round(mean(readings), 4)
            for depth, readings in depths.items()
        }
        for key, depths in values.items()
    }

def analyze_soil_moisture(records, start_date=None, end_date=None, soil_profile=None):
    monthly = monthly_soil_moisture(records)
    if not monthly:
        result = {"available": False, "depths": {}, "overall_anomaly_mm3": None}
        if soil_profile is not None:
            result["physical_profile"] = soil_profile
        return result

    baseline = defaultdict(list)
    latest_key = max(monthly)

    for (year, month), depths in monthly.items():
        for depth, value in depths.items():
            baseline[(month, depth)].append(value)

    depths_result = {}
    anomalies = []
    labels = {
        "soil_moisture_0_7cm": "0-7 cm",
        "soil_moisture_7_28cm": "7-28 cm",
    }

    for depth in labels:
        latest_value = monthly.get(latest_key, {}).get(depth)
        month = latest_key[1]
        typical_values = baseline.get((month, depth), [])
        if latest_value is None:
            continue

        typical = mean(typical_values)
        anomaly = latest_value - typical
        anomalies.append(anomaly)
        depths_result[depth] = {
            "label": labels[depth],
            "latest_value": round(latest_value, 4),
            "typical_value": round(typical, 4),
            "anomaly": round(anomaly, 4),
        }

    result = {
        "available": bool(depths_result),
        "depths": depths_result,
        "overall_anomaly_mm3": round(mean(anomalies), 4) if anomalies else None,
    }

    if soil_profile is not None:
        result["physical_profile"] = soil_profile

    return result