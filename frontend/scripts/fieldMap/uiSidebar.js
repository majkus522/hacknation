(function () {
    "use strict";

    window.PerunMap = window.PerunMap || {};
    const { OVERLAY_META, STATUS_COLORS, STATUS_LABELS } =
        window.PerunMap.config;
    const { saveOfflineSensorsForField } = window.PerunMap.api;
    const {
        computeCentroid,
        getActiveSensors,
        getWeatherDefaultValue,
        computePointIrrigationMetrics,
        describeModeValue,
        computeParcelSummary,
    } = window.PerunMap.math;

    function populateParcelSelector(state) {
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

    function setAddSensorMode(state, enabled) {
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

    function renderOverlayButtonsAndLegend(state) {
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

    function renderSidebar(parcel, state, onDeleteOfflineSensor) {
        const activeMode =
            state.overlayMode === "off" ? "temp" : state.overlayMode;
        const meta = OVERLAY_META[activeMode];
        const overlayMeta = OVERLAY_META[state.overlayMode];
        const summary = computeParcelSummary(parcel, activeMode);

        const activeTempSensors = getActiveSensors(parcel, "temp");
        const activeMoistureSensors = getActiveSensors(parcel, "moisture");

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
        if (activeMode === "temp" && activeTempSensors.length > 0) {
            pill.className = "source-mode-pill mode-sensor";
            pill.textContent = `Interpolacja IDW z ${activeTempSensors.length} czujek temp. (nadpisuje Weather API)`;
        } else if (
            activeMode === "moisture" &&
            activeMoistureSensors.length > 0
        ) {
            pill.className = "source-mode-pill mode-sensor";
            pill.textContent = `Interpolacja IDW z ${activeMoistureSensors.length} czujek wilgoci (nadpisuje Weather API)`;
        } else if (summary.hasSensors) {
            pill.className = "source-mode-pill mode-sensor";
            pill.textContent =
                "Czujki z bazy (priorytet) + uzupełnienie z Google Weather API";
        } else {
            pill.className = "source-mode-pill mode-field";
            pill.textContent =
                "Brak aktywnych czujek – dane bazowe z Google Weather API";
        }

        const formattedAvg = `${summary.value.toFixed(meta.decimals)}${meta.unit}`;
        const rangeStr = `${summary.min.toFixed(meta.decimals)}–${summary.max.toFixed(meta.decimals)}${meta.unit}`;
        document.getElementById("infoMetricSummary").textContent =
            `${formattedAvg} (zakres: ${rangeStr})`;

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
                    <div><dt>Temperatura (${activeTempSensors.length > 0 ? "IDW czujek" : "Weather API"}):</dt><dd>${ptMetrics.temp.toFixed(1)} °C</dd></div>
                    <div><dt>Wilgotność (${activeMoistureSensors.length > 0 ? "IDW czujek" : "Weather API"}):</dt><dd>${ptMetrics.moisture.toFixed(1)} %</dd></div>
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
            const normCoordsStr =
                selectedSensor.normX != null && selectedSensor.normY != null
                    ? ` (norm: ${selectedSensor.normX}, ${selectedSensor.normY})`
                    : "";
            sensorBox.className = "";
            sensorBox.innerHTML = `
                <dl class="meta-list">
                    <div><dt>ID / Nazwa:</dt><dd>${selectedSensor.id} – ${selectedSensor.name}</dd></div>
                    <div><dt>Pozycja:</dt><dd>${selectedSensor.x} m, ${selectedSensor.y} m${normCoordsStr}</dd></div>
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
                    if (typeof onDeleteOfflineSensor === "function") {
                        onDeleteOfflineSensor();
                    }
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
                    sensors: parcel.sensors,
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

    window.PerunMap.ui = {
        populateParcelSelector,
        setAddSensorMode,
        renderOverlayButtonsAndLegend,
        renderWeatherCard,
        renderSidebar,
    };
})();
