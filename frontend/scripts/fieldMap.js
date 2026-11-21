(function () {
    "use strict";

    const SVG_NS = "http://www.w3.org/2000/svg";
    const OFFLINE_SENSORS_KEY = "perun_offline_sensors_by_field_v1";

    const CLIENT_GOOGLE_WEATHER_KEY = window.PERUN_GOOGLE_WEATHER_API_KEY || "";

    const OVERLAY_META = {
        off: {
            label: "Wyłączona",
            shortLabel: "Brak nakładki",
            unit: "",
            decimals: 0,
            hint: "",
        },
        temp: {
            label: "Temperatura",
            shortLabel: "Temperatura (°C)",
            unit: "°C",
            decimals: 1,
            min: -5,
            max: 35,
            hint: "Optimum: 12–24°C",
            stops: [
                { t: 0.0, r: 37, g: 99, b: 235 },
                { t: 0.38, r: 50, g: 167, b: 58 },
                { t: 0.72, r: 234, g: 179, b: 8 },
                { t: 1.0, r: 220, g: 38, b: 38 },
            ],
        },
        moisture: {
            label: "Wilgotność",
            shortLabel: "Wilgotność (%)",
            unit: "%",
            decimals: 1,
            min: 10,
            max: 95,
            hint: "Optimum: 45–70%",
            stops: [
                { t: 0.0, r: 220, g: 38, b: 38 },
                { t: 0.35, r: 234, g: 179, b: 8 },
                { t: 0.7, r: 50, g: 167, b: 58 },
                { t: 1.0, r: 2, g: 132, b: 199 },
            ],
        },
        vpd: {
            label: "Deficyt VPD",
            shortLabel: "Deficyt VPD (kPa)",
            unit: " kPa",
            decimals: 2,
            min: 0.0,
            max: 2.8,
            hint: "Optimum: 0.8–1.2 kPa",
            stops: [
                { t: 0.0, r: 2, g: 132, b: 199 },
                { t: 0.35, r: 50, g: 167, b: 58 },
                { t: 0.62, r: 234, g: 179, b: 8 },
                { t: 1.0, r: 220, g: 38, b: 38 },
            ],
        },
        et: {
            label: "Ewapotranspiracja ET₀",
            shortLabel: "Ewapotranspiracja (mm/d)",
            unit: " mm/d",
            decimals: 2,
            min: 0.0,
            max: 7.5,
            hint: "Strata wody z pola",
            stops: [
                { t: 0.0, r: 14, g: 165, b: 233 },
                { t: 0.33, r: 50, g: 167, b: 58 },
                { t: 0.68, r: 234, g: 179, b: 8 },
                { t: 1.0, r: 220, g: 38, b: 38 },
            ],
        },
        irrigation: {
            label: "Potrzeba nawadniania",
            shortLabel: "Priorytet nawadniania (%)",
            unit: "%",
            decimals: 0,
            min: 0,
            max: 100,
            hint: ">60% zalecane podlewanie",
            stops: [
                { t: 0.0, r: 50, g: 167, b: 58 },
                { t: 0.4, r: 163, g: 230, b: 53 },
                { t: 0.68, r: 234, g: 179, b: 8 },
                { t: 1.0, r: 220, g: 38, b: 38 },
            ],
        },
    };

    const STATUS_COLORS = {
        ok: "#32a73a",
        warn: "#eab308",
        crit: "#dc2626",
        offline: "#64748b",
    };

    const STATUS_LABELS = {
        ok: "OK (aktywna)",
        warn: "Ostrzeżenie (aktywna)",
        crit: "Krytyczny (aktywna)",
        offline: "Offline (ignorowana)",
    };

    const state = {
        parcels: [],
        selectedFieldId: null,
        overlayMode: "temp",
        selectedSensorId: null,
        probePoint: null,
        addSensorMode: false,
        showSensors: true,
        view: {
            scale: 1.5,
            offsetX: 120,
            offsetY: 80,
            isPanning: false,
            panStartX: 0,
            panStartY: 0,
            movedDuringDrag: false,
        },
    };

    async function fetchJsonSafe(path) {
        const variants = path.endsWith("/") ? [path] : [`${path}/`, path];
        for (const url of variants) {
            try {
                const res = await window.PerunAuth.authFetch(url);
                if (res.ok) return await res.json();
            } catch {
                /* kolejna próba */
            }
        }
        return null;
    }

    function loadOfflineSensorsMap() {
        try {
            return JSON.parse(
                localStorage.getItem(OFFLINE_SENSORS_KEY) || "{}",
            );
        } catch {
            return {};
        }
    }

    function saveOfflineSensorsForField(fieldId, offlineSensors) {
        try {
            const map = loadOfflineSensorsMap();
            map[String(fieldId)] = offlineSensors;
            localStorage.setItem(OFFLINE_SENSORS_KEY, JSON.stringify(map));
        } catch {
            /* ignoruj */
        }
    }

    function buildCornersFromPoints(rawPoints) {
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

        const isNormalized = pts.every(
            (p) => Math.abs(Number(p.x)) <= 1.5 && Math.abs(Number(p.y)) <= 1.5,
        );
        const factor = isNormalized ? 260 : 1;

        return pts.map((p, idx) => ({
            id: `P${idx + 1}`,
            x: Number((Number(p.x) * factor).toFixed(1)),
            y: Number((Number(p.y) * factor).toFixed(1)),
        }));
    }

    function computeCentroid(corners) {
        const cx =
            corners.reduce((acc, c) => acc + c.x, 0) / (corners.length || 1);
        const cy =
            corners.reduce((acc, c) => acc + c.y, 0) / (corners.length || 1);
        return { x: cx, y: cy };
    }

    function classifyDbSensorStatus(typeId, val) {
        if (typeId === 1) {
            if (val < 15 || val > 70) return "crit";
            if (val < 25 || val > 60) return "warn";
            return "ok";
        }
        if (typeId === 2) {
            if (val < -3 || val > 34) return "crit";
            if (val < 0 || val > 28) return "warn";
            return "ok";
        }
        return "ok";
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
            const fieldId = f.fieldid ?? f.fieldId ?? f.field_id ?? f.id;
            const corners = buildCornersFromPoints(f.points);
            const centroid = computeCentroid(corners);

            const dbFieldSensors = sensorsArr.filter(
                (s) =>
                    Number(s.fieldid ?? s.fieldId ?? s.field_id) ===
                    Number(fieldId),
            );

            const activeSensors = dbFieldSensors.map((s, idx) => {
                const sid = s.sensorid ?? s.sensorId ?? s.sensor_id ?? s.id;
                const typeId = Number(s.typeid ?? s.typeId ?? s.type_id);
                const rawVal = Number(s.value);

                const angle =
                    (idx * 2 * Math.PI) / Math.max(dbFieldSensors.length, 1);
                const offsetR = dbFieldSensors.length === 1 ? 0 : 28;
                const sx = Number(
                    (centroid.x + Math.cos(angle) * offsetR).toFixed(1),
                );
                const sy = Number(
                    (centroid.y + Math.sin(angle) * offsetR).toFixed(1),
                );

                const isMoisture = typeId === 1;
                const isTemp = typeId === 2;
                const moistureVal = isMoisture
                    ? Number((rawVal <= 1 ? rawVal * 100 : rawVal).toFixed(1))
                    : null;
                const tempVal = isTemp ? Number(rawVal.toFixed(1)) : null;

                const status = classifyDbSensorStatus(
                    typeId,
                    isMoisture ? moistureVal : tempVal,
                );

                return {
                    id: `DB-${sid}`,
                    name: isMoisture
                        ? `Czujnik wilgoci #${sid}`
                        : isTemp
                          ? `Termometr #${sid}`
                          : `Czujka #${sid}`,
                    x: sx,
                    y: sy,
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
                name: f.name || `Działka #${fieldId}`,
                coordX: Number(f.x ?? 21.4256),
                coordY: Number(f.y ?? 50.2871),
                rawPoints: f.points,
                weather: null,
                corners,
                sensors: [...activeSensors, ...localOffline],
            };
        });
    }

    /* --- GOOGLE WEATHER API --- */
    function parseGoogleWeatherPayload(data, lat, lon) {
        const tempObj = data.temperature || {};
        const feelsObj = data.feelsLikeTemperature || {};
        const dewObj = data.dewPoint || {};
        const precipObj = data.precipitation || {};
        const probObj = precipObj.probability || {};
        const qpfObj = precipObj.qpf || {};
        const windObj = data.wind || {};
        const windSpeedObj = windObj.speed || {};
        const windDirObj = windObj.direction || {};
        const pressureObj = data.airPressure || {};
        const condObj = data.weatherCondition || {};

        return {
            source: "Google Weather API",
            lat,
            lon,
            condition:
                condObj.description?.text || condObj.type || "Warunki bieżące",
            temperature: Number(tempObj.degrees ?? 14.0),
            feelsLikeTemperature:
                feelsObj.degrees != null ? Number(feelsObj.degrees) : null,
            relativeHumidity: Number(data.relativeHumidity ?? 50),
            dewPoint: dewObj.degrees != null ? Number(dewObj.degrees) : null,
            precipitationProbability: probObj.percent ?? null,
            precipitationAmount: qpfObj.quantity ?? 0,
            windSpeed: windSpeedObj.value ?? null,
            windDirection: windDirObj.cardinal ?? null,
            airPressure: pressureObj.meanSeaLevelMillibars ?? null,
            uvIndex: data.uvIndex ?? null,
            cloudCover: data.cloudCover ?? null,
        };
    }

    async function fetchWeatherForParcel(parcel, forceRefresh = false) {
        if (!parcel) return null;
        if (parcel.weather && !forceRefresh) return parcel.weather;

        const lat = parcel.coordY;
        const lon = parcel.coordX;

        const hudEl = document.getElementById("hudWeatherSummary");
        if (hudEl) {
            hudEl.textContent = `Pobieranie (${lat.toFixed(4)}, ${lon.toFixed(4)})...`;
        }

        try {
            const backendRes = await window.PerunAuth.authFetch(
                `/weather/?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
            );
            if (backendRes.ok) {
                const weatherData = await backendRes.json();
                parcel.weather = weatherData;
                return weatherData;
            }
        } catch {
            /* fallback */
        }

        if (CLIENT_GOOGLE_WEATHER_KEY) {
            try {
                const gUrl = new URL(
                    "https://weather.googleapis.com/v1/currentConditions:lookup",
                );
                gUrl.searchParams.set("key", CLIENT_GOOGLE_WEATHER_KEY);
                gUrl.searchParams.set("location.latitude", String(lat));
                gUrl.searchParams.set("location.longitude", String(lon));
                gUrl.searchParams.set("languageCode", "pl");

                const gRes = await fetch(gUrl.toString());
                if (gRes.ok) {
                    const parsed = parseGoogleWeatherPayload(
                        await gRes.json(),
                        lat,
                        lon,
                    );
                    parcel.weather = parsed;
                    return parsed;
                }
            } catch {
                /* fallback */
            }
        }

        try {
            const omUrl = new URL("https://api.open-meteo.com/v1/forecast");
            omUrl.searchParams.set("latitude", String(lat));
            omUrl.searchParams.set("longitude", String(lon));
            omUrl.searchParams.set(
                "current",
                "temperature_2m,relative_humidity_2m,apparent_temperature,dew_point_2m,precipitation,cloud_cover,surface_pressure,wind_speed_10m,uv_index",
            );
            const omRes = await fetch(omUrl.toString());
            if (omRes.ok) {
                const cur = (await omRes.json()).current || {};
                const parsed = {
                    source: "Weather API",
                    lat,
                    lon,
                    condition: "Warunki bieżące",
                    temperature: Number(cur.temperature_2m ?? 14.0),
                    feelsLikeTemperature: cur.apparent_temperature ?? null,
                    relativeHumidity: Number(cur.relative_humidity_2m ?? 50),
                    dewPoint: cur.dew_point_2m ?? null,
                    precipitationProbability: null,
                    precipitationAmount: cur.precipitation ?? 0,
                    windSpeed: cur.wind_speed_10m ?? null,
                    windDirection: null,
                    airPressure: cur.surface_pressure ?? null,
                    uvIndex: cur.uv_index ?? null,
                    cloudCover: cur.cloud_cover ?? null,
                };
                parcel.weather = parsed;
                return parsed;
            }
        } catch {
            /* ignoruj */
        }

        return null;
    }

    function getCurrentParcel() {
        return (
            state.parcels.find(
                (p) => String(p.fieldId) === String(state.selectedFieldId),
            ) || state.parcels[0]
        );
    }

    function getActiveSensors(parcel, baseMetric) {
        return (parcel?.sensors || []).filter(
            (s) => s.status !== "offline" && typeof s[baseMetric] === "number",
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

    /* Bazowa interpolacja IDW dla temperatury lub wilgotności */
    function evaluateBaseScalarAt(parcel, x, y, baseMetric) {
        const active = getActiveSensors(parcel, baseMetric);

        if (active.length === 0) {
            return getWeatherDefaultValue(parcel, baseMetric);
        }

        if (active.length === 1) {
            return active[0][baseMetric];
        }

        let weightedSum = 0;
        let weightTotal = 0;

        for (let i = 0; i < active.length; i++) {
            const s = active[i];
            const dist = Math.hypot(x - s.x, y - s.y);
            if (dist < 0.001) return s[baseMetric];
            const w = 1 / (dist * dist);
            weightedSum += w * s[baseMetric];
            weightTotal += w;
        }

        return weightedSum / weightTotal;
    }

    /* Obliczenie wszystkich parametrów nawadniania w punkcie (x, y) */
    function computePointIrrigationMetrics(parcel, x, y) {
        const temp = evaluateBaseScalarAt(parcel, x, y, "temp");
        const moisture = Math.max(
            1,
            Math.min(100, evaluateBaseScalarAt(parcel, x, y, "moisture")),
        );

        // 1. Deficyt ciśnienia pary wodnej VPD (kPa)
        const svp = 0.61078 * Math.exp((17.27 * temp) / (temp + 237.3));
        const vpd = Math.max(0, svp * (1 - moisture / 100));

        // 2. Ewapotranspiracja odniesienia ET₀ (mm/dzień)
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

        // 3. Priorytet nawadniania (0-100%)
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

    function evaluateModeValueAt(parcel, x, y, mode = state.overlayMode) {
        const metrics = computePointIrrigationMetrics(parcel, x, y);
        if (mode === "off") return metrics.temp;
        return metrics[mode] ?? metrics.temp;
    }

    function describeModeValue(mode, val) {
        if (mode === "temp") {
            if (val < 5) return "Chłodno (wolny wzrost)";
            if (val <= 25) return "Optymalna temperatura";
            return "Upał (wysokie parowanie)";
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

    function computeParcelSummary(parcel, mode = state.overlayMode) {
        const activeTemp = getActiveSensors(parcel, "temp");
        const activeMoisture = getActiveSensors(parcel, "moisture");
        const anyActiveSensors =
            activeTemp.length > 0 || activeMoisture.length > 0;
        const offlineCount = (parcel.sensors || []).filter(
            (s) => s.status === "offline",
        ).length;

        const targetMode = mode === "off" ? "temp" : mode;
        const centroid = computeCentroid(parcel.corners);

        // Próbkujemy wierzchołki + środek + aktywne czujki
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

    /* --- KOLORY I SIATKA NAKŁADKI OXYGEN NOT INCLUDED --- */
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

    function createSvgEl(tag, attrs = {}) {
        const el = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
    }

    function renderOniOverlay(parcel) {
        const heatmapLayer = document.getElementById("heatmapLayer");
        const heatmapImage = document.getElementById("heatmapImage");
        const oniGridLayer = document.getElementById("oniGridLayer");
        if (!heatmapLayer || !heatmapImage || !oniGridLayer) return;

        const isVisible = state.overlayMode !== "off";
        heatmapLayer.style.display = isVisible ? "inline" : "none";
        if (!isVisible) return;

        const xs = parcel.corners.map((c) => c.x);
        const ys = parcel.corners.map((c) => c.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const width = Math.max(maxX - minX, 1);
        const height = Math.max(maxY - minY, 1);

        const cellSize = 18;
        const cols = Math.max(8, Math.min(44, Math.round(width / cellSize)));
        const rows = Math.max(8, Math.min(44, Math.round(height / cellSize)));

        const canvas = document.createElement("canvas");
        canvas.width = cols;
        canvas.height = rows;
        const ctx = canvas.getContext("2d");
        const imgData = ctx.createImageData(cols, rows);
        const data = imgData.data;

        for (let py = 0; py < rows; py++) {
            const wy = maxY - ((py + 0.5) / rows) * height;
            for (let px = 0; px < cols; px++) {
                const wx = minX + ((px + 0.5) / cols) * width;
                const val = evaluateModeValueAt(
                    parcel,
                    wx,
                    wy,
                    state.overlayMode,
                );
                const [r, g, b] = interpolateColor(val, state.overlayMode);
                const idx = (py * cols + px) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 192;
            }
        }

        ctx.putImageData(imgData, 0, 0);
        heatmapImage.setAttribute("x", minX);
        heatmapImage.setAttribute("y", -maxY);
        heatmapImage.setAttribute("width", width);
        heatmapImage.setAttribute("height", height);
        heatmapImage.style.imageRendering = "pixelated";
        heatmapImage.setAttribute("href", canvas.toDataURL("image/png"));

        oniGridLayer.innerHTML = "";
        const stepX = width / cols;
        const stepY = height / rows;
        let pathD = "";

        for (let c = 1; c < cols; c++) {
            const gx = (minX + c * stepX).toFixed(2);
            pathD += `M ${gx} ${(-maxY).toFixed(2)} L ${gx} ${(-minY).toFixed(2)} `;
        }
        for (let r = 1; r < rows; r++) {
            const gy = (-maxY + r * stepY).toFixed(2);
            pathD += `M ${minX.toFixed(2)} ${gy} L ${maxX.toFixed(2)} ${gy} `;
        }

        if (pathD) {
            oniGridLayer.appendChild(
                createSvgEl("path", {
                    d: pathD,
                    fill: "none",
                    stroke: "rgba(15, 23, 42, 0.22)",
                    "stroke-width": "0.75",
                }),
            );
        }
    }

    function renderFieldAndCorners(parcel) {
        const ptsStr = parcel.corners.map((c) => `${c.x},${-c.y}`).join(" ");
        document
            .getElementById("fieldClipPolygon")
            ?.setAttribute("points", ptsStr);

        const fieldLayer = document.getElementById("fieldLayer");
        const cornersLayer = document.getElementById("cornersLayer");
        fieldLayer.innerHTML = "";
        cornersLayer.innerHTML = "";

        const overlayActive = state.overlayMode !== "off";

        fieldLayer.appendChild(
            createSvgEl("polygon", {
                points: ptsStr,
                fill: overlayActive
                    ? "rgba(50, 167, 58, 0.03)"
                    : "rgba(50, 167, 58, 0.16)",
                stroke: overlayActive ? "#14532d" : "#32a73a",
                "stroke-width": "2.4",
                "stroke-linejoin": "round",
            }),
        );

        parcel.corners.forEach((c) => {
            const g = createSvgEl("g");
            g.appendChild(
                createSvgEl("circle", {
                    cx: c.x,
                    cy: -c.y,
                    r: "3.5",
                    fill: "#ffffff",
                    stroke: "#1f6b24",
                    "stroke-width": "1.6",
                }),
            );
            const label = createSvgEl("text", {
                x: c.x + 6,
                y: -c.y - 6,
                fill: "#334155",
                "font-size": "9",
                "font-weight": "600",
                "font-family": "ui-monospace, monospace",
            });
            label.textContent = c.id;
            g.appendChild(label);
            cornersLayer.appendChild(g);
        });
    }

    function renderSensors(parcel) {
        const sensorsLayer = document.getElementById("sensorsLayer");
        sensorsLayer.innerHTML = "";
        sensorsLayer.style.display = state.showSensors ? "inline" : "none";
        if (!state.showSensors) return;

        (parcel.sensors || []).forEach((sensor) => {
            const isOffline = sensor.status === "offline";
            const hasTemp = typeof sensor.temp === "number";
            const hasMoisture = typeof sensor.moisture === "number";
            const effectiveStatus = isOffline ? "offline" : sensor.status;
            const color = STATUS_COLORS[effectiveStatus];
            const isSelected = sensor.id === state.selectedSensorId;

            const g = createSvgEl("g", {
                class: `sensor-node${isSelected ? " active" : ""}`,
                "data-sensor-id": sensor.id,
            });

            g.appendChild(
                createSvgEl("circle", {
                    class: "sensor-halo",
                    cx: sensor.x,
                    cy: -sensor.y,
                    r: "12",
                    fill: color,
                    "fill-opacity":
                        effectiveStatus === "offline" ? "0.18" : "0.28",
                }),
            );

            g.appendChild(
                createSvgEl("circle", {
                    class: "sensor-ring",
                    cx: sensor.x,
                    cy: -sensor.y,
                    r: "5.5",
                    fill: color,
                    stroke: "#ffffff",
                    "stroke-width": "1.8",
                }),
            );

            const tag = createSvgEl("text", {
                x: sensor.x + 9,
                y: -sensor.y + 3,
                fill: effectiveStatus === "offline" ? "#475569" : "#181818",
                "font-size": "9.5",
                "font-weight": "700",
                "font-family": "system-ui, sans-serif",
            });

            let valText = "OFFLINE";
            if (!isOffline) {
                if (state.overlayMode === "moisture" && hasMoisture) {
                    valText = `${sensor.moisture.toFixed(1)}%`;
                } else if (hasTemp) {
                    valText = `${sensor.temp.toFixed(1)}°C`;
                } else if (hasMoisture) {
                    valText = `${sensor.moisture.toFixed(1)}%`;
                } else {
                    valText = "aktywna";
                }
            }

            tag.textContent = `${sensor.id} (${valText})`;
            g.appendChild(tag);

            g.addEventListener("click", (e) => {
                e.stopPropagation();
                state.selectedSensorId = sensor.id;
                renderAll();
            });

            sensorsLayer.appendChild(g);
        });
    }

    function renderProbe() {
        const probeLayer = document.getElementById("probeLayer");
        probeLayer.innerHTML = "";
        if (!state.probePoint) return;

        const { x, y } = state.probePoint;
        probeLayer.appendChild(
            createSvgEl("circle", {
                cx: x,
                cy: -y,
                r: "6",
                fill: "none",
                stroke: "#181818",
                "stroke-width": "1.6",
                "stroke-dasharray": "2,2",
            }),
        );
        probeLayer.appendChild(
            createSvgEl("circle", {
                cx: x,
                cy: -y,
                r: "2",
                fill: "#181818",
            }),
        );
    }

    function renderOverlayButtonsAndLegend() {
        document
            .querySelectorAll("#oniOverlayBar [data-overlay-mode]")
            .forEach((btn) => {
                btn.classList.toggle(
                    "is-active",
                    btn.dataset.overlayMode === state.overlayMode,
                );
            });

        const isOverlayOn = state.overlayMode !== "off";
        document.getElementById("heatmapLegendGroup").style.display =
            isOverlayOn ? "flex" : "none";
        document.getElementById("sensorsLegendGroup").style.display =
            state.showSensors ? "flex" : "none";
        document.getElementById("legendSep").style.display =
            isOverlayOn && state.showSensors ? "block" : "none";

        if (!isOverlayOn) return;

        const meta = OVERLAY_META[state.overlayMode];
        document.getElementById("legendTitle").textContent = `${meta.label}:`;
        document.getElementById("legendMin").textContent =
            `${meta.min}${meta.unit}`;
        document.getElementById("legendMax").textContent =
            `${meta.max}${meta.unit}`;
        document.getElementById("legendHint").textContent = meta.hint
            ? `(${meta.hint})`
            : "";

        const cssStops = meta.stops
            .map((s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${Math.round(s.t * 100)}%`)
            .join(", ");
        document.getElementById("legendGradient").style.background =
            `linear-gradient(90deg, ${cssStops})`;
    }

    function renderWeatherCard(parcel) {
        const w = parcel.weather;
        const hudEl = document.getElementById("hudWeatherSummary");
        const badgeEl = document.getElementById("weatherSourceBadge");

        if (!w) {
            if (hudEl) hudEl.textContent = "Brak odpowiedzi API";
            return;
        }

        if (badgeEl) badgeEl.textContent = w.source || "Google Weather API";
        if (hudEl) {
            const windStr =
                w.windSpeed != null ? ` • Wiatr ${w.windSpeed} km/h` : "";
            hudEl.textContent = `${w.temperature.toFixed(1)} °C • Wilg. ${w.relativeHumidity}%${windStr}`;
        }

        document.getElementById("weatherCondition").textContent =
            w.condition || "—";

        const feelsStr =
            w.feelsLikeTemperature != null
                ? `${Number(w.feelsLikeTemperature).toFixed(1)} °C`
                : "—";
        document.getElementById("weatherTempPair").textContent =
            `${w.temperature.toFixed(1)} °C / ${feelsStr}`;

        const dewStr =
            w.dewPoint != null ? `${Number(w.dewPoint).toFixed(1)} °C` : "—";
        document.getElementById("weatherHumidityPair").textContent =
            `${w.relativeHumidity}% / ${dewStr}`;

        const precipAmount =
            w.precipitationAmount != null
                ? `${w.precipitationAmount} mm`
                : "0 mm";
        const precipProb =
            w.precipitationProbability != null
                ? `${w.precipitationProbability}%`
                : "—";
        document.getElementById("weatherPrecip").textContent =
            `${precipAmount} / ${precipProb}`;

        const windDir = w.windDirection ? ` (${w.windDirection})` : "";
        document.getElementById("weatherWind").textContent =
            w.windSpeed != null ? `${w.windSpeed} km/h${windDir}` : "—";

        document.getElementById("weatherPressure").textContent =
            w.airPressure != null ? `${Math.round(w.airPressure)} hPa` : "—";

        const uvStr = w.uvIndex != null ? `UV ${w.uvIndex}` : "UV —";
        const cloudStr = w.cloudCover != null ? `${w.cloudCover}%` : "—";
        document.getElementById("weatherUvCloud").textContent =
            `${uvStr} / ${cloudStr}`;
    }

    function renderSidebar(parcel) {
        const activeMode =
            state.overlayMode === "off" ? "temp" : state.overlayMode;
        const meta = OVERLAY_META[activeMode];
        const overlayMeta = OVERLAY_META[state.overlayMode];
        const summary = computeParcelSummary(parcel, activeMode);

        const baseWeatherTemp = getWeatherDefaultValue(parcel, "temp");
        const baseWeatherHum = getWeatherDefaultValue(parcel, "moisture");

        document.getElementById("infoFieldName").textContent =
            `${parcel.name} (#${parcel.fieldId})`;
        document.getElementById("infoCoords").textContent =
            `${parcel.coordY.toFixed(4)}°N, ${parcel.coordX.toFixed(4)}°E`;
        document.getElementById("infoActiveOverlay").textContent =
            overlayMeta.shortLabel;
        document.getElementById("infoTodayField").textContent =
            `${baseWeatherTemp.toFixed(1)} °C / ${baseWeatherHum.toFixed(0)}%`;
        document.getElementById("infoSensorsCount").textContent =
            `${summary.activeTempCount + summary.activeMoistureCount} aktywne / ${summary.offlineCount} offline`;

        const pill = document.getElementById("sourceModeBanner");
        if (!summary.hasSensors) {
            pill.className = "source-mode-pill mode-field";
            pill.textContent =
                "Brak aktywnych czujek – dane bazowe z Google Weather API";
        } else {
            pill.className = "source-mode-pill mode-sensor";
            pill.textContent =
                "Aktywna interpolacja czujek + parametry Google Weather API";
        }

        const formattedAvg = `${summary.value.toFixed(meta.decimals)}${meta.unit}`;
        const statusDesc = describeModeValue(activeMode, summary.value);
        document.getElementById("infoMetricSummary").textContent =
            `${formattedAvg} (${statusDesc})`;

        renderWeatherCard(parcel);

        const probeBox = document.getElementById("probeDetails");
        if (!state.probePoint) {
            probeBox.className = "details-empty";
            probeBox.textContent =
                "Kliknij dowolne miejsce na polu, aby odczytać temperaturę, wilgotność, VPD, ET₀ oraz priorytet nawadniania.";
        } else {
            const ptMetrics = computePointIrrigationMetrics(
                parcel,
                state.probePoint.x,
                state.probePoint.y,
            );
            const irrigationAdvice = describeModeValue(
                "irrigation",
                ptMetrics.irrigation,
            );

            probeBox.className = "";
            probeBox.innerHTML = `
                <dl class="meta-list">
                    <div><dt>Pozycja na polu:</dt><dd>${state.probePoint.x.toFixed(1)} m, ${state.probePoint.y.toFixed(1)} m</dd></div>
                    <div><dt>Temperatura:</dt><dd>${ptMetrics.temp.toFixed(1)} °C</dd></div>
                    <div><dt>Wilgotność:</dt><dd>${ptMetrics.moisture.toFixed(1)} %</dd></div>
                    <div><dt>Deficyt VPD:</dt><dd>${ptMetrics.vpd.toFixed(2)} kPa</dd></div>
                    <div><dt>Ewapotranspiracja ET₀:</dt><dd>${ptMetrics.et.toFixed(2)} mm/d</dd></div>
                    <div><dt>Priorytet nawadniania:</dt><dd>${Math.round(ptMetrics.irrigation)}% (${irrigationAdvice})</dd></div>
                </dl>
            `;
        }

        const sensorBox = document.getElementById("sensorDetails");
        const selectedSensor = (parcel.sensors || []).find(
            (s) => s.id === state.selectedSensorId,
        );

        if (!selectedSensor) {
            sensorBox.className = "details-empty";
            sensorBox.textContent =
                "Kliknij kropkę czujki na mapie, aby podejrzeć jej stan i odczyty.";
        } else {
            const isOffline = selectedSensor.status === "offline";
            const color = STATUS_COLORS[selectedSensor.status];
            sensorBox.className = "";
            sensorBox.innerHTML = `
                <dl class="meta-list">
                    <div><dt>ID / Nazwa:</dt><dd>${selectedSensor.id} – ${selectedSensor.name}</dd></div>
                    <div><dt>Pozycja (X, Y):</dt><dd>${selectedSensor.x} m, ${selectedSensor.y} m</dd></div>
                    <div>
                        <dt>Status:</dt>
                        <dd>
                            <span class="state-pill" style="background:${color}20;color:${color}">
                                ${STATUS_LABELS[selectedSensor.status]}
                            </span>
                        </dd>
                    </div>
                    <div>
                        <dt>Temperatura:</dt>
                        <dd>${!isOffline && typeof selectedSensor.temp === "number" ? selectedSensor.temp.toFixed(1) + " °C" : "—"}</dd>
                    </div>
                    <div>
                        <dt>Wilgotność:</dt>
                        <dd>${!isOffline && typeof selectedSensor.moisture === "number" ? selectedSensor.moisture.toFixed(1) + " %" : "—"}</dd>
                    </div>
                    <div><dt>Źródło:</dt><dd>${selectedSensor.lastSeen}</dd></div>
                </dl>
                ${
                    selectedSensor.source !== "database"
                        ? `<div class="sensor-actions-row">
                            <button type="button" class="btn-mini btn-mini-danger" id="btnDeleteSensor">
                                Usuń czujkę offline
                            </button>
                           </div>`
                        : ""
                }
            `;

            document
                .getElementById("btnDeleteSensor")
                ?.addEventListener("click", () => {
                    parcel.sensors = parcel.sensors.filter(
                        (s) => s.id !== selectedSensor.id,
                    );
                    state.selectedSensorId = null;
                    saveOfflineSensorsForField(
                        parcel.fieldId,
                        parcel.sensors.filter((s) => s.status === "offline"),
                    );
                    renderAll();
                });
        }

        const jsonPreview = document.getElementById("jsonPreview");
        if (jsonPreview) {
            const centroid = computeCentroid(parcel.corners);
            jsonPreview.textContent = JSON.stringify(
                {
                    fieldId: parcel.fieldId,
                    name: parcel.name,
                    activeOverlay: state.overlayMode,
                    coordinates: { lat: parcel.coordY, lon: parcel.coordX },
                    googleWeather: parcel.weather,
                    centerIrrigationMetrics: computePointIrrigationMetrics(
                        parcel,
                        centroid.x,
                        centroid.y,
                    ),
                },
                null,
                2,
            );
        }
    }

    function applyViewportTransform() {
        const layer = document.getElementById("viewportLayer");
        if (!layer) return;
        layer.setAttribute(
            "transform",
            `translate(${state.view.offsetX}, ${state.view.offsetY}) scale(${state.view.scale})`,
        );
    }

    function fitViewToParcel(parcel = getCurrentParcel()) {
        const svg = document.getElementById("fieldSvg");
        if (!svg || !parcel) return;

        const rect = svg.getBoundingClientRect();
        const svgW = rect.width || 760;
        const svgH = rect.height || 600;

        const xs = parcel.corners.map((c) => c.x);
        const ys = parcel.corners.map((c) => c.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const fieldW = Math.max(maxX - minX, 10);
        const fieldH = Math.max(maxY - minY, 10);

        const padding = 105;
        const scaleX = (svgW - padding * 2) / fieldW;
        const scaleY = (svgH - padding * 2) / fieldH;
        const scale = Math.max(0.35, Math.min(scaleX, scaleY, 4.5));

        const centerX = (minX + maxX) / 2;
        const centerY = -((minY + maxY) / 2);

        state.view.scale = scale;
        state.view.offsetX = svgW / 2 - centerX * scale;
        state.view.offsetY = svgH / 2 - centerY * scale;
        applyViewportTransform();
    }

    function screenToWorld(clientX, clientY) {
        const svg = document.getElementById("fieldSvg");
        const rect = svg.getBoundingClientRect();
        return {
            x: (clientX - rect.left - state.view.offsetX) / state.view.scale,
            y: -((clientY - rect.top - state.view.offsetY) / state.view.scale),
        };
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

    function populateParcelSelector() {
        const select = document.getElementById("fieldSelect");
        if (!select) return;
        select.innerHTML = "";
        state.parcels.forEach((p) => {
            const opt = document.createElement("option");
            opt.value = p.fieldId;
            opt.textContent = `${p.name} (#${p.fieldId})`;
            if (String(p.fieldId) === String(state.selectedFieldId)) {
                opt.selected = true;
            }
            select.appendChild(opt);
        });
    }

    function setAddSensorMode(enabled) {
        state.addSensorMode = enabled;
        const btn = document.getElementById("btnAddSensorMode");
        const banner = document.getElementById("modeBanner");
        if (btn) btn.classList.toggle("active", enabled);
        if (banner) {
            banner.textContent =
                "Kliknij wewnątrz obrysu działki na planszy, aby postawić nową czujkę (status: Offline)";
            banner.classList.toggle("hidden", !enabled);
        }
    }

    function renderAll() {
        const parcel = getCurrentParcel();
        if (!parcel) return;

        renderOniOverlay(parcel);
        renderFieldAndCorners(parcel);
        renderSensors(parcel);
        renderProbe();
        renderOverlayButtonsAndLegend();
        renderSidebar(parcel);
    }

    function bindEvents() {
        document
            .getElementById("fieldSelect")
            ?.addEventListener("change", async (e) => {
                state.selectedFieldId = e.target.value;
                state.selectedSensorId = null;
                state.probePoint = null;
                setAddSensorMode(false);
                const nextUrl = new URL(window.location.href);
                nextUrl.searchParams.set("id", state.selectedFieldId);
                window.history.replaceState({}, "", nextUrl);
                fitViewToParcel();
                renderAll();

                const parcel = getCurrentParcel();
                await fetchWeatherForParcel(parcel, false);
                renderAll();
            });

        /* Wybór jednego ze stanów nakładki (Wyłącz / Temperatura / Wilgotność / VPD / ET₀ / Nawadnianie) */
        document
            .querySelectorAll("#oniOverlayBar [data-overlay-mode]")
            .forEach((btn) => {
                btn.addEventListener("click", () => {
                    state.overlayMode = btn.dataset.overlayMode;
                    renderAll();
                });
            });

        document
            .getElementById("btnRefreshWeather")
            ?.addEventListener("click", async () => {
                const parcel = getCurrentParcel();
                await fetchWeatherForParcel(parcel, true);
                renderAll();
            });

        document
            .getElementById("btnAddSensorMode")
            ?.addEventListener("click", () => {
                setAddSensorMode(!state.addSensorMode);
            });

        document
            .getElementById("toggleSensors")
            ?.addEventListener("change", (e) => {
                state.showSensors = e.target.checked;
                renderAll();
            });

        document.getElementById("btnZoomIn")?.addEventListener("click", () => {
            state.view.scale = Math.min(state.view.scale * 1.2, 6);
            applyViewportTransform();
        });

        document.getElementById("btnZoomOut")?.addEventListener("click", () => {
            state.view.scale = Math.max(state.view.scale / 1.2, 0.25);
            applyViewportTransform();
        });

        document.getElementById("btnFitView")?.addEventListener("click", () => {
            fitViewToParcel();
        });

        const svg = document.getElementById("fieldSvg");
        if (!svg) return;

        svg.addEventListener("mousemove", (e) => {
            const pt = screenToWorld(e.clientX, e.clientY);
            const coordsEl = document.getElementById("cursorCoords");
            if (coordsEl) {
                coordsEl.textContent = `X: ${pt.x.toFixed(1)} m | Y: ${pt.y.toFixed(1)} m`;
            }

            if (state.view.isPanning) {
                const dx = e.clientX - state.view.panStartX;
                const dy = e.clientY - state.view.panStartY;
                if (Math.hypot(dx, dy) > 4) state.view.movedDuringDrag = true;
                state.view.offsetX += dx;
                state.view.offsetY += dy;
                state.view.panStartX = e.clientX;
                state.view.panStartY = e.clientY;
                applyViewportTransform();
            }
        });

        svg.addEventListener("mousedown", (e) => {
            if (e.button !== 0) return;
            state.view.isPanning = true;
            state.view.movedDuringDrag = false;
            state.view.panStartX = e.clientX;
            state.view.panStartY = e.clientY;
            svg.classList.add("is-panning");
        });

        window.addEventListener("mouseup", () => {
            if (state.view.isPanning) {
                state.view.isPanning = false;
                svg.classList.remove("is-panning");
            }
        });

        svg.addEventListener(
            "wheel",
            (e) => {
                e.preventDefault();
                const rect = svg.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
                const nextScale = Math.max(
                    0.25,
                    Math.min(6, state.view.scale * factor),
                );
                const ratio = nextScale / state.view.scale;

                state.view.offsetX = mx - (mx - state.view.offsetX) * ratio;
                state.view.offsetY = my - (my - state.view.offsetY) * ratio;
                state.view.scale = nextScale;
                applyViewportTransform();
            },
            { passive: false },
        );

        svg.addEventListener("click", (e) => {
            if (state.view.movedDuringDrag) return;

            const parcel = getCurrentParcel();
            if (!parcel) return;

            const pt = screenToWorld(e.clientX, e.clientY);
            const inside = isPointInPolygon(pt, parcel.corners);

            if (state.addSensorMode) {
                const banner = document.getElementById("modeBanner");
                if (!inside) {
                    if (banner) {
                        banner.textContent =
                            "Punkt poza granicami działki – kliknij wewnątrz zielonego obrysu.";
                    }
                    return;
                }

                const offlineCount = parcel.sensors.filter(
                    (s) => s.status === "offline",
                ).length;
                const newSensor = {
                    id: `OFF-${offlineCount + 1}`,
                    name: `Czujka Offline #${offlineCount + 1}`,
                    x: Number(pt.x.toFixed(1)),
                    y: Number(pt.y.toFixed(1)),
                    status: "offline",
                    temp: null,
                    moisture: null,
                    source: "local_offline",
                    lastSeen: "Offline (ignorowana)",
                };

                parcel.sensors.push(newSensor);
                state.selectedSensorId = newSensor.id;
                saveOfflineSensorsForField(
                    parcel.fieldId,
                    parcel.sensors.filter((s) => s.status === "offline"),
                );
                setAddSensorMode(false);
                renderAll();
                return;
            }

            if (inside) {
                state.probePoint = {
                    x: Number(pt.x.toFixed(1)),
                    y: Number(pt.y.toFixed(1)),
                };
                renderAll();
            }
        });
    }

    async function init() {
        bindEvents();

        const [rawFields, rawSensors] = await Promise.all([
            fetchJsonSafe("/field"),
            fetchJsonSafe("/sensor"),
        ]);

        state.parcels = hydrateParcels(rawFields, rawSensors);

        if (state.parcels.length === 0) {
            window.location.replace("panel.html");
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const requestedId = params.get("id");
        const found = state.parcels.find(
            (p) => String(p.fieldId) === String(requestedId),
        );

        state.selectedFieldId = found
            ? found.fieldId
            : state.parcels[0].fieldId;

        populateParcelSelector();
        fitViewToParcel();
        renderAll();

        const currentParcel = getCurrentParcel();
        await fetchWeatherForParcel(currentParcel, false);
        renderAll();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
