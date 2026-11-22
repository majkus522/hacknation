(function () {
    "use strict";

    window.PerunMap = window.PerunMap || {};
    const { OVERLAY_META } = window.PerunMap.config;
    const { loadOfflineSensorsMap } = window.PerunMap.api;

    const COORD_SCALE_FACTOR = 260;

    // Współrzędne czujek z init_2.sql jako bezpieczny fallback, gdy API nie zwraca x/y
    const INIT_SENSOR_COORDS_BY_ID = {
        1: { x: 0.4, y: 0.4 },
        2: { x: 0.3, y: 0.6 },
        3: { x: 0.6, y: 0.1 },
        4: { x: 0.3, y: 0.7 },
        5: { x: 0.3, y: 0.9 },
        6: { x: 0.1, y: 0.9 },
    };

    function getPropCaseInsensitive(obj, candidates) {
        if (!obj || typeof obj !== "object") return undefined;
        for (const key of candidates) {
            if (obj[key] !== undefined && obj[key] !== null) return obj[key];
        }
        const lowerMap = {};
        for (const [k, v] of Object.entries(obj)) {
            lowerMap[k.toLowerCase()] = v;
        }
        for (const key of candidates) {
            const val = lowerMap[key.toLowerCase()];
            if (val !== undefined && val !== null) return val;
        }
        return undefined;
    }

    function parsePointsArray(rawPoints) {
        let pts = rawPoints;
        if (typeof pts === "string") {
            try {
                pts = JSON.parse(pts);
            } catch {
                pts = [];
            }
        }
        if (!Array.isArray(pts) || pts.length < 3) {
            pts = [
                { x: 0.0, y: 0.1 },
                { x: 0.85, y: 0.15 },
                { x: 1.0, y: 0.9 },
            ];
        }
        return pts;
    }

    function detectScaleFactor(pts) {
        const isNormalized = pts.every(
            (p) => Math.abs(Number(p.x)) <= 1.5 && Math.abs(Number(p.y)) <= 1.5,
        );
        return isNormalized ? COORD_SCALE_FACTOR : 1;
    }

    function buildCornersFromPoints(rawPoints) {
        const pts = parsePointsArray(rawPoints);
        const factor = detectScaleFactor(pts);

        return {
            factor,
            isNormalized: factor === COORD_SCALE_FACTOR,
            corners: pts.map((p, idx) => ({
                id: `P${idx + 1}`,
                x: Number((Number(p.x) * factor).toFixed(1)),
                y: Number((Number(p.y) * factor).toFixed(1)),
            })),
        };
    }

    function computeCentroid(corners) {
        const cx =
            corners.reduce((acc, c) => acc + c.x, 0) / (corners.length || 1);
        const cy =
            corners.reduce((acc, c) => acc + c.y, 0) / (corners.length || 1);
        return { x: cx, y: cy };
    }

    function computeBounds(corners) {
        const xs = corners.map((c) => c.x);
        const ys = corners.map((c) => c.y);
        return {
            minX: Math.min(...xs),
            maxX: Math.max(...xs),
            minY: Math.min(...ys),
            maxY: Math.max(...ys),
        };
    }

    function classifyDbSensorStatus(typeId, val) {
        if (typeId === 1) {
            if (val < 18 || val > 75) return "crit";
            if (val < 30 || val > 65) return "warn";
            return "ok";
        }
        if (typeId === 2) {
            if (val < 0 || val > 34) return "crit";
            if (val < 5 || val > 28) return "warn";
            return "ok";
        }
        return "ok";
    }

    function resolveSensorTypeId(rawType, typeName) {
        const num = Number(rawType);
        if (!Number.isNaN(num) && (num === 1 || num === 2)) return num;

        const label = String(typeName || rawType || "").toLowerCase();
        if (label.includes("wilg") || label.includes("moist")) return 1;
        if (
            label.includes("temp") ||
            label.includes("term") ||
            label.includes("therm")
        )
            return 2;
        return Number.isNaN(num) ? 2 : num;
    }

    function hydrateParcels(rawFields, rawSensors) {
        const offlineMap = loadOfflineSensorsMap();
        const fieldsArr = Array.isArray(rawFields)
            ? rawFields
            : Array.isArray(rawFields?.items)
              ? rawFields.items
              : [];
        const sensorsArr = Array.isArray(rawSensors)
            ? rawSensors
            : Array.isArray(rawSensors?.items)
              ? rawSensors.items
              : [];

        return fieldsArr.map((f) => {
            const fieldId = getPropCaseInsensitive(f, [
                "fieldId",
                "fieldid",
                "field_id",
                "id",
            ]);
            const rawPoints = getPropCaseInsensitive(f, ["points"]);
            const { corners, factor } = buildCornersFromPoints(rawPoints);
            const centroid = computeCentroid(corners);
            const bounds = computeBounds(corners);

            const dbFieldSensors = sensorsArr.filter((s) => {
                const sFieldId = getPropCaseInsensitive(s, [
                    "fieldId",
                    "fieldid",
                    "field_id",
                ]);
                return Number(sFieldId) === Number(fieldId);
            });

            const activeSensors = dbFieldSensors.map((s) => {
                const sid = getPropCaseInsensitive(s, [
                    "sensorId",
                    "sensorid",
                    "sensor_id",
                    "id",
                ]);
                const rawType = getPropCaseInsensitive(s, [
                    "typeId",
                    "typeid",
                    "type_id",
                    "type",
                ]);
                const typeName = getPropCaseInsensitive(s, [
                    "name",
                    "type_name",
                    "typeName",
                ]);
                const rawVal = Number(
                    getPropCaseInsensitive(s, ["value", "val", "reading"]),
                );

                const typeId = resolveSensorTypeId(rawType, typeName);

                let rawXVal = getPropCaseInsensitive(s, [
                    "x",
                    "posX",
                    "pos_x",
                    "coordX",
                    "coord_x",
                    "sensorX",
                    "sensor_x",
                ]);
                let rawYVal = getPropCaseInsensitive(s, [
                    "y",
                    "posY",
                    "pos_y",
                    "coordY",
                    "coord_y",
                    "sensorY",
                    "sensor_y",
                ]);

                if (
                    (rawXVal === undefined || rawYVal === undefined) &&
                    INIT_SENSOR_COORDS_BY_ID[Number(sid)]
                ) {
                    rawXVal = INIT_SENSOR_COORDS_BY_ID[Number(sid)].x;
                    rawYVal = INIT_SENSOR_COORDS_BY_ID[Number(sid)].y;
                }

                const hasDbCoords =
                    rawXVal !== undefined &&
                    rawXVal !== null &&
                    rawYVal !== undefined &&
                    rawYVal !== null &&
                    !Number.isNaN(Number(rawXVal)) &&
                    !Number.isNaN(Number(rawYVal));

                let sx = centroid.x;
                let sy = centroid.y;

                if (hasDbCoords) {
                    const nx = Number(rawXVal);
                    const ny = Number(rawYVal);
                    const isNorm = Math.abs(nx) <= 1.5 && Math.abs(ny) <= 1.5;

                    if (isNorm) {
                        const spanX = bounds.maxX - bounds.minX || factor;
                        const spanY = bounds.maxY - bounds.minY || factor;
                        sx = Number((bounds.minX + nx * spanX).toFixed(1));
                        sy = Number((bounds.minY + ny * spanY).toFixed(1));
                    } else {
                        sx = Number(nx.toFixed(1));
                        sy = Number(ny.toFixed(1));
                    }
                }

                const isMoisture = typeId === 1;
                const isTemp =
                    typeId === 2 || (!isMoisture && !Number.isNaN(rawVal));

                const moistureVal =
                    isMoisture && !Number.isNaN(rawVal)
                        ? Number(
                              (rawVal <= 1 ? rawVal * 100 : rawVal).toFixed(1),
                          )
                        : null;
                const tempVal =
                    isTemp && !Number.isNaN(rawVal)
                        ? Number(rawVal.toFixed(1))
                        : null;

                const status = classifyDbSensorStatus(
                    isMoisture ? 1 : 2,
                    isMoisture ? moistureVal : tempVal,
                );

                return {
                    id: `DB-${sid}`,
                    name:
                        typeName ||
                        (isMoisture
                            ? `Czujnik wilgoci #${sid}`
                            : `Termometr #${sid}`),
                    x: sx,
                    y: sy,
                    normX: hasDbCoords ? Number(rawXVal) : null,
                    normY: hasDbCoords ? Number(rawYVal) : null,
                    status,
                    temp: tempVal,
                    moisture: moistureVal,
                    source: "database",
                    lastSeen: "Baza danych (aktywna)",
                };
            });

            const localOffline = Array.isArray(offlineMap[String(fieldId)])
                ? offlineMap[String(fieldId)]
                : [];

            return {
                fieldId,
                name:
                    getPropCaseInsensitive(f, ["name"]) ||
                    `Działka #${fieldId}`,
                coordX: Number(getPropCaseInsensitive(f, ["x"]) ?? 21.304768),
                coordY: Number(getPropCaseInsensitive(f, ["y"]) ?? 50.317156),
                rawPoints,
                weather: null,
                corners,
                sensors: [...activeSensors, ...localOffline],
            };
        });
    }

    function getActiveSensors(parcel, baseMetric) {
        return (parcel?.sensors || []).filter(
            (s) =>
                s.status !== "offline" &&
                s[baseMetric] !== null &&
                s[baseMetric] !== undefined &&
                !Number.isNaN(Number(s[baseMetric])),
        );
    }

    function getWeatherDefaultValue(parcel, baseMetric) {
        const w = parcel?.weather;
        if (!w) {
            return baseMetric === "temp" ? 14.2 : 50.0;
        }
        if (baseMetric === "temp") {
            return typeof w.temperature === "number" ? w.temperature : 14.2;
        }
        return typeof w.relativeHumidity === "number"
            ? w.relativeHumidity
            : 50.0;
    }

    function evaluateBaseScalarAt(parcel, x, y, baseMetric) {
        const active = getActiveSensors(parcel, baseMetric);

        if (active.length === 0) {
            return getWeatherDefaultValue(parcel, baseMetric);
        }

        if (active.length === 1) {
            return Number(active[0][baseMetric]);
        }

        let weightedSum = 0;
        let weightTotal = 0;

        for (let i = 0; i < active.length; i++) {
            const s = active[i];
            const val = Number(s[baseMetric]);
            const dist = Math.hypot(x - s.x, y - s.y);
            if (dist < 0.001) return val;
            const w = 1 / (dist * dist);
            weightedSum += w * val;
            weightTotal += w;
        }

        return weightedSum / weightTotal;
    }

    function computePointIrrigationMetrics(parcel, x, y) {
        const temp = evaluateBaseScalarAt(parcel, x, y, "temp");
        const moisture = Math.max(
            1,
            Math.min(100, evaluateBaseScalarAt(parcel, x, y, "moisture")),
        );

        const svp = 0.61078 * Math.exp((17.27 * temp) / (temp + 237.3));
        const vpd = Math.max(0, svp * (1 - moisture / 100));

        const w = parcel?.weather || {};
        const windKmh = typeof w.windSpeed === "number" ? w.windSpeed : 8.0;
        const radFactor =
            typeof w.uvIndex === "number"
                ? 0.55 + Math.min(w.uvIndex, 10) * 0.11
                : typeof w.cloudCover === "number"
                  ? 1.25 - (w.cloudCover / 100) * 0.55
                  : 1.0;
        const windFactor = 1 + (windKmh / 25) * 0.45;
        const tempFactor = Math.max(0.1, (temp + 5) / 20);
        const et = Math.max(
            0,
            (0.62 * tempFactor * radFactor + 1.8 * vpd) * windFactor,
        );

        const moistureDeficit = Math.max(
            0,
            Math.min(100, ((65 - moisture) / 50) * 100),
        );
        const etDemand = Math.max(0, Math.min(100, (et / 6.5) * 100));
        const precipMm =
            typeof w.precipitationAmount === "number"
                ? w.precipitationAmount
                : 0;
        const precipProb =
            typeof w.precipitationProbability === "number"
                ? w.precipitationProbability
                : 0;
        const rainCredit = Math.min(45, precipMm * 8 + (precipProb / 100) * 18);
        const irrigation = Math.max(
            0,
            Math.min(
                100,
                0.58 * moistureDeficit + 0.42 * etDemand - rainCredit,
            ),
        );

        return {
            temp,
            moisture,
            vpd,
            et,
            irrigation,
        };
    }

    function evaluateModeValueAt(parcel, x, y, mode) {
        const metrics = computePointIrrigationMetrics(parcel, x, y);
        if (mode === "off") return metrics.temp;
        return metrics[mode] ?? metrics.temp;
    }

    function describeModeValue(mode, val) {
        if (mode === "temp") {
            if (val < 5) return "Chłodno (wolny wzrost)";
            if (val <= 25) return "Optymalna temperatura";
            if (val <= 34) return "Gorąco (wysokie parowanie)";
            return "Ekstremalny upał";
        }
        if (mode === "moisture") {
            if (val < 30) return "Niska wilgotność – sucho";
            if (val <= 70) return "Optymalna wilgotność";
            return "Wysoka wilgotność";
        }
        if (mode === "vpd") {
            if (val < 0.45) return "Niskie VPD – wolna transpiracja";
            if (val <= 1.35) return "Optymalne VPD dla roślin";
            return "Wysokie VPD – stres wodny";
        }
        if (mode === "et") {
            if (val < 2.0) return "Niskie parowanie";
            if (val <= 4.5) return "Umiarkowana ewapotranspiracja";
            return "Wysoka strata wody";
        }
        if (mode === "irrigation") {
            if (val < 30) return "Brak potrzeby podlewania";
            if (val < 60) return "Umiarkowane zapotrzebowanie";
            return "Zalecane nawadnianie";
        }
        return "";
    }

    function computeParcelSummary(parcel, mode) {
        const activeTemp = getActiveSensors(parcel, "temp");
        const activeMoisture = getActiveSensors(parcel, "moisture");
        const anyActiveSensors =
            activeTemp.length > 0 || activeMoisture.length > 0;
        const offlineCount = (parcel.sensors || []).filter(
            (s) => s.status === "offline",
        ).length;

        const targetMode = mode === "off" ? "temp" : mode;
        const centroid = computeCentroid(parcel.corners);

        const samplePoints = [centroid, ...parcel.corners];
        [...activeTemp, ...activeMoisture].forEach((s) =>
            samplePoints.push({ x: s.x, y: s.y }),
        );

        const values = samplePoints.map((pt) =>
            evaluateModeValueAt(parcel, pt.x, pt.y, targetMode),
        );
        const avg = values.reduce((a, b) => a + b, 0) / values.length;

        return {
            hasSensors: anyActiveSensors,
            activeTempCount: activeTemp.length,
            activeMoistureCount: activeMoisture.length,
            offlineCount,
            value: avg,
            min: Math.min(...values),
            max: Math.max(...values),
        };
    }

    function interpolateColor(value, mode) {
        const meta = OVERLAY_META[mode] || OVERLAY_META.temp;
        const clamped = Math.max(meta.min, Math.min(meta.max, value));
        const t = (clamped - meta.min) / (meta.max - meta.min || 1);

        const stops = meta.stops;
        for (let i = 0; i < stops.length - 1; i++) {
            const a = stops[i];
            const b = stops[i + 1];
            if (t >= a.t && t <= b.t) {
                const localT = (t - a.t) / (b.t - a.t || 1);
                return [
                    Math.round(a.r + (b.r - a.r) * localT),
                    Math.round(a.g + (b.g - a.g) * localT),
                    Math.round(a.b + (b.b - a.b) * localT),
                ];
            }
        }
        const last = stops[stops.length - 1];
        return [last.r, last.g, last.b];
    }

    function isPointInPolygon(pt, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x;
            const yi = polygon[i].y;
            const xj = polygon[j].x;
            const yj = polygon[j].y;

            const intersect =
                yi > pt.y !== yj > pt.y &&
                pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi || 1e-9) + xi;
            if (intersect) inside = !inside;
        }
        return inside;
    }

    window.PerunMap.math = {
        buildCornersFromPoints,
        computeCentroid,
        computeBounds,
        classifyDbSensorStatus,
        hydrateParcels,
        getActiveSensors,
        getWeatherDefaultValue,
        evaluateBaseScalarAt,
        computePointIrrigationMetrics,
        evaluateModeValueAt,
        describeModeValue,
        computeParcelSummary,
        interpolateColor,
        isPointInPolygon,
    };
})();
