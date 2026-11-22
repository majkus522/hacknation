(function () {
    "use strict";

    window.PerunMap = window.PerunMap || {};
    const { SVG_NS, STATUS_COLORS } = window.PerunMap.config;
    const { evaluateModeValueAt, interpolateColor } = window.PerunMap.math;

    function createSvgEl(tag, attrs = {}) {
        const el = document.createElementNS(SVG_NS, tag);
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
    }

    function renderOniOverlay(parcel, state) {
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

    function renderFieldAndCorners(parcel, state) {
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

    function renderSensors(parcel, state, onSelectSensor) {
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
                if (typeof onSelectSensor === "function") {
                    onSelectSensor();
                }
            });

            sensorsLayer.appendChild(g);
        });
    }

    function renderProbe(state) {
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

    function applyViewportTransform(state) {
        const layer = document.getElementById("viewportLayer");
        if (!layer) return;
        layer.setAttribute(
            "transform",
            `translate(${state.view.offsetX}, ${state.view.offsetY}) scale(${state.view.scale})`,
        );
    }

    function fitViewToParcel(parcel, state) {
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
        applyViewportTransform(state);
    }

    function screenToWorld(clientX, clientY, state) {
        const svg = document.getElementById("fieldSvg");
        const rect = svg.getBoundingClientRect();
        return {
            x: (clientX - rect.left - state.view.offsetX) / state.view.scale,
            y: -((clientY - rect.top - state.view.offsetY) / state.view.scale),
        };
    }

    window.PerunMap.svg = {
        createSvgEl,
        renderOniOverlay,
        renderFieldAndCorners,
        renderSensors,
        renderProbe,
        applyViewportTransform,
        fitViewToParcel,
        screenToWorld,
    };
})();
