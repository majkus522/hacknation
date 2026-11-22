def assess_risk(current, historical, soil):
    components = []
    score = 0

    if current["available"]:
        deficit = current["deficit_total_mm"]
        if deficit >= 40:
            score += 35
            components.append("wysoki bieżący deficyt opadów")
        elif deficit >= 20:
            score += 20
            components.append("umiarkowany bieżący deficyt opadów")

    largest = historical.get("largest_deficit", {}).get("value_mm", 0)
    repeatability = historical.get("repeatability_by_month", {})
    repeating = sum(
        1 for item in repeatability.values()
        if item["frequency"] >= 0.4
    )

    if largest >= 40:
        score += 25
        components.append("duży niedobór w historii")
    elif largest >= 20:
        score += 15
        components.append("istotny niedobór w historii")
    if repeating:
        score += 20
        components.append("powtarzalność niedoborów w miesiącach uprawowych")

    if soil["available"]:
        anomaly = soil.get("overall_anomaly_mm3")
        if anomaly is not None and anomaly < -0.05:
            score += 20
            components.append("wilgotność gleby poniżej typowego poziomu")

    if score >= 70:
        level = "wysokie"
    elif score >= 40:
        level = "umiarkowane"
    elif score >= 20:
        level = "niskie"
    else:
        level = "bardzo niskie"

    return {
        "level": level,
        "score": min(score, 100),
        "components": components,
    }

def generate_recommendations(current, historical, soil):
    recommendations = []

    if current["available"] and current["deficit_total_mm"] >= 20:
        recommendations.append({
            "category": "nawadnianie",
            "action": "Ocena możliwości uzupełnienia niedoboru wodą",
            "reason": "Bieżący miesięczny niedobór opadów względem normy uprawy wynosi co najmniej 20 mm.",
        })

    if soil["available"]:
        anomaly = soil.get("overall_anomaly_mm3")
        if anomaly is not None and anomaly < -0.05:
            recommendations.append({
                "category": "retencja gleby",
                "action": "Rozważenie działań poprawiających retencję gleby",
                "reason": "Wilgotność dostępnych warstw gleby jest poniżej typowej wartości historycznej dla bieżącego miesiąca.",
            })

    frequent_months = [
        item for item in historical.get("repeatability_by_month", {}).values()
        if item["frequency"] >= 0.4
    ]
    if frequent_months:
        names = ", ".join(item["name"] for item in frequent_months)
        recommendations.append({
            "category": "agrotechnika",
            "action": "Dostosowanie terminu siewu lub struktury upraw",
            "reason": f"W historii niedobory powtarzały się szczególnie w miesiącach: {names}.",
        })

    if not recommendations:
        recommendations.append({
            "category": "monitoring",
            "action": "Kontynuowanie monitorowania opadów i wilgotności gleby",
            "reason": "Aktualne dane nie spełniają progów wymagających natychmiastowej interwencji.",
        })

    return recommendations