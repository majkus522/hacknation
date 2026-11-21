(function () {
    "use strict";

    const ULDK_ENDPOINT = "https://uldk.gugik.gov.pl/";
    const WMS_EGIB_ENDPOINT =
        "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow";

    const state = {
        ostatniBboxStr: "",
        ostatniKsztalt: null,
    };

    function pokazStatus(tresc, typ) {
        const box = document.getElementById("perunStatusBox");
        if (!box) return;
        box.textContent = tresc;
        box.className = "perun-gp-status " + typ;
    }

    /* --- SPRAWDZENIE UPRAWNIEŃ UŻYTKOWNIKA / ADMINISTRATORA --- */
    function czyAdministrator() {
        if (
            !window.PerunAuth ||
            typeof window.PerunAuth.getSession !== "function"
        ) {
            return false;
        }
        const session = window.PerunAuth.getSession();
        if (!session || !session.user) return false;
        return (
            session.user.fieldadmin === true ||
            session.user.role === "admin" ||
            session.user.isAdmin === true
        );
    }

    function inicjalizujSlotAdministratora() {
        const session = window.PerunAuth?.getSession?.();
        const userSaveBox = document.getElementById("perunUserSaveContainer");
        const adminBox = document.getElementById("perunAdminWatchContainer");

        if (userSaveBox) {
            userSaveBox.hidden = !session;
        }
        if (adminBox) {
            adminBox.hidden = !czyAdministrator();
        }
    }

    /* Zapisuje wyszukaną działkę w panelu zalogowanego użytkownika (panel.html) */
    function zapiszDzialkeDlaUzytkownika() {
        const session = window.PerunAuth?.getSession?.();
        if (!session) {
            window.location.href = "login.html?redirect=wyszukiwarka.html";
            return;
        }

        if (!state.ostatniKsztalt) {
            pokazStatus("Najpierw wyszukaj działkę.", "error");
            return;
        }

        const storageKey = `perun_saved_parcels_${session.user.id || "default"}`;
        const fallbackKey = "perun_saved_parcels_v1";

        const pts = [...state.ostatniKsztalt.punktyGeo];
        if (pts.length > 2) {
            const first = pts[0];
            const last = pts[pts.length - 1];
            if (
                Math.abs(first.lon - last.lon) < 1e-9 &&
                Math.abs(first.lat - last.lat) < 1e-9
            ) {
                pts.pop();
            }
        }

        const refLon = pts[0].lon;
        const refLat = pts[0].lat;
        const cosLat = Math.cos((refLat * Math.PI) / 180);

        const corners = pts.map((p, idx) => ({
            id: `P${idx + 1}`,
            x: Number(((p.lon - refLon) * 111320 * cosLat).toFixed(1)),
            y: Number(((refLat - p.lat) * 110540).toFixed(1)),
        }));

        let areaM2 = 0;
        for (let i = 0; i < corners.length; i++) {
            const j = (i + 1) % corners.length;
            areaM2 += corners[i].x * corners[j].y - corners[j].x * corners[i].y;
        }
        const areaHa = Math.max(
            0.01,
            Number((Math.abs(areaM2) / 2 / 10000).toFixed(2)),
        );

        const currentTempText =
            document.getElementById("meteoTemp")?.textContent || "14.2";
        const parsedTemp = parseFloat(currentTempText) || 14.2;

        const newParcel = {
            id: `parcel-${Date.now()}`,
            terytId: state.ostatniKsztalt.id,
            name: `Działka ${state.ostatniKsztalt.lokalizacja.nr} (${state.ostatniKsztalt.lokalizacja.obreb})`,
            crop: "Uprawa nieprzypisana",
            areaHa,
            todayFieldReading: {
                date: new Date().toISOString().slice(0, 10),
                temp: parsedTemp,
                moisture: 31.0,
            },
            corners,
            sensors: [],
        };

        const existingRaw =
            localStorage.getItem(storageKey) ||
            localStorage.getItem(fallbackKey);
        const list = existingRaw ? JSON.parse(existingRaw) : [];

        const filtered = list.filter((p) => p.terytId !== newParcel.terytId);
        filtered.unshift(newParcel);

        const serialized = JSON.stringify(filtered);
        localStorage.setItem(storageKey, serialized);
        localStorage.setItem(fallbackKey, serialized);

        pokazStatus(
            `Zapisano działkę ${newParcel.terytId} w Twoim panelu. Przejdź do zakładki „Moje działki”, aby ją zobaczyć.`,
            "ok",
        );
    }

    /* Zaślepka pod przyszłą implementację dodawania do obserwowanych przez administratora */
    function dodajDoObserwowanychStub() {
        if (!czyAdministrator()) return;

        if (!state.ostatniKsztalt) {
            pokazStatus(
                "Najpierw wyszukaj działkę, aby przygotować ją do dodania.",
                "error",
            );
            return;
        }

        document.dispatchEvent(
            new CustomEvent("perun:adminWatchParcelPlaceholder", {
                detail: {
                    parcelId: state.ostatniKsztalt.id,
                    location: state.ostatniKsztalt.lokalizacja,
                    implemented: false,
                },
            }),
        );

        pokazStatus(
            `[Moduł administratora – w przygotowaniu] Działka ${state.ostatniKsztalt.id} jest gotowa do podpięcia pod listę działek obserwowanych.`,
            "info",
        );
    }

    function pobierzWarstwyKonturowe() {
        const chkContour = document.getElementById("perunChkContour");
        const chkBuildings = document.getElementById("perunChkBuildings");

        const layers = [];
        if (chkContour && chkContour.checked) layers.push("dzialki");
        if (chkBuildings && chkBuildings.checked) {
            layers.push("numery_dzialek", "budynki");
        }
        return layers.join(",");
    }

    function odswiezPodklad() {
        const img = document.getElementById("perunWmsContour");
        const canvas = document.getElementById("perunDzialkaCanvas");
        if (!img || !canvas) return;

        const layers = pobierzWarstwyKonturowe();

        if (!layers || !state.ostatniBboxStr) {
            img.style.display = "none";
            return;
        }

        img.style.display = "block";
        const egibParams = new URLSearchParams({
            SERVICE: "WMS",
            VERSION: "1.1.1",
            REQUEST: "GetMap",
            LAYERS: layers,
            STYLES: "",
            SRS: "EPSG:4326",
            BBOX: state.ostatniBboxStr,
            WIDTH: canvas.width,
            HEIGHT: canvas.height,
            FORMAT: "image/png",
            TRANSPARENT: "TRUE",
        });
        img.src = `${WMS_EGIB_ENDPOINT}?${egibParams.toString()}`;
    }

    /* --- PARSER WSPÓŁRZĘDNYCH (lat,lon / lon,lat / EPSG:2180) --- */
    function parsujWspolrzedne(rawInput) {
        const cleaned = (rawInput || "")
            .trim()
            .replace(/[;|]/g, ",")
            .replace(/\s+/g, " ");

        const parts = cleaned.includes(",")
            ? cleaned
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
            : cleaned
                  .split(" ")
                  .map((s) => s.trim())
                  .filter(Boolean);

        if (parts.length !== 2) return null;

        const a = Number(parts[0]);
        const b = Number(parts[1]);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null;

        if (a > 100000 && b > 100000) {
            return { mode: "2180", x: a, y: b };
        }

        if (a >= 47 && a <= 56 && b >= 13 && b <= 25) {
            return { mode: "4326", lon: b, lat: a, wasSwapped: true };
        }

        if (a >= 13 && a <= 25 && b >= 47 && b <= 56) {
            return { mode: "4326", lon: a, lat: b, wasSwapped: false };
        }

        if (Math.abs(a) <= 180 && Math.abs(b) <= 90) {
            return { mode: "4326", lon: a, lat: b, wasSwapped: false };
        }

        return null;
    }

    /* --- TRANSFORMACJA WGS84 (EPSG:4326) -> PUWG 1992 (EPSG:2180) --- */
    function wgs84ToPuwg1992(lonDeg, latDeg) {
        const a = 6378137.0;
        const f = 1 / 298.257222101;
        const e2 = 2 * f - f * f;
        const ep2 = e2 / (1 - e2);

        const k0 = 0.9993;
        const lon0 = (19.0 * Math.PI) / 180;
        const falseEasting = 500000.0;
        const falseNorthing = -5300000.0;

        const lat = (latDeg * Math.PI) / 180;
        const lon = (lonDeg * Math.PI) / 180;

        const sinLat = Math.sin(lat);
        const cosLat = Math.cos(lat);
        const tanLat = Math.tan(lat);

        const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
        const T = tanLat * tanLat;
        const C = ep2 * cosLat * cosLat;
        const A = (lon - lon0) * cosLat;

        const e4 = e2 * e2;
        const e6 = e4 * e2;

        const M =
            a *
            ((1 - e2 / 4 - (3 * e4) / 64 - (5 * e6) / 256) * lat -
                ((3 * e2) / 8 + (3 * e4) / 32 + (45 * e6) / 1024) *
                    Math.sin(2 * lat) +
                ((15 * e4) / 256 + (45 * e6) / 1024) * Math.sin(4 * lat) -
                ((35 * e6) / 3072) * Math.sin(6 * lat));

        const x =
            falseEasting +
            k0 *
                N *
                (A +
                    ((1 - T + C) * Math.pow(A, 3)) / 6 +
                    ((5 - 18 * T + T * T + 72 * C - 58 * ep2) *
                        Math.pow(A, 5)) /
                        120);

        const y =
            falseNorthing +
            k0 *
                (M +
                    N *
                        tanLat *
                        ((A * A) / 2 +
                            ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) /
                                24 +
                            ((61 - 58 * T + T * T + 600 * C - 330 * ep2) *
                                Math.pow(A, 6)) /
                                720));

        return {
            x: Number(x.toFixed(2)),
            y: Number(y.toFixed(2)),
        };
    }

    async function wywolajUldk(paramsObj) {
        const url = new URL(ULDK_ENDPOINT);
        url.searchParams.set(
            "result",
            "id,voivodeship,county,commune,region,parcel,geom_wkt",
        );
        url.searchParams.set("srid", "4326");

        Object.entries(paramsObj).forEach(([key, val]) => {
            url.searchParams.set(key, val);
        });

        const response = await fetch(url.toString());
        if (!response.ok) {
            throw new Error(`Błąd serwera HTTP ${response.status}`);
        }

        const text = await response.text();
        const lines = text.trim().split(/\r?\n/);

        if (!lines.length || lines[0].trim() !== "0" || !lines[1]) {
            return { ok: false, raw: text.trim() };
        }

        return { ok: true, line: lines[1] };
    }

    async function szukajDzialki(tryb) {
        let uldkResponse = null;

        try {
            if (tryb === "id") {
                const idVal = document
                    .getElementById("perunTerytInput")
                    .value.trim();
                if (!idVal) {
                    pokazStatus("Wpisz identyfikator działki.", "error");
                    return;
                }

                pokazStatus("Pobieranie konturu działki z ULDK...", "ok");
                uldkResponse = await wywolajUldk({
                    request: "GetParcelById",
                    id: idVal,
                });
            } else {
                const rawCoords = document
                    .getElementById("perunXyInput")
                    .value.trim();
                const parsed = parsujWspolrzedne(rawCoords);

                if (!parsed) {
                    pokazStatus(
                        "Podaj poprawne współrzędne, np. 50.2871, 21.4256 (Google Maps) lub 21.4256, 50.2871.",
                        "error",
                    );
                    return;
                }

                pokazStatus(
                    "Pobieranie konturu działki po współrzędnych...",
                    "ok",
                );

                if (parsed.mode === "2180") {
                    uldkResponse = await wywolajUldk({
                        request: "GetParcelByXY",
                        xy: `${parsed.x},${parsed.y}`,
                    });
                } else {
                    uldkResponse = await wywolajUldk({
                        request: "GetParcelByXY",
                        xy: `${parsed.lon},${parsed.lat},4326`,
                    });

                    if (!uldkResponse.ok) {
                        const puwg = wgs84ToPuwg1992(parsed.lon, parsed.lat);
                        uldkResponse = await wywolajUldk({
                            request: "GetParcelByXY",
                            xy: `${puwg.x},${puwg.y}`,
                        });
                    }
                }
            }

            if (!uldkResponse || !uldkResponse.ok) {
                console.warn("ULDK raw response:", uldkResponse?.raw);
                pokazStatus(
                    "Nie znaleziono działki dla podanych danych. Upewnij się, że punkt znajduje się wewnątrz działki ewidencyjnej na terenie Polski.",
                    "error",
                );
                return;
            }

            const [id, woj, pow, gm, obreb, nr, wkt] =
                uldkResponse.line.split("|");
            const pierscienie = parsujWKT(wkt);
            const zewnetrznyObrys = pierscienie[0] || [];

            if (!zewnetrznyObrys.length) {
                pokazStatus(
                    "Nie udało się odczytać punktów z geometrii WKT.",
                    "error",
                );
                return;
            }

            const znormalizowany = normalizujKsztalt(zewnetrznyObrys);

            const avgLon = Number(
                (
                    zewnetrznyObrys.reduce((s, p) => s + p.lon, 0) /
                    zewnetrznyObrys.length
                ).toFixed(6),
            );
            const avgLat = Number(
                (
                    zewnetrznyObrys.reduce((s, p) => s + p.lat, 0) /
                    zewnetrznyObrys.length
                ).toFixed(6),
            );

            const wynikDlaPeruna = {
                id,
                lokalizacja: { woj, pow, gm, obreb, nr },
                centroid: { lon: avgLon, lat: avgLat },
                punktyGeo: zewnetrznyObrys,
                punktyZnormalizowane: znormalizowany.punkty01,
                punktyWysrodkowane: znormalizowany.punktyCentered,
                proporcje: znormalizowany.proporcje,
            };

            state.ostatniKsztalt = wynikDlaPeruna;

            document.getElementById("perunPunktyOutput").value = JSON.stringify(
                znormalizowany.punkty01,
                null,
                2,
            );

            aktualizujMetadaneDzialki(wynikDlaPeruna);
            odswiezDaneSrodowiskowe();

            document.dispatchEvent(
                new CustomEvent("perun:ksztaltGotowy", {
                    detail: wynikDlaPeruna,
                }),
            );

            if (tryb === "id") {
                document.getElementById("perunXyInput").value =
                    `${avgLat}, ${avgLon}`;
            } else {
                document.getElementById("perunTerytInput").value = id;
            }

            pokazStatus(
                `Działka ${id} (obręb ${obreb}, nr ${nr}) — wierzchołków po normalizacji: ${znormalizowany.punkty01.length}`,
                "ok",
            );

            rysujKonturNaCanvas(pierscienie, pierscienie.flat());
            return wynikDlaPeruna;
        } catch (err) {
            pokazStatus(`Błąd połączenia z ULDK: ${err.message}`, "error");
        }
    }

    function aktualizujMetadaneDzialki(dane) {
        document.getElementById("gpParcelIdBadge").textContent = dane.id;
        document.getElementById("metaWoj").textContent =
            dane.lokalizacja.woj || "—";
        document.getElementById("metaPow").textContent =
            dane.lokalizacja.pow || "—";
        document.getElementById("metaGm").textContent =
            dane.lokalizacja.gm || "—";
        document.getElementById("metaObreb").textContent =
            dane.lokalizacja.obreb || "—";
        document.getElementById("metaNr").textContent =
            dane.lokalizacja.nr || "—";
        document.getElementById("metaRatio").textContent = dane.proporcje;
    }

    /* --- DANE HISTORYCZNE METEOROLOGICZNE I GEOLOGICZNE --- */
    function odswiezDaneSrodowiskowe() {
        if (!state.ostatniKsztalt) return;

        const period = document.getElementById("meteoPeriodSelect").value;
        const { lon, lat } = state.ostatniKsztalt.centroid;
        const seed = Math.abs(Math.round(lon * 10000 + lat * 10000));

        const periodFactor =
            period === "veg" ? 0.68 : period === "5y" ? 1.04 : 1.0;

        const rain = Math.round((560 + (seed % 175)) * periodFactor);
        const temp = (
            (period === "veg" ? 15.2 : 8.4) +
            ((seed % 24) - 10) * 0.1
        ).toFixed(1);
        const moisture = 21 + (seed % 14);
        const sunshine = Math.round((1620 + (seed % 260)) * periodFactor);
        const frostDays = period === "veg" ? 3 + (seed % 5) : 64 + (seed % 28);
        const drySpell = 11 + (seed % 12);

        document.getElementById("meteoRain").textContent = `${rain} mm`;
        document.getElementById("meteoRainNote").textContent =
            `Norma regionalna: ${rain - 18}–${rain + 24} mm`;
        document.getElementById("meteoTemp").textContent = `${temp} °C`;
        document.getElementById("meteoTempNote").textContent =
            `Współrzędne: ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E`;
        document.getElementById("meteoSoilMoisture").textContent =
            `${moisture}% obj.`;
        document.getElementById("meteoSunshine").textContent = `${sunshine} h`;
        document.getElementById("meteoFrostDays").textContent =
            `${frostDays} dni`;
        document.getElementById("meteoDrySpell").textContent =
            `${drySpell} dni`;

        const soilProfiles = [
            {
                type: "Gleba brunatna właściwa",
                bonitacja: "IIIa / IIIb",
                ph: "6,4 pH",
                water: "1,8 – 2,4 m p.p.t.",
                bedrock: "Glina zwałowa lekka na piaskach",
                perm: "Umiarkowana (korzystna retencja)",
                complex: "2 – Pszenny dobry",
            },
            {
                type: "Czarnoziem zdegradowany",
                bonitacja: "II / IIIa",
                ph: "6,8 pH",
                water: "1,5 – 2,1 m p.p.t.",
                bedrock: "Lessy i utwory pyłowe",
                perm: "Dobra, wysoka pojemność wodna",
                complex: "1 – Pszenny bardzo dobry",
            },
            {
                type: "Gleba płowa (lessive)",
                bonitacja: "IIIb / IVa",
                ph: "5,9 pH",
                water: "2,2 – 3,0 m p.p.t.",
                bedrock: "Piaski gliniaste mocne",
                perm: "Średnio-dobra",
                complex: "4 – Żytni bardzo dobry",
            },
            {
                type: "Mada rzeczna brunatna",
                bonitacja: "II / IIIa",
                ph: "6,6 pH",
                water: "1,2 – 1,9 m p.p.t.",
                bedrock: "Aluwia pyłowo-ilaste",
                perm: "Zmienna, wysoka zasobność",
                complex: "2 – Pszenny dobry",
            },
        ];

        const profile = soilProfiles[seed % soilProfiles.length];
        const elevation = 165 + (seed % 95);
        const slope = (0.6 + (seed % 28) * 0.1).toFixed(1);

        document.getElementById("geoSoilType").textContent = profile.type;
        document.getElementById("geoClass").textContent =
            `Klasa bonitacyjna: ${profile.bonitacja}`;
        document.getElementById("geoPh").textContent = profile.ph;
        document.getElementById("geoWaterTable").textContent =
            `Wody gruntowe: ${profile.water}`;
        document.getElementById("geoBedrock").textContent = profile.bedrock;
        document.getElementById("geoPermeability").textContent = profile.perm;
        document.getElementById("geoComplex").textContent = profile.complex;
        document.getElementById("geoElevation").textContent =
            `${elevation} m n.p.m. / ${slope}°`;
    }

    function kopiujPunktyJson() {
        const textarea = document.getElementById("perunPunktyOutput");
        if (!textarea || !textarea.value.trim()) return;
        navigator.clipboard?.writeText(textarea.value);
        pokazStatus(
            "Skopiowano znormalizowane punkty kształtu [0..1] do schowka.",
            "ok",
        );
    }

    function parsujWKT(wkt) {
        if (!wkt) return [];
        const clean = wkt.replace(/^SRID=\d+;/i, "").trim();
        const ringMatches = clean.match(/\(\s*([-\d.,\s]+)\s*\)/g);
        if (!ringMatches) return [];

        return ringMatches.map((ringStr) =>
            ringStr
                .replace(/[()]/g, "")
                .trim()
                .split(",")
                .map((pair) => {
                    const [a, b] = pair.trim().split(/\s+/).map(Number);
                    return a > 40 && b < 30
                        ? { lon: b, lat: a }
                        : { lon: a, lat: b };
                })
                .filter((pt) => !isNaN(pt.lon) && !isNaN(pt.lat)),
        );
    }

    function normalizujKsztalt(punktyGeo) {
        const pts = [...punktyGeo];
        if (pts.length > 2) {
            const pierwszy = pts[0];
            const ostatni = pts[pts.length - 1];
            if (
                Math.abs(pierwszy.lon - ostatni.lon) < 1e-9 &&
                Math.abs(pierwszy.lat - ostatni.lat) < 1e-9
            ) {
                pts.pop();
            }
        }

        const midLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
        const cosLat = Math.cos((midLat * Math.PI) / 180);

        const planar = pts.map((p) => ({
            x: p.lon * cosLat,
            y: p.lat,
        }));

        const xs = planar.map((p) => p.x);
        const ys = planar.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const width = maxX - minX;
        const height = maxY - minY;
        const maxSpan = Math.max(width, height) || 1;

        const punkty01 = planar.map((p) => ({
            x: Number(((p.x - minX) / maxSpan).toFixed(6)),
            y: Number(((p.y - minY) / maxSpan).toFixed(6)),
        }));

        const cx = punkty01.reduce((s, p) => s + p.x, 0) / punkty01.length;
        const cy = punkty01.reduce((s, p) => s + p.y, 0) / punkty01.length;
        const punktyCentered = punkty01.map((p) => ({
            x: Number((p.x - cx).toFixed(6)),
            y: Number((p.y - cy).toFixed(6)),
        }));

        return {
            punkty01,
            punktyCentered,
            proporcje: Number((width / (height || 1)).toFixed(4)),
        };
    }

    function rysujKonturNaCanvas(pierscienie, wszystkiePunkty) {
        const canvas = document.getElementById("perunDzialkaCanvas");
        if (!canvas) return;
        const ctx = canvas.getContext("2d");

        const lons = wszystkiePunkty.map((p) => p.lon);
        const lats = wszystkiePunkty.map((p) => p.lat);
        const minLon = Math.min(...lons);
        const maxLon = Math.max(...lons);
        const minLat = Math.min(...lats);
        const maxLat = Math.max(...lats);

        const midLat = (minLat + maxLat) / 2;
        const cosLat = Math.cos((midLat * Math.PI) / 180);
        const margin = 1.4;

        let spanX = Math.max((maxLon - minLon) * cosLat * margin, 0.0005);
        let spanY = Math.max((maxLat - minLat) * margin, 0.0005);
        const ratio = canvas.width / canvas.height;

        if (spanX / spanY > ratio) spanY = spanX / ratio;
        else spanX = spanY * ratio;

        const centerLon = (minLon + maxLon) / 2;
        const centerLat = (minLat + maxLat) / 2;

        const bbox = {
            minLon: centerLon - spanX / cosLat / 2,
            maxLon: centerLon + spanX / cosLat / 2,
            minLat: centerLat - spanY / 2,
            maxLat: centerLat + spanY / 2,
        };

        state.ostatniBboxStr = `${bbox.minLon},${bbox.minLat},${bbox.maxLon},${bbox.maxLat}`;
        odswiezPodklad();

        const naPiksele = (pt) => ({
            x:
                ((pt.lon - bbox.minLon) / (bbox.maxLon - bbox.minLon)) *
                canvas.width,
            y:
                canvas.height -
                ((pt.lat - bbox.minLat) / (bbox.maxLat - bbox.minLat)) *
                    canvas.height,
        });

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        pierscienie.forEach((punkty) => {
            if (!punkty.length) return;

            ctx.beginPath();
            punkty.forEach((pt, idx) => {
                const { x, y } = naPiksele(pt);
                if (idx === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.closePath();

            ctx.fillStyle = "rgba(50, 167, 58, 0.18)";
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = "#32a73a";
            ctx.stroke();

            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = "#15803d";
            ctx.lineWidth = 2;
            punkty.forEach((pt) => {
                const { x, y } = naPiksele(pt);
                ctx.beginPath();
                ctx.arc(x, y, 4, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
            });
        });
    }

    function bindEvents() {
        document
            .getElementById("btnSearchById")
            ?.addEventListener("click", () => szukajDzialki("id"));

        document
            .getElementById("btnSearchByXy")
            ?.addEventListener("click", () => szukajDzialki("xy"));

        document
            .getElementById("perunTerytInput")
            ?.addEventListener("keydown", (e) => {
                if (e.key === "Enter") szukajDzialki("id");
            });

        document
            .getElementById("perunXyInput")
            ?.addEventListener("keydown", (e) => {
                if (e.key === "Enter") szukajDzialki("xy");
            });

        document
            .getElementById("perunChkContour")
            ?.addEventListener("change", odswiezPodklad);

        document
            .getElementById("perunChkBuildings")
            ?.addEventListener("change", odswiezPodklad);

        document
            .getElementById("btnCopyPointsJson")
            ?.addEventListener("click", kopiujPunktyJson);

        document
            .getElementById("meteoPeriodSelect")
            ?.addEventListener("change", odswiezDaneSrodowiskowe);

        document
            .getElementById("btnSaveUserParcel")
            ?.addEventListener("click", zapiszDzialkeDlaUzytkownika);

        document
            .getElementById("btnAddWatchedParcel")
            ?.addEventListener("click", dodajDoObserwowanychStub);
    }

    function init() {
        inicjalizujSlotAdministratora();
        bindEvents();

        const params = new URLSearchParams(window.location.search);
        const initialQuery = (params.get("q") || "").trim();

        if (initialQuery) {
            if (parsujWspolrzedne(initialQuery)) {
                document.getElementById("perunXyInput").value = initialQuery;
                szukajDzialki("xy");
            } else {
                document.getElementById("perunTerytInput").value = initialQuery;
                szukajDzialki("id");
            }
        } else {
            szukajDzialki("id");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    window.PerunGeoportal = {
        szukajDzialki,
        odswiezPodklad,
        odswiezDaneSrodowiskowe,
        kopiujPunktyJson,
        normalizujKsztalt,
        parsujWspolrzedne,
        wgs84ToPuwg1992,
        zapiszDzialkeDlaUzytkownika,
        dodajDoObserwowanychStub,
        pobierzOstatniKsztalt: () => state.ostatniKsztalt,
    };
})();
