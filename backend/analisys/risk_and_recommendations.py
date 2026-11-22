def assess_risk(current, historical, soil, terrain=None, hydrology=None):
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

    if _has_low_retention_soil(soil):
        score += 15
        components.append("gleba o potencjalnie niskiej zdolności retencji")

    terrain = terrain or {}
    if terrain.get("available") and terrain.get("surface_runoff_risk") in (
        "wysokie",
        "bardzo wysokie",
    ):
        score += 15
        components.append("istotne nachylenie sprzyjające spływowi powierzchniowemu")

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

def _has_low_retention_soil(soil):
    profile = soil.get("physical_profile")
    if not profile or not profile.get("available"):
        return False

    attrs = profile.get("raw_attributes", {})
    text = " ".join(str(value or "").lower() for value in attrs.values())
    sandy_markers = (
        "gleby piaszczyste", "piaski luźne", "piaski słabogliniaste",
        "piaski gliniaste", "żwiry", "ps", "pgl", "plw",
    )
    return any(marker in text for marker in sandy_markers)


def generate_recommendations(current, historical, soil, terrain=None, hydrology=None):
    recommendations = []

    if current["available"] and current["deficit_total_mm"] >= 20:
        recommendations.append({
            "category": "nawadnianie",
            "action": "Ocena możliwości uzupełnienia niedoboru wodą",
            "reason": "Bieżący miesięczny niedobór opadów względem normy uprawy wynosi co najmniej 20 mm.",
        })

    hydrology = hydrology or {}
    nearby_reservoir = hydrology.get("nearest_reservoir")
    nearby_waterway = hydrology.get("nearest_waterway")
    nearby_source = None

    if nearby_reservoir and nearby_reservoir["distance_m"] <= 2000:
        nearby_source = nearby_reservoir
    elif nearby_waterway and nearby_waterway["distance_m"] <= 2000:
        nearby_source = nearby_waterway

    if current["available"] and current["deficit_total_mm"] >= 20 and nearby_source:
        source_name = (
            nearby_source.get("name")
            or nearby_source.get("reservoir_type")
            or nearby_source.get("waterway_type")
            or "lokalny obiekt wodny"
        )
        recommendations.append({
            "category": "nawadnianie",
            "action": "Ocena możliwości technicznego i prawnego wykorzystania bliskiego źródła wody",
            "reason": (
                f"W pobliżu, około {nearby_source['distance_m']} m, znajduje się {source_name}. "
                "Zanim podejmie się pobór, wymagane są ocena dostępności, pozwolenia i warunki środowiskowe."
            ),
        })

    if soil["available"]:
        anomaly = soil.get("overall_anomaly_mm3")
        if anomaly is not None and anomaly < -0.05:
            recommendations.append({
                "category": "retencja gleby",
                "action": "Rozważenie działań poprawiających retencję gleby",
                "reason": "Wilgotność dostępnych warstw gleby jest poniżej typowej wartości historycznej dla bieżącego miesiąca.",
            })

    if _has_low_retention_soil(soil):
        if not any(
            item["action"] == "Rozważenie działań poprawiających retencję gleby"
            for item in recommendations
        ):
            recommendations.append({
                "category": "retencja gleby",
                "action": "Rozważenie działań poprawiających retencję gleby",
                "reason": "Mapa glebowo-rolnicza wskazuje gatunek gleby o potencjalnie niskiej zdolności retencji.",
            })

    terrain = terrain or {}
    if terrain.get("available") and terrain.get("surface_runoff_risk") in (
        "wysokie",
        "bardzo wysokie",
    ):
        recommendations.append({
            "category": "spływ powierzchniowy",
            "action": "Rozważenie działań ograniczających spływ",
            "reason": (
                f"Nachylenie terenu wynosi {terrain['slope_percent']}% "
                f"({terrain['terrain_category']}), co zwiększa ryzyko spływu."
            ),
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