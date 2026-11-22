(function () {
    "use strict";

    const { createInitialState } = window.PerunMap.config;
    const { fetchJsonSafe, saveOfflineSensorsForField, fetchWeatherForParcel } =
        window.PerunMap.api;
    const { hydrateParcels, isPointInPolygon } = window.PerunMap.math;
    const {
        renderOniOverlay,
        renderFieldAndCorners,
        renderSensors,
        renderProbe,
        applyViewportTransform,
        fitViewToParcel,
        screenToWorld,
    } = window.PerunMap.svg;
    const {
        populateParcelSelector,
        setAddSensorMode,
        renderOverlayButtonsAndLegend,
        renderSidebar,
    } = window.PerunMap.ui;

    const state = createInitialState();

    function getCurrentParcel() {
        return (
            state.parcels.find(
                (p) => String(p.fieldId) === String(state.selectedFieldId),
            ) || state.parcels[0]
        );
    }

    function renderAll() {
        const parcel = getCurrentParcel();
        if (!parcel) return;

        renderOniOverlay(parcel, state);
        renderFieldAndCorners(parcel, state);
        renderSensors(parcel, state, renderAll);
        renderProbe(state);
        renderOverlayButtonsAndLegend(state);
        renderSidebar(parcel, state, renderAll);
    }

    function bindEvents() {
        document
            .getElementById("fieldSelect")
            ?.addEventListener("change", async (e) => {
                state.selectedFieldId = e.target.value;
                state.selectedSensorId = null;
                state.probePoint = null;
                setAddSensorMode(state, false);

                const nextUrl = new URL(window.location.href);
                nextUrl.searchParams.set("id", state.selectedFieldId);
                window.history.replaceState({}, "", nextUrl);

                const parcel = getCurrentParcel();
                fitViewToParcel(parcel, state);
                renderAll();

                await fetchWeatherForParcel(parcel, false);
                renderAll();
            });

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
                setAddSensorMode(state, !state.addSensorMode);
            });

        document
            .getElementById("toggleSensors")
            ?.addEventListener("change", (e) => {
                state.showSensors = e.target.checked;
                renderAll();
            });

        document.getElementById("btnZoomIn")?.addEventListener("click", () => {
            state.view.scale = Math.min(state.view.scale * 1.2, 6);
            applyViewportTransform(state);
        });

        document.getElementById("btnZoomOut")?.addEventListener("click", () => {
            state.view.scale = Math.max(state.view.scale / 1.2, 0.25);
            applyViewportTransform(state);
        });

        document.getElementById("btnFitView")?.addEventListener("click", () => {
            fitViewToParcel(getCurrentParcel(), state);
        });

        const svg = document.getElementById("fieldSvg");
        if (!svg) return;

        svg.addEventListener("mousemove", (e) => {
            const pt = screenToWorld(e.clientX, e.clientY, state);
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
                applyViewportTransform(state);
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
                applyViewportTransform(state);
            },
            { passive: false },
        );

        svg.addEventListener("click", (e) => {
            if (state.view.movedDuringDrag) return;

            const parcel = getCurrentParcel();
            if (!parcel) return;

            const pt = screenToWorld(e.clientX, e.clientY, state);
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
                setAddSensorMode(state, false);
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

        populateParcelSelector(state);
        const currentParcel = getCurrentParcel();
        fitViewToParcel(currentParcel, state);
        renderAll();

        await fetchWeatherForParcel(currentParcel, false);
        renderAll();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
