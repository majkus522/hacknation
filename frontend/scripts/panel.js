(function () {
    "use strict";

    const TODAY_DEFAULT_TEMP = 14.2;

    function showAlert(msg, isError = false) {
        const box = document.getElementById("panelAlert");
        if (!box) return;
        box.textContent = msg;
        box.className = isError ? "panel-alert error" : "panel-alert";
    }

    function hideAlert() {
        const box = document.getElementById("panelAlert");
        if (box) box.className = "panel-alert hidden";
    }

    async function fetchJsonSafe(path) {
        const variants = path.endsWith("/") ? [path] : [`${path}/`, path];
        for (const url of variants) {
            try {
                const res = await window.PerunAuth.authFetch(url);
                if (res.ok) {
                    return await res.json();
                }
            } catch {
                /* kolejna ścieżka */
            }
        }
        return null;
    }

    function normalizeField(raw) {
        const id = raw.fieldid ?? raw.fieldId ?? raw.field_id ?? raw.id;
        let pts = raw.points;
        if (typeof pts === "string") {
            try {
                pts = JSON.parse(pts);
            } catch {
                pts = [];
            }
        }
        return {
            fieldId: id,
            name: raw.name || `Działka #${id}`,
            x: Number(raw.x ?? 0),
            y: Number(raw.y ?? 0),
            points: Array.isArray(pts) ? pts : [],
        };
    }

    function normalizeSensor(raw) {
        return {
            sensorId: raw.sensorid ?? raw.sensorId ?? raw.sensor_id ?? raw.id,
            fieldId: raw.fieldid ?? raw.fieldId ?? raw.field_id,
            typeId: raw.typeid ?? raw.typeId ?? raw.type_id,
            value: Number(raw.value),
        };
    }

    function evaluateAveragedStatus(sensorsForField) {
        if (!sensorsForField || sensorsForField.length === 0) {
            return {
                level: "ok",
                label: "OK (odczyt z pola)",
                summaryText: `Brak aktywnych czujek • Temperatura pola dziś: ${TODAY_DEFAULT_TEMP.toFixed(1)} °C`,
            };
        }

        const moistureReadings = [];
        const tempReadings = [];

        sensorsForField.forEach((s) => {
            if (Number(s.typeId) === 1) {
                const pct = s.value <= 1 ? s.value * 100 : s.value;
                moistureReadings.push(pct);
            } else if (Number(s.typeId) === 2) {
                tempReadings.push(s.value);
            }
        });

        let level = "ok";
        let label = "OK";
        const parts = [];

        if (moistureReadings.length > 0) {
            const avgM =
                moistureReadings.reduce((a, b) => a + b, 0) /
                moistureReadings.length;
            parts.push(`Śr. wilgotność: ${avgM.toFixed(1)}%`);

            if (avgM < 15 || avgM > 70) {
                level = "crit";
                label = "Krytyczny (wilgotność)";
            } else if ((avgM < 25 || avgM > 60) && level !== "crit") {
                level = "warn";
                label = "Ostrzeżenie (wilgotność)";
            }
        }

        if (tempReadings.length > 0) {
            const avgT =
                tempReadings.reduce((a, b) => a + b, 0) / tempReadings.length;
            parts.push(`Śr. temperatura: ${avgT.toFixed(1)} °C`);

            if (avgT < -3 || avgT > 34) {
                level = "crit";
                label = "Krytyczny (temperatura)";
            } else if ((avgT < 0 || avgT > 28) && level !== "crit") {
                level = "warn";
                label = "Ostrzeżenie (temperatura)";
            }
        }

        if (parts.length === 0) {
            const avgAny =
                sensorsForField.reduce((a, s) => a + s.value, 0) /
                sensorsForField.length;
            parts.push(`Śr. odczyt: ${avgAny.toFixed(2)}`);
        }

        return {
            level,
            label,
            summaryText: `Aktywnych czujek: ${sensorsForField.length} • ${parts.join(" | ")}`,
        };
    }

    function renderFieldsList(fields, allSensors) {
        const container = document.getElementById("fieldsList");
        if (!container) return;

        if (!fields || fields.length === 0) {
            container.innerHTML = `
                <div class="empty-fields-box">
                    <p>Nie masz jeszcze żadnych zapisanych działek w bazie.</p>
                    <a href="wyszukiwarka.html" class="btn btn-primary btn-sm">
                        Przejdź do wyszukiwarki działek
                    </a>
                </div>
            `;
            return;
        }

        container.innerHTML = "";

        fields.forEach((field) => {
            const fieldSensors = allSensors.filter(
                (s) => Number(s.fieldId) === Number(field.fieldId),
            );
            const status = evaluateAveragedStatus(fieldSensors);

            const link = document.createElement("a");
            link.href = `dzialka.html?id=${encodeURIComponent(field.fieldId)}`;
            link.className = "field-row-card";
            link.innerHTML = `
                <div>
                    <div class="field-row-title">
                        <strong>${field.name}</strong>
                        <span class="field-id-tag">ID #${field.fieldId}</span>
                    </div>
                    <div class="field-row-meta">
                        Współrzędne: X ${field.x}, Y ${field.y} &bull; Wierzchołków: ${field.points.length}
                    </div>
                </div>

                <div class="field-row-metrics">
                    <div>${status.summaryText}</div>
                    <span>Kliknij, aby otworzyć podgląd działki</span>
                </div>

                <div>
                    <span class="health-badge health-${status.level}">
                        <i class="health-dot"></i>
                        ${status.label}
                    </span>
                </div>

                <div class="field-row-arrow" aria-hidden="true">&rarr;</div>
            `;

            container.appendChild(link);
        });
    }

    async function loadDashboard() {
        hideAlert();
        const container = document.getElementById("fieldsList");
        if (container) {
            container.innerHTML =
                '<div class="panel-alert">Ładowanie listy działek z bazy...</div>';
        }

        const [rawFields, rawSensors] = await Promise.all([
            fetchJsonSafe("/field"),
            fetchJsonSafe("/sensor"),
        ]);

        const fieldsList = Array.isArray(rawFields)
            ? rawFields.map(normalizeField)
            : Array.isArray(rawFields?.items)
              ? rawFields.items.map(normalizeField)
              : [];

        const sensorsList = Array.isArray(rawSensors)
            ? rawSensors.map(normalizeSensor)
            : Array.isArray(rawSensors?.items)
              ? rawSensors.items.map(normalizeSensor)
              : [];

        if (!rawFields) {
            showAlert(
                "Nie udało się pobrać listy działek z endpointu /field. Sprawdź działanie backendu.",
                true,
            );
        }

        renderFieldsList(fieldsList, sensorsList);
    }

    function init() {
        document
            .getElementById("btnRefreshFields")
            ?.addEventListener("click", loadDashboard);
        loadDashboard();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
