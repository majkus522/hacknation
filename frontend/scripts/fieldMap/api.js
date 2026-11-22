(function () {
    "use strict";

    window.PerunMap = window.PerunMap || {};
    const { OFFLINE_SENSORS_KEY, CLIENT_GOOGLE_WEATHER_KEY } =
        window.PerunMap.config;

    async function fetchJsonSafe(path) {
        const clean = path.replace(/\/+$/, "");
        const variants = [`${clean}/`, clean];
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

    function extractArray(payload, candidateKeys = []) {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== "object") return [];

        for (const key of candidateKeys) {
            if (Array.isArray(payload[key])) return payload[key];
        }
        for (const val of Object.values(payload)) {
            if (Array.isArray(val)) return val;
        }
        return [];
    }

    async function fetchAllFieldsAndSensors() {
        const [rawFields, rawSensors] = await Promise.all([
            fetchJsonSafe("/field"),
            fetchJsonSafe("/sensor"),
        ]);

        const fields = extractArray(rawFields, ["fields", "items", "data"]);
        let sensors = extractArray(rawSensors, ["sensors", "items", "data"]);

        // Jeśli /sensor nie zwrócił czujek globalnie, spróbuj pobrać je per działka
        if (sensors.length === 0 && fields.length > 0) {
            const perFieldResults = await Promise.all(
                fields.map(async (f) => {
                    const fid =
                        f.fieldId ?? f.fieldid ?? f.field_id ?? f.id ?? null;
                    if (fid == null) return [];

                    const resA = await fetchJsonSafe(`/sensor/field/${fid}`);
                    const arrA = extractArray(resA, [
                        "sensors",
                        "items",
                        "data",
                    ]);
                    if (arrA.length > 0) {
                        return arrA.map((s) => ({
                            ...s,
                            fieldId: s.fieldId ?? s.fieldid ?? fid,
                        }));
                    }

                    const resB = await fetchJsonSafe(`/field/${fid}/sensors`);
                    const arrB = extractArray(resB, [
                        "sensors",
                        "items",
                        "data",
                    ]);
                    return arrB.map((s) => ({
                        ...s,
                        fieldId: s.fieldId ?? s.fieldid ?? fid,
                    }));
                }),
            );
            sensors = perFieldResults.flat();
        }

        return { fields, sensors };
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

    window.PerunMap.api = {
        fetchJsonSafe,
        extractArray,
        fetchAllFieldsAndSensors,
        loadOfflineSensorsMap,
        saveOfflineSensorsForField,
        parseGoogleWeatherPayload,
        fetchWeatherForParcel,
    };
})();
