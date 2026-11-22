from datetime import date, datetime

MONTH_NAMES = (
    "",
    "styczeń",
    "luty",
    "marzec",
    "kwiecień",
    "maj",
    "czerwiec",
    "lipiec",
    "sierpień",
    "wrzesień",
    "październik",
    "listopad",
    "grudzień",
)

def month_key(record_date):
    if isinstance(record_date, datetime):
        return record_date.year, record_date.month
    if isinstance(record_date, date):
        return record_date.year, record_date.month
    parsed = datetime.strptime(str(record_date)[:10], "%Y-%m-%d")
    return parsed.year, parsed.month

def crop_monthly_thresholds(crop):
    names = (
        "I", "II", "III", "IV", "V", "VI",
        "VII", "VIII", "IX", "X", "XI", "XII",
    )
    return {
        month: getattr(crop, name, None)
        for month, name in enumerate(names, start=1)
    }