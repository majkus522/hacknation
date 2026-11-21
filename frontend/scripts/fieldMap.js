(function () {
    "use strict";

    const SVG_NS = "http://www.w3.org/2000/svg";
    const OFFLINE_SENSORS_KEY = "perun_offline_sensors_by_field_v1";

    const METRIC_META = {
        temp: {
            label: "Temperatura",
            unit: "°C",
            min: 0,
            max: 28,
            stops: [
                { t: 0.0, r: 37, g: 99, b: 235 },
                { t: 0.38, r: 50, g: 167, b: 58 },
                { t: 0.72, r: 234, g: 179, b: 8 },
                { t: 1.0, r: 220, g: 38, b: 38 },
            ],
        },
        moisture: {
            label: "Wilgotność",
            unit: "%",
            min: 10,
            max: 70,
            stops: [
                { t: 0.0, r: 220, g: 38, b: 38 },
                { t: 0.35, r: 234, g: 179, b: 8 },
                { t: 0.7, r: 50, g: 167, b: 58 },
                { t: 1.0, r: 2, g: 132, b: 199 },
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
        metric: "temp",
        selectedSensorId: null,
        probePoint: null,
        addSensorMode: false,
        showHeatmap: true,
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
                coordX: Number(f.x ?? 0),
                coordY: Number(f.y ?? 0),
                rawPoints: f.points,
                todayFieldReading: {
                    date: new Date().toISOString().slice(0, 10),
                    temp: 14.2,
                    moisture: 31.0,
                },
                corners,
                sensors: [...activeSensors, ...localOffline],
            };
        });
    }

    function getCurrentParcel() {
        return (
            state.parcels.find(
                (p) => String(p.fieldId) === String(state.selectedFieldId),
            ) || state.parcels[0]
        );
    }

    function getActiveSensors(parcel, metric = state.metric) {
        return (parcel?.sensors || []).filter(
            (s) => s.status !== "offline" && typeof s[metric] === "number",
        );
    }

    function evaluateValueAt(parcel, x, y, metric = state.metric) {
        const active = getActiveSensors(parcel, metric);

        if (active.length === 0) {
            return parcel.todayFieldReading[metric];
        }

        if (active.length === 1) {
            return active[0][metric];
        }

        let weightedSum = 0;
        let weightTotal = 0;

        for (let i = 0; i < active.length; i++) {
            const s = active[i];
            const dist = Math.hypot(x - s.x, y - s.y);
            if (dist < 0.001) return s[metric];
            const w = 1 / (dist * dist);
            weightedSum += w * s[metric];
            weightTotal += w;
        }

        return weightedSum / weightTotal;
    }

    function computeParcelSummary(parcel, metric = state.metric) {
        const active = getActiveSensors(parcel, metric);
        const offlineCount = (parcel.sensors || []).filter(
            (s) => s.status === "offline",
        ).length;

        if (active.length === 0) {
            return {
                mode: "field_today",
                activeCount: 0,
                offlineCount,
                value: parcel.todayFieldReading[metric],
                min: parcel.todayFieldReading[metric],
                max: parcel.todayFieldReading[metric],
            };
        }

        if (active.length === 1) {
            return {
                mode: "single_sensor",
                activeCount: 1,
                offlineCount,
                sensorName: active[0].name,
                value: active[0][metric],
                min: active[0][metric],
                max: active[0][metric],
            };
        }

        const values = active.map((s) => s[metric]);
        const avg = values.reduce((acc, v) => acc + v, 0) / values.length;
        return {
            mode: "idw_interpolation",
            activeCount: active.length,
            offlineCount,
            value: avg,
            min: Math.min(...values),
            max: Math.max(...values),
        };
    }

    function interpolateColor(value, metric = state.metric) {
        const meta = METRIC_META[metric];
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

    function renderHeatmap(parcel) {
        const heatmapLayer = document.getElementById("heatmapLayer");
        const heatmapImage = document.getElementById("heatmapImage");
        if (!heatmapLayer || !heatmapImage) return;

        heatmapLayer.style.display = state.showHeatmap ? "inline" : "none";
        if (!state.showHeatmap) return;

        const xs = parcel.corners.map((c) => c.x);
        const ys = parcel.corners.map((c) => c.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const width = Math.max(maxX - minX, 1);
        const height = Math.max(maxY - minY, 1);

        const gridW = 140;
        const gridH = 105;
        const canvas = document.createElement("canvas");
        canvas.width = gridW;
        canvas.height = gridH;
        const ctx = canvas.getContext("2d");
        const imgData = ctx.createImageData(gridW, gridH);
        const data = imgData.data;

        for (let py = 0; py < gridH; py++) {
            const wy = minY + ((py + 0.5) / gridH) * height;
            for (let px = 0; px < gridW; px++) {
                const wx = minX + ((px + 0.5) / gridW) * width;
                const val = evaluateValueAt(parcel, wx, wy, state.metric);
                const [r, g, b] = interpolateColor(val, state.metric);
                const idx = (py * gridW + px) * 4;
                data[idx] = r;
                data[idx + 1] = g;
                data[idx + 2] = b;
                data[idx + 3] = 178;
            }
        }

        ctx.putImageData(imgData, 0, 0);
        heatmapImage.setAttribute("x", minX);
        heatmapImage.setAttribute("y", minY);
        heatmapImage.setAttribute("width", width);
        heatmapImage.setAttribute("height", height);
        heatmapImage.setAttribute("href", canvas.toDataURL("image/png"));
    }

    function createSvgEl(tag, attrs = {}) {
        const el = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
    }

    function renderFieldAndCorners(parcel) {
        const ptsStr = parcel.corners.map((c) => `${c.x},${c.y}`).join(" ");
        document
            .getElementById("fieldClipPolygon")
            ?.setAttribute("points", ptsStr);

        const fieldLayer = document.getElementById("fieldLayer");
        const cornersLayer = document.getElementById("cornersLayer");
        fieldLayer.innerHTML = "";
        cornersLayer.innerHTML = "";

        fieldLayer.appendChild(
            createSvgEl("polygon", {
                points: ptsStr,
                fill: state.showHeatmap
                    ? "rgba(50, 167, 58, 0.04)"
                    : "rgba(50, 167, 58, 0.14)",
                stroke: "#32a73a",
                "stroke-width": "2.4",
                "stroke-linejoin": "round",
            }),
        );

        parcel.corners.forEach((c) => {
            const g = createSvgEl("g");
            g.appendChild(
                createSvgEl("circle", {
                    cx: c.x,
                    cy: c.y,
                    r: "3.5",
                    fill: "#ffffff",
                    stroke: "#1f6b24",
                    "stroke-width": "1.6",
                }),
            );
            const label = createSvgEl("text", {
                x: c.x + 6,
                y: c.y - 6,
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

        const meta = METRIC_META[state.metric];

        (parcel.sensors || []).forEach((sensor) => {
            const isOffline = sensor.status === "offline";
            const hasMetric = typeof sensor[state.metric] === "number";
            const effectiveStatus = isOffline
                ? "offline"
                : hasMetric
                  ? sensor.status
                  : "offline";
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
                    cy: sensor.y,
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
                    cy: sensor.y,
                    r: "5.5",
                    fill: color,
                    stroke: "#ffffff",
                    "stroke-width": "1.8",
                }),
            );

            const tag = createSvgEl("text", {
                x: sensor.x + 9,
                y: sensor.y + 3,
                fill: effectiveStatus === "offline" ? "#475569" : "#181818",
                "font-size": "9.5",
                "font-weight": "700",
                "font-family": "system-ui, sans-serif",
            });

            const valText =
                !isOffline && hasMetric
                    ? `${sensor[state.metric].toFixed(1)}${meta.unit}`
                    : isOffline
                      ? "OFFLINE"
                      : "inny typ";
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
                cy: y,
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
                cy: y,
                r: "2",
                fill: "#181818",
            }),
        );
    }

    function renderLegend() {
        const meta = METRIC_META[state.metric];
        document.getElementById("legendTitle").textContent = `${meta.label}:`;
        document.getElementById("legendMin").textContent =
            `${meta.min}${meta.unit}`;
        document.getElementById("legendMax").textContent =
            `${meta.max}${meta.unit}`;

        const cssStops = meta.stops
            .map((s) => `rgb(${s.r}, ${s.g}, ${s.b}) ${Math.round(s.t * 100)}%`)
            .join(", ");
        document.getElementById("legendGradient").style.background =
            `linear-gradient(90deg, ${cssStops})`;

        document.getElementById("heatmapLegendGroup").style.display =
            state.showHeatmap ? "flex" : "none";
        document.getElementById("sensorsLegendGroup").style.display =
            state.showSensors ? "flex" : "none";
        document.getElementById("legendSep").style.display =
            state.showHeatmap && state.showSensors ? "block" : "none";
    }

    function renderSidebar(parcel) {
        const meta = METRIC_META[state.metric];
        const summary = computeParcelSummary(parcel, state.metric);
        const todayVal = parcel.todayFieldReading[state.metric];

        document.getElementById("infoFieldName").textContent =
            `${parcel.name} (#${parcel.fieldId})`;
        document.getElementById("infoCoords").textContent =
            `X: ${parcel.coordX}, Y: ${parcel.coordY}`;
        document.getElementById("infoTodayField").textContent =
            `${todayVal.toFixed(1)} ${meta.unit} (${parcel.todayFieldReading.date})`;
        document.getElementById("infoSensorsCount").textContent =
            `${summary.activeCount} aktywne / ${summary.offlineCount} offline`;

        const pill = document.getElementById("sourceModeBanner");
        if (summary.mode === "field_today") {
            pill.className = "source-mode-pill mode-field";
            pill.textContent =
                "Brak aktywnych czujek – przyjęto dzisiejszy odczyt z pola";
            document.getElementById("infoMetricSummary").textContent =
                `${summary.value.toFixed(1)} ${meta.unit} (pole dziś)`;
        } else if (summary.mode === "single_sensor") {
            pill.className = "source-mode-pill mode-sensor";
            pill.textContent =
                "1 czujka aktywna – wartość działki nadpisana przez czujkę";
            document.getElementById("infoMetricSummary").textContent =
                `${summary.value.toFixed(1)} ${meta.unit} (${summary.sensorName})`;
        } else {
            pill.className = "source-mode-pill mode-sensor";
            pill.textContent = `Aktywna interpolacja IDW (${summary.activeCount} czujki online)`;
            document.getElementById("infoMetricSummary").textContent =
                `śr. ${summary.value.toFixed(1)} ${meta.unit} (${summary.min.toFixed(1)}–${summary.max.toFixed(1)})`;
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

        const probeBox = document.getElementById("probeDetails");
        if (!state.probePoint) {
            probeBox.className = "details-empty";
            probeBox.textContent =
                "Kliknij dowolne miejsce na polu, aby odczytać wartość dla wybranego punktu.";
        } else {
            const val = evaluateValueAt(
                parcel,
                state.probePoint.x,
                state.probePoint.y,
                state.metric,
            );
            const methodLabel =
                summary.mode === "field_today"
                    ? "Odczyt dzisiejszy z pola (brak czujek online)"
                    : summary.mode === "single_sensor"
                      ? "Wartość z 1 aktywnej czujki"
                      : `Interpolacja IDW (${summary.activeCount} aktywne czujki)`;

            probeBox.className = "";
            probeBox.innerHTML = `
                <dl class="meta-list">
                    <div><dt>Współrzędne:</dt><dd>${state.probePoint.x.toFixed(1)} m, ${state.probePoint.y.toFixed(1)} m</dd></div>
                    <div><dt>${meta.label}:</dt><dd>${val.toFixed(2)} ${meta.unit}</dd></div>
                    <div><dt>Metoda:</dt><dd>${methodLabel}</dd></div>
                </dl>
            `;
        }

        const jsonPreview = document.getElementById("jsonPreview");
        if (jsonPreview) {
            jsonPreview.textContent = JSON.stringify(
                {
                    fieldId: parcel.fieldId,
                    name: parcel.name,
                    points: parcel.rawPoints,
                    todayFieldReading: parcel.todayFieldReading,
                    calculationMode: summary.mode,
                    effectiveParcelValue: Number(summary.value.toFixed(2)),
                    activeSensorsUsed: getActiveSensors(parcel, state.metric),
                    ignoredOfflineSensors: (parcel.sensors || []).filter(
                        (s) => s.status === "offline",
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
        const svgH = rect.height || 580;

        const xs = parcel.corners.map((c) => c.x);
        const ys = parcel.corners.map((c) => c.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const fieldW = Math.max(maxX - minX, 10);
        const fieldH = Math.max(maxY - minY, 10);

        const padding = 95;
        const scaleX = (svgW - padding * 2) / fieldW;
        const scaleY = (svgH - padding * 2) / fieldH;
        const scale = Math.max(0.35, Math.min(scaleX, scaleY, 4.5));

        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

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
            y: (clientY - rect.top - state.view.offsetY) / state.view.scale,
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

        renderHeatmap(parcel);
        renderFieldAndCorners(parcel);
        renderSensors(parcel);
        renderProbe();
        renderLegend();
        renderSidebar(parcel);
    }

    function bindEvents() {
        document
            .getElementById("fieldSelect")
            ?.addEventListener("change", (e) => {
                state.selectedFieldId = e.target.value;
                state.selectedSensorId = null;
                state.probePoint = null;
                setAddSensorMode(false);
                const nextUrl = new URL(window.location.href);
                nextUrl.searchParams.set("id", state.selectedFieldId);
                window.history.replaceState({}, "", nextUrl);
                fitViewToParcel();
                renderAll();
            });

        document
            .getElementById("metricSelect")
            ?.addEventListener("change", (e) => {
                state.metric = e.target.value;
                renderAll();
            });

        document
            .getElementById("btnAddSensorMode")
            ?.addEventListener("click", () => {
                setAddSensorMode(!state.addSensorMode);
            });

        document
            .getElementById("btnSimulate")
            ?.addEventListener("click", () => {
                const parcel = getCurrentParcel();
                const active = getActiveSensors(parcel, state.metric);
                if (active.length === 0) {
                    parcel.todayFieldReading.temp = Number(
                        (
                            parcel.todayFieldReading.temp +
                            (Math.random() * 1.6 - 0.8)
                        ).toFixed(1),
                    );
                    parcel.todayFieldReading.moisture = Number(
                        (
                            parcel.todayFieldReading.moisture +
                            (Math.random() * 3.0 - 1.5)
                        ).toFixed(1),
                    );
                } else {
                    active.forEach((s) => {
                        if (typeof s.temp === "number") {
                            s.temp = Number(
                                (s.temp + (Math.random() * 1.8 - 0.9)).toFixed(
                                    1,
                                ),
                            );
                        }
                        if (typeof s.moisture === "number") {
                            s.moisture = Number(
                                Math.max(
                                    8,
                                    Math.min(
                                        68,
                                        s.moisture +
                                            (Math.random() * 3.2 - 1.6),
                                    ),
                                ).toFixed(1),
                            );
                        }
                    });
                }
                renderAll();
            });

        document
            .getElementById("toggleHeatmap")
            ?.addEventListener("change", (e) => {
                state.showHeatmap = e.target.checked;
                renderAll();
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
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
