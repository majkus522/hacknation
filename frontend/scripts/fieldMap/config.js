(function () {
    "use strict";

    window.PerunMap = window.PerunMap || {};

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

    function createInitialState() {
        return {
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
    }

    window.PerunMap.config = {
        SVG_NS,
        OFFLINE_SENSORS_KEY,
        CLIENT_GOOGLE_WEATHER_KEY,
        OVERLAY_META,
        STATUS_COLORS,
        STATUS_LABELS,
        createInitialState,
    };
})();
