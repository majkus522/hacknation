(function () {
    "use strict";

    const SVG_NS = "http://www.w3.org/2000/svg";

    function getUserStorageKey() {
        const session = window.PerunAuth?.getSession?.();
        const uid = session?.user?.id || "default";
        return `perun_saved_parcels_${uid}`;
    }

    /* --- SZABLONY ZAPISANYCH DZIAŁEK UŻYTKOWNIKA --- */
    function createTemplateParcels() {
        return [
            {
                id: "tpl-1",
                terytId: "181103_2.0022.90/2",
                name: "Działka #1 (Template) – Brak aktywnych czujek",
                crop: "Pszenica ozima",
                areaHa: 5.42,
                todayFieldReading: {
                    date: new Date().toISOString().slice(0, 10),
                    temp: 14.2,
                    moisture: 31.0,
                },
                corners: [
                    { id: "P1", x: 0, y: 0 },
                    { id: "P2", x: 310, y: 18 },
                    { id: "P3", x: 335, y: 195 },
                    { id: "P4", x: 42, y: 215 },
                    { id: "P5", x: -18, y: 105 },
                ],
                sensors: [],
            },
            {
                id: "tpl-2",
                terytId: "181103_2.0022.104/1",
                name: "Działka #2 – 1 czujka aktywna + 1 offline",
                crop: "Kukurydza",
                areaHa: 4.18,
                todayFieldReading: {
                    date: new Date().toISOString().slice(0, 10),
                    temp: 14.2,
                    moisture: 31.0,
                },
                corners: [
                    { id: "P1", x: 0, y: 0 },
                    { id: "P2", x: 260, y: 0 },
                    { id: "P3", x: 280, y: 165 },
                    { id: "P4", x: 15, y: 175 },
                ],
                sensors: [
                    {
                        id: "CZ-201",
                        name: "Czujka Północ-1",
                        x: 125,
                        y: 82,
                        status: "ok",
                        temp: 17.6,
                        moisture: 38.4,
                        lastSeen: "Dziś, 10 min temu",
                    },
                    {
                        id: "CZ-202",
                        name: "Czujka Południe-2",
                        x: 215,
                        y: 135,
                        status: "offline",
                        temp: null,
                        moisture: null,
                        lastSeen: "Offline (ignorowana)",
                    },
                ],
            },
            {
                id: "tpl-3",
                terytId: "181103_2.0022.118/5",
                name: "Działka #3 – Pełna interpolacja IDW (3 aktywne)",
                crop: "Rzepak ozimy",
                areaHa: 6.85,
                todayFieldReading: {
                    date: new Date().toISOString().slice(0, 10),
                    temp: 14.2,
                    moisture: 31.0,
                },
                corners: [
                    { id: "P1", x: 20, y: 0 },
                    { id: "P2", x: 350, y: 25 },
                    { id: "P3", x: 375, y: 210 },
                    { id: "P4", x: 195, y: 245 },
                    { id: "P5", x: 0, y: 190 },
                ],
                sensors: [
                    {
                        id: "CZ-301",
                        name: "Czujka Zachód",
                        x: 75,
                        y: 95,
                        status: "ok",
                        temp: 12.4,
                        moisture: 42.0,
                        lastSeen: "Dziś, 5 min temu",
                    },
                    {
                        id: "CZ-302",
                        name: "Czujka Centrum",
                        x: 195,
                        y: 125,
                        status: "warn",
                        temp: 16.8,
                        moisture: 24.5,
                        lastSeen: "Dziś, 7 min temu",
                    },
                    {
                        id: "CZ-303",
                        name: "Czujka Wschód",
                        x: 315,
                        y: 155,
                        status: "crit",
                        temp: 21.3,
                        moisture: 14.2,
                        lastSeen: "Dziś, 3 min temu",
                    },
                    {
                        id: "CZ-304",
                        name: "Czujka Skraj (Offline)",
                        x: 245,
                        y: 55,
                        status: "offline",
                        temp: null,
                        moisture: null,
                        lastSeen: "Offline (ignorowana)",
                    },
                ],
            },
        ];
    }

    const METRIC_META = {
        temp: {
            label: "Temperatura",
            unit: "°C",
            min: 5,
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
            max: 55,
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

    const initialParcels = loadParcels();

    const state = {
        parcels: initialParcels,
        selectedParcelId: initialParcels[0]?.id || "tpl-1",
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

    function loadParcels() {
        const key = getUserStorageKey();
        try {
            const raw =
                localStorage.getItem(key) ||
                localStorage.getItem("perun_saved_parcels_v1");
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            }
        } catch {
            /* fallback do szablonów */
        }
        const defaults = createTemplateParcels();
        saveParcels(defaults);
        return defaults;
    }

    function saveParcels(parcels = state.parcels) {
        const key = getUserStorageKey();
        try {
            const serialized = JSON.stringify(parcels);
            localStorage.setItem(key, serialized);
            localStorage.setItem("perun_saved_parcels_v1", serialized);
        } catch {
            /* ignoruj błąd zapisu w trybie prywatnym */
        }
    }

    function getCurrentParcel() {
        return (
            state.parcels.find((p) => p.id === state.selectedParcelId) ||
            state.parcels[0]
        );
    }

    /* --- LOGIKA CZUJEK AKTYWNYCH VS OFFLINE --- */
    function getActiveSensors(parcel, metric = state.metric) {
        return (parcel.sensors || []).filter(
            (s) => s.status !== "offline" && typeof s[metric] === "number",
        );
    }

    /**
     * Wyznacza wartość w dowolnym punkcie (x, y) działki:
     * 1. Brak aktywnych czujek -> dzisiejszy odczyt bazowy na polu.
     * 2. Dokładnie 1 czujka aktywna -> jej wartość nadpisuje całą działkę.
     * 3. >= 2 czujki aktywne -> interpolacja IDW po czujkach aktywnych (offline są ignorowane).
     */
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
            if (dist < 0.001) {
                return s[metric];
            }
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

    /* --- KOLORY HEATMAPY --- */
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
                const r = Math.round(a.r + (b.r - a.r) * localT);
                const g = Math.round(a.g + (b.g - a.g) * localT);
                const bl = Math.round(a.b + (b.b - a.b) * localT);
                return [r, g, bl];
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

    /* --- RENDEROWANIE SVG --- */
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
            const color = STATUS_COLORS[sensor.status] || STATUS_COLORS.offline;
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
                    "fill-opacity": isOffline ? "0.18" : "0.28",
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
                fill: isOffline ? "#475569" : "#181818",
                "font-size": "9.5",
                "font-weight": "700",
                "font-family": "system-ui, sans-serif",
            });

            const valText =
                !isOffline && typeof sensor[state.metric] === "number"
                    ? `${sensor[state.metric].toFixed(1)}${meta.unit}`
                    : "OFFLINE";
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

    /* --- PANEL BOCZNY I LEGENDA --- */
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
            `${parcel.terytId}`;
        document.getElementById("infoCrop").textContent = parcel.crop;
        document.getElementById("infoArea").textContent =
            `${parcel.areaHa.toFixed(2)} ha`;
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
                        <dd>${!isOffline && typeof selectedSensor.temp === "number" ? selectedSensor.temp.toFixed(1) + " °C" : "— (offline)"}</dd>
                    </div>
                    <div>
                        <dt>Wilgotność:</dt>
                        <dd>${!isOffline && typeof selectedSensor.moisture === "number" ? selectedSensor.moisture.toFixed(1) + " %" : "— (offline)"}</dd>
                    </div>
                    <div><dt>Ostatni kontakt:</dt><dd>${selectedSensor.lastSeen}</dd></div>
                </dl>
                <div class="sensor-actions-row">
                    <button type="button" class="btn-mini" id="btnToggleSensorStatus">
                        ${isOffline ? "Przełącz na Online" : "Przełącz na Offline"}
                    </button>
                    <button type="button" class="btn-mini btn-mini-danger" id="btnDeleteSensor">
                        Usuń czujkę
                    </button>
                </div>
            `;

            document
                .getElementById("btnToggleSensorStatus")
                ?.addEventListener("click", () => {
                    if (selectedSensor.status === "offline") {
                        selectedSensor.status = "ok";
                        selectedSensor.temp = Number(
                            (
                                parcel.todayFieldReading.temp +
                                (Math.random() * 4 - 1.5)
                            ).toFixed(1),
                        );
                        selectedSensor.moisture = Number(
                            (
                                parcel.todayFieldReading.moisture +
                                (Math.random() * 10 - 5)
                            ).toFixed(1),
                        );
                        selectedSensor.lastSeen = "Dziś, teraz";
                    } else {
                        selectedSensor.status = "offline";
                        selectedSensor.temp = null;
                        selectedSensor.moisture = null;
                        selectedSensor.lastSeen = "Offline (ignorowana)";
                    }
                    saveParcels();
                    renderAll();
                });

            document
                .getElementById("btnDeleteSensor")
                ?.addEventListener("click", () => {
                    parcel.sensors = parcel.sensors.filter(
                        (s) => s.id !== selectedSensor.id,
                    );
                    state.selectedSensorId = null;
                    saveParcels();
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
                    parcelId: parcel.terytId,
                    name: parcel.name,
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

    /* --- WIDOK I GEOMETRIA --- */
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

        const padding = 90;
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
        const sx = clientX - rect.left;
        const sy = clientY - rect.top;
        return {
            x: (sx - state.view.offsetX) / state.view.scale,
            y: (sy - state.view.offsetY) / state.view.scale,
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
            opt.value = p.id;
            opt.textContent = p.name;
            if (p.id === state.selectedParcelId) opt.selected = true;
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

    /* --- ZDARZENIA INTERFEJSU --- */
    function bindEvents() {
        const fieldSelect = document.getElementById("fieldSelect");
        fieldSelect?.addEventListener("change", (e) => {
            state.selectedParcelId = e.target.value;
            state.selectedSensorId = null;
            state.probePoint = null;
            setAddSensorMode(false);
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
                const active = getActiveSensors(parcel, "temp");
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
                        s.temp = Number(
                            (s.temp + (Math.random() * 1.8 - 0.9)).toFixed(1),
                        );
                        s.moisture = Number(
                            Math.max(
                                8,
                                Math.min(
                                    58,
                                    s.moisture + (Math.random() * 3.2 - 1.6),
                                ),
                            ).toFixed(1),
                        );
                        s.lastSeen = "Dziś, przed chwilą";
                    });
                }
                saveParcels();
                renderAll();
            });

        document
            .getElementById("btnResetTemplates")
            ?.addEventListener("click", () => {
                state.parcels = createTemplateParcels();
                state.selectedParcelId = state.parcels[0].id;
                state.selectedSensorId = null;
                state.probePoint = null;
                setAddSensorMode(false);
                saveParcels();
                populateParcelSelector();
                fitViewToParcel();
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
                if (Math.hypot(dx, dy) > 4) {
                    state.view.movedDuringDrag = true;
                }
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

                const nextNum = (parcel.sensors?.length || 0) + 1;
                const newSensor = {
                    id: `CZ-${100 + nextNum}`,
                    name: `Czujka #${nextNum} (nowa)`,
                    x: Number(pt.x.toFixed(1)),
                    y: Number(pt.y.toFixed(1)),
                    status: "offline",
                    temp: null,
                    moisture: null,
                    lastSeen: "Offline (ignorowana)",
                };

                parcel.sensors.push(newSensor);
                state.selectedSensorId = newSensor.id;
                saveParcels();
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

    function init() {
        populateParcelSelector();
        bindEvents();
        fitViewToParcel();
        renderAll();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
