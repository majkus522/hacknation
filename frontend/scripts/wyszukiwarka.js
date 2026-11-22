(function () {
    "use strict";

    const ULDK_ENDPOINT = "https://uldk.gugik.gov.pl/";
    const WMS_EGIB_ENDPOINT =
        "https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow";

    const state = {
        ostatniBboxStr: "",
        ostatniKsztalt: null,
        lastAnalysisReport: null,
    };

    function pokazStatus(tresc, typ) {
        const box = document.getElementById("perunStatusBox");
        if (!box) return;
        box.textContent = tresc;
        box.className = "perun-gp-status " + typ;
    }

    function setAnalysisStatus(message, type) {
        const status = document.getElementById("analysisReportStatus");
        if (!status) return;
        status.textContent = message;
        status.className = `perun-gp-status ${type}`;
    }

    async function loadAnalysisCrops() {
        const select = document.getElementById("analysisCropSelect");
        if (!select) return;

        const analysisDateInput = document.getElementById("analysisDate");
        if (analysisDateInput) {
            const today = new Date();
            const todayLocal = [
                today.getFullYear(),
                String(today.getMonth() + 1).padStart(2, "0"),
                String(today.getDate()).padStart(2, "0"),
            ].join("-");
            analysisDateInput.min = "2016-01-01";
            analysisDateInput.max = todayLocal;
            analysisDateInput.value = todayLocal;
        }

        try {
            const response = await window.PerunAuth.authFetch("/crop/");
            const crops = await response.json().catch(() => []);
            if (!response.ok) {
                throw new Error(crops.detail || `Błąd pobierania upraw (${response.status})`);
            }
            if (!Array.isArray(crops) || crops.length === 0) {
                throw new Error("Brak upraw w bazie.");
            }

            select.replaceChildren(new Option("Wybierz uprawę…", ""));
            crops.forEach((crop) => {
                select.add(new Option(crop.name, crop.crop_id));
            });
        } catch (error) {
            select.replaceChildren(new Option("Nie udało się pobrać upraw", ""));
            setAnalysisStatus(error.message, "error");
        }
    }

    function addReportText(container, tag, text, className = "") {
        const element = document.createElement(tag);
        element.textContent = text == null || text === "" ? "Brak danych" : String(text);
        if (className) element.className = className;
        container.appendChild(element);
        return element;
    }

    function addReportList(container, title, items, renderItem = (item) => item) {
        addReportText(container, "h3", title);
        if (!items || items.length === 0) {
            addReportText(container, "p", "Brak danych.");
            return;
        }
        const list = document.createElement("ul");
        items.forEach((item) => addReportText(list, "li", renderItem(item)));
        container.appendChild(list);
    }

    function formatNumber(value, digits = 1) {
        if (value == null || value === "" || !Number.isFinite(Number(value))) {
            return "—";
        }
        return new Intl.NumberFormat("pl-PL", {
            minimumFractionDigits: digits,
            maximumFractionDigits: digits,
        }).format(Number(value));
    }

    function addReportCards(container, title, items, className = "") {
        if (title) addReportText(container, "h3", title);
        if (!items.length) {
            addReportText(container, "p", "Brak danych.");
            return;
        }

        const grid = document.createElement("div");
        grid.className = `analysis-kpi-grid${className ? ` ${className}` : ""}`;
        items.forEach((item) => {
            const card = document.createElement("article");
            card.className = "analysis-kpi-card";
            addReportText(card, "span", item.label, "analysis-kpi-label");
            addReportText(card, "strong", item.value, "analysis-kpi-value");
            if (item.note) {
                addReportText(card, "span", item.note, "analysis-kpi-note");
            }
            grid.appendChild(card);
        });
        container.appendChild(grid);
    }

    function renderAnalysisReport(report) {
        const output = document.getElementById("analysisReportOutput");
        if (!output) return;
        const reportSection = document.getElementById("analysisReportSection");
        if (reportSection) reportSection.hidden = false;
        output.replaceChildren();
        output.hidden = false;

        const plot = report.plot || {};
        const crop = report.crop || {};
        const current = report.current_situation || {};
        const history = report.historical_drought_vulnerability || {};
        const risk = report.risk || {};
        const soil = current.soil_moisture || {};
        const terrain = current.terrain || {};
        const hydrology = current.hydrology || {};

        addReportText(output, "h2", "Raport analizy działki", "analysis-report-title");
        addReportText(
            output,
            "p",
            `Działka: ${plot.name || "bez nazwy"}  |  Uprawa: ${crop.name || "—"}  |  Data analizy: ${report.analysis_date || "—"}`,
            "analysis-report-subtitle",
        );
        addReportText(
            output,
            "p",
            `Współrzędne: ${formatNumber(plot.location?.latitude, 6)}; ${formatNumber(plot.location?.longitude, 6)}`,
            "analysis-report-coordinates",
        );
        const riskSummary = document.createElement("div");
        riskSummary.className = "analysis-risk-summary";
        const riskCard = document.createElement("article");
        riskCard.className = "analysis-kpi-card analysis-kpi-card-risk";
        addReportText(riskCard, "span", "Poziom ryzyka suszy", "analysis-kpi-label");
        addReportText(riskCard, "strong", risk.level || "brak danych", "analysis-kpi-value");
        addReportText(riskCard, "span", `Wynik algorytmu: ${risk.score ?? "—"}/100 punktów`, "analysis-kpi-note");
        riskSummary.appendChild(riskCard);
        output.appendChild(riskSummary);
        addReportList(output, "Co wpłynęło na ocenę", risk.components || []);

        const waterSection = document.createElement("section");
        waterSection.className = "analysis-report-section";
        addReportText(waterSection, "h3", `Sytuacja wodna · ${report.analysis_date || "wybrana data"}`);
        addReportText(
            waterSection,
            "p",
            `Suma miesięcznych niedoborów względem norm uprawy: ${formatNumber(current.deficit_total_mm)} mm.`,
        );
        addReportCards(
            waterSection,
            "Opady w analizowanym okresie",
            (current.monthly || []).map((item) => ({
                label: item.month_name,
                value: `${formatNumber(item.rainfall_mm)} mm opadu`,
                note: `Norma: ${item.crop_norm_mm == null ? "brak" : `${formatNumber(item.crop_norm_mm)} mm`} · Niedobór: ${item.deficit_mm == null ? "—" : `${formatNumber(item.deficit_mm)} mm`}`,
            })),
            "analysis-kpi-grid-monthly",
        );
        output.appendChild(waterSection);

        const soilSection = document.createElement("section");
        soilSection.className = "analysis-report-section";
        addReportText(soilSection, "h3", "Wilgotność gleby");
        if (soil.physical_profile?.classifications) {
            const classes = soil.physical_profile.classifications;
            addReportText(
                soilSection,
                "p",
                `Kompleks: ${classes.agricultural_complex || "—"}  |  Typ gleby: ${classes.soil_type || "—"}  |  Podłoże: ${classes.parent_material_1 || "—"}`,
            );
        }
        addReportCards(
            soilSection,
            "Wilgotność objętościowa (m³/m³)",
            Object.values(soil.depths || {}).map((depth) => ({
                label: depth.label,
                value: formatNumber(depth.latest_value, 3),
                note: `Typowo: ${formatNumber(depth.typical_value, 3)} · Odchylenie: ${formatNumber(depth.anomaly, 3)} m³/m³`,
            })),
        );
        if (!soil.available && !soil.physical_profile?.available) {
            addReportText(soilSection, "p", soil.physical_profile?.message || "Brak danych o wilgotności lub profilu gleby.");
        }
        output.appendChild(soilSection);

        const historySection = document.createElement("section");
        historySection.className = "analysis-report-section";
        addReportText(historySection, "h3", "Historyczna podatność na suszę");
        addReportText(
            historySection,
            "p",
            `Okres: ${history.period?.from || "—"} – ${history.period?.to || "—"}.`,
            "analysis-report-note",
        );
        addReportCards(
            historySection,
            "Podsumowanie okresu",
            [
                { label: "Miesiące poniżej normy", value: history.months_below_crop_norm ?? "—" },
                { label: "Średni deficyt w miesiącach z niedoborem", value: `${formatNumber(history.average_deficit_mm)} mm` },
                { label: "Największy niedobór", value: `${formatNumber(history.largest_deficit?.value_mm)} mm`, note: `${history.largest_deficit?.month_name || "—"} ${history.largest_deficit?.year || ""}` },
                { label: "Okresy suche", value: history.dry_period_count ?? "—" },
            ],
        );
        addReportCards(
            historySection,
            "Powtarzalność według miesięcy",
            Object.values(history.repeatability_by_month || {}).map((item) => ({
                label: item.name,
                value: `${Math.round(item.frequency * 100)}% lat`,
                note: `Niedobór w ${item.years_with_deficit}/${item.observed_years} lat · średnio ${formatNumber(item.average_deficit_mm)} mm`,
            })),
        );
        addReportCards(
            historySection,
            "Anomalia opadów w analizowanym roku",
            Object.values(history.rainfall_anomaly_by_month || {}).map((item) => ({
                label: item.name,
                value: `${formatNumber(item.anomaly_mm)} mm`,
                note: `W analizowanym roku: ${formatNumber(item.last_value_mm)} mm · Typowo: ${formatNumber(item.typical_rainfall_mm)} mm`,
            })),
        );
        output.appendChild(historySection);

        const environmentSection = document.createElement("section");
        environmentSection.className = "analysis-report-section";
        addReportText(environmentSection, "h3", "Ukształtowanie terenu i dostęp do wody");
        if (terrain.available) {
            addReportCards(
                environmentSection,
                "Ukształtowanie terenu",
                [
                    { label: "Wysokość n.p.m.", value: `${formatNumber(terrain.elevation_m)} m` },
                    { label: "Nachylenie", value: `${formatNumber(terrain.slope_percent)}%`, note: `${formatNumber(terrain.slope_degrees)}°` },
                    { label: "Kierunek stoku", value: terrain.aspect || "—" },
                    { label: "Ryzyko spływu", value: terrain.surface_runoff_risk || "—" },
                ],
            );
        } else {
            addReportText(environmentSection, "p", terrain.message || "Brak danych wysokościowych.");
        }
        if (hydrology.available) {
            addReportCards(
                environmentSection,
                "Najbliższe obiekty wodne",
                [
                    { label: "Zbiornik", value: hydrology.nearest_reservoir?.distance_m == null ? "Brak w promieniu" : `${formatNumber(hydrology.nearest_reservoir.distance_m)} m` },
                    { label: "Ciek wodny", value: hydrology.nearest_waterway?.distance_m == null ? "Brak w promieniu" : `${formatNumber(hydrology.nearest_waterway.distance_m)} m` },
                ],
            );
        } else {
            addReportText(environmentSection, "p", hydrology.message || "Brak danych o ciekach i zbiornikach.");
        }
        output.appendChild(environmentSection);

        addReportCards(
            output,
            "Prognoza pogody",
            (report.forecast_weather || []).map((item) => ({
                label: item.date || "Prognoza",
                value: item.temperature_mean == null ? "—" : `${formatNumber(item.temperature_mean)} °C`,
                note: `Średnia temperatura dobowa · Opad: ${formatNumber(item.rain_sum)} mm`,
            })),
            "analysis-kpi-grid-forecast",
        );
        if (report.forecast_note) {
            addReportText(output, "p", report.forecast_note, "analysis-report-note");
        }
        addReportList(
            output,
            "Rekomendacje",
            report.recommendations || [],
            (item) => `${item.action} — ${item.reason}`,
        );
        addReportList(
            output,
            "Źródła i ograniczenia",
            [
                ...(report.sources || []).map((item) => {
                    const ranges = [item.historical_range, item.current_range]
                        .filter(Boolean)
                        .map((range) => `${range.from}–${range.to}`)
                        .join(", ");
                    return `${item.name}${item.available === false ? " (niedostępne)" : ""}${ranges ? `; zakres: ${ranges}` : ""}${item.retrieved_at ? `; pobrano: ${item.retrieved_at}` : ""}${item.url ? `; ${item.url}` : ""}`;
                }),
                ...(report.limitations || []),
            ],
        );

        const descriptions = document.createElement("details");
        descriptions.className = "analysis-variable-descriptions";
        descriptions.open = true;
        addReportText(descriptions, "summary", "Opis zmiennych i wskaźników");
        const descriptionList = document.createElement("ul");
        [
            "Suma opadów (mm) — suma opadu zarejestrowanego w danym dniu lub miesiącu.",
            "Średnia temperatura dobowa (°C) — średnia z godzinowych wartości temperatury na wysokości 2 m; dla prognozy i raportu pokazana do 0,1°C.",
            "Wilgotność gleby (m³/m³) — objętościowa zawartość wody w warstwie 0–7 cm lub 7–28 cm; odchylenie porównuje wynik z typową wartością dla tego samego miesiąca.",
            "Typowy opad — średnia suma opadów z tego samego miesiąca w dostępnych latach historycznych; anomalia to opad z roku analizy minus ta średnia. Wartość ujemna oznacza opad niższy od typowego.",
            "Norma opadów — miesięczna wartość normy przypisana wybranej uprawie w bazie. „Brak normy” oznacza, że jej nie zdefiniowano.",
            "Niedobór opadów (mm) — dodatnia różnica między normą uprawy a sumą opadów; zero oznacza, że opad osiągnął normę.",
            "Częstość niedoborów — udział lat z opadem poniżej normy wśród lat, dla których są dane.",
            "Okres suchy — ciąg kolejnych miesięcy poniżej normy uprawy.",
            "Nachylenie (%) — szacowany spadek terenu; kierunek stoku opisuje jego ekspozycję. Dane są próbkowane wokół punktu działki.",
            "Odległość od wody — odległość do najbliższego zbiornika lub cieku z mapy OpenStreetMap; nie potwierdza możliwości ani prawa poboru wody.",
            "Ryzyko suszy (0–100) — punktowa ocena łącząca bieżący deficyt, historię powtarzalnych niedoborów, wilgotność gleby, retencję i ukształtowanie terenu; nie jest prawdopodobieństwem procentowym.",
        ].forEach((description) => addReportText(descriptionList, "li", description));
        descriptions.appendChild(descriptionList);
        output.appendChild(descriptions);
    }

    async function startAnalysis() {
        const parcel = state.ostatniKsztalt;
        const cropId = document.getElementById("analysisCropSelect")?.value;
        const analysisDate = document.getElementById("analysisDate")?.value;
        const pdfButton = document.getElementById("btnSaveAnalysisPdf");

        if (!parcel) {
            setAnalysisStatus("Najpierw wyszukaj działkę lub podaj jej współrzędne.", "error");
            return;
        }
        if (!cropId || !analysisDate) {
            setAnalysisStatus("Wybierz uprawę i datę, dla której chcesz sprawdzić warunki.", "error");
            return;
        }

        const button = document.getElementById("btnStartAnalysis");
        button.disabled = true;
        pdfButton.disabled = true;
        setAnalysisStatus("Pobieranie danych i przygotowywanie analizy…", "info");

        try {
            const params = new URLSearchParams({
                latitude: String(parcel.centroid.lat),
                longitude: String(parcel.centroid.lon),
                field_name: `${parcel.id} (${parcel.lokalizacja.obreb} ${parcel.lokalizacja.nr})`,
                analysis_date: analysisDate,
            });
            const response = await window.PerunAuth.authFetch(
                `/openmeteo/analysis/${encodeURIComponent(cropId)}?${params}`,
            );
            const report = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(report.detail || `Błąd analizy (${response.status})`);
            }

            state.lastAnalysisReport = report;
            renderAnalysisReport(report);
            pdfButton.disabled = false;
            setAnalysisStatus("Analiza gotowa. Raport możesz pobrać go jako PDF.", "ok");
        } catch (error) {
            state.lastAnalysisReport = null;
            setAnalysisStatus(error.message || "Nie udało się wykonać analizy.", "error");
        } finally {
            button.disabled = false;
        }
    }

    function saveAnalysisAsPdf() {
        const report = state.lastAnalysisReport;
        const output = document.getElementById("analysisReportOutput");
        if (!report || !output) return;

        const printWindow = window.open("", "_blank");
        if (!printWindow) {
            setAnalysisStatus("Przeglądarka zablokowała okno raportu. Zezwól na wyskakujące okna i spróbuj ponownie.", "error");
            return;
        }

        const title = `Raport Perun - ${report.plot?.name || "działka"}`;
        const escapePrintText = (value) => String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;");
        const printPlotName = escapePrintText(report.plot?.name || "bez nazwy");
        const printCropName = escapePrintText(report.crop?.name || "—");
        const printAnalysisDate = escapePrintText(report.analysis_date || "—");

        printWindow.document.open();
        printWindow.document.write(`<!doctype html>
            <html lang="pl"><head><meta charset="UTF-8">
            <title>${escapePrintText(title)}</title>
            <style>
                *{box-sizing:border-box}
                html,body{margin:0;padding:0}
                body{font:9.5pt/1.42 Arial,sans-serif;color:#1f2937;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
                .print-document{max-width:174mm;margin:0 auto}
                .print-header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12mm;padding:0 0 4mm;border-bottom:2pt solid #14532d}
                .print-brand{font-size:16pt;font-weight:800;letter-spacing:.08em;color:#14532d}
                .print-heading{margin:2mm 0 0;font-size:20pt;line-height:1.05;color:#14532d}
                .print-meta{text-align:right;color:#526071;font-size:8.5pt;line-height:1.5}
                .print-meta strong{display:block;color:#1f2937;font-size:9.5pt}
                .analysis-report-title{display:none}
                h3{margin:0 0 3mm;color:#14532d;font-size:12pt;break-after:avoid}
                p{margin:2mm 0 3mm;orphans:3;widows:3}
                ul{margin:2mm 0 3mm;padding-left:5mm}li{margin:1mm 0;orphans:3;widows:3}
                .analysis-report-subtitle{font-weight:bold}
                .analysis-report-coordinates,.analysis-report-note{color:#64748b;font-size:8.5pt}
                .analysis-report-section{margin:0 0 7mm;padding:5mm 0 0;border-top:.5pt solid #d1d5db}
                .analysis-risk-summary{margin:3mm 0 5mm}
                .analysis-kpi-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:3mm;margin:2mm 0 4mm}
                .analysis-kpi-grid-monthly{grid-template-columns:repeat(3,minmax(0,1fr))}
                .analysis-kpi-grid-forecast{grid-template-columns:repeat(4,minmax(0,1fr))}
                .analysis-kpi-card{display:flex;min-width:0;flex-direction:column;gap:1mm;padding:3mm;border:.5pt solid #d1d5db;border-radius:2mm;background:#fff;break-inside:avoid}
                .analysis-kpi-label{color:#526071;font-size:7.5pt}
                .analysis-kpi-value{color:#1f2937;font-size:10pt;font-weight:bold;overflow-wrap:anywhere}
                .analysis-kpi-note{color:#15803d;font-size:7.5pt}
                .analysis-kpi-card-risk{border:.75pt solid #86efac;background:#f0fdf4}
                .analysis-kpi-card-risk .analysis-kpi-value{color:#166534;text-transform:capitalize}
                .analysis-variable-descriptions{margin-top:6mm;padding:3mm 4mm;background:#f8fafc;border:.5pt solid #dbe3ec;break-before:page}
                .analysis-variable-descriptions summary{font-weight:bold;color:#14532d}
                @media print{
                    @page{size:A4 portrait;margin:12mm 14mm 14mm}
                    .analysis-report-section{break-inside:auto}
                    .analysis-kpi-card,.analysis-risk-summary{break-inside:avoid}
                }
            </style></head>
            <body>
                <main class="print-document">
                    <header class="print-header">
                        <div>
                            <div class="print-brand">PERUN</div>
                            <h1 class="print-heading">Raport analizy działki</h1>
                        </div>
                        <div class="print-meta">
                            <strong>${printPlotName}</strong>
                            Uprawa: ${printCropName}<br>
                            Data analizy: ${printAnalysisDate}
                        </div>
                    </header>
                    <article class="analysis-report">${output.innerHTML}</article>
                </main>
            </body></html>`);
        printWindow.document.close();
        printWindow.focus();
        window.setTimeout(() => printWindow.print(), 250);
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
    async function zapiszDzialkeDlaUzytkownika() {
        const session = window.PerunAuth?.getSession?.();
        if (!session) {
            window.location.href = "login.html?redirect=wyszukiwarka.html";
            return;
        }

        if (!state.ostatniKsztalt) {
            pokazStatus("Najpierw wyszukaj działkę.", "error");
            return;
        }

        const payload = {
            name: `${state.ostatniKsztalt.id} (${state.ostatniKsztalt.lokalizacja.obreb} ${state.ostatniKsztalt.lokalizacja.nr})`,
            x: state.ostatniKsztalt.centroid.lon,
            y: state.ostatniKsztalt.centroid.lat,
            points: state.ostatniKsztalt.punktyZnormalizowane,
        };

        try {
            let res = await window.PerunAuth.authFetch("/field", {
                method: "POST",
                body: JSON.stringify(payload),
            });

            if (res.status === 404 || res.status === 405) {
                res = await window.PerunAuth.authFetch("/field/", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
            }

            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(
                    data.detail || data.msg || `Błąd zapisu (${res.status})`,
                );
            }

            pokazStatus(
                `Zapisano działkę "${payload.name}" w bazie (tabela Fields). Otwórz „Moje działki”, aby ją podejrzeć.`,
                "ok",
            );
        } catch (err) {
            pokazStatus(
                `Nie udało się zapisać działki: ${err.message}`,
                "error",
            );
        }
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
            .getElementById("btnSaveUserParcel")
            ?.addEventListener("click", zapiszDzialkeDlaUzytkownika);

        document
            .getElementById("btnStartAnalysis")
            ?.addEventListener("click", startAnalysis);

        document
            .getElementById("btnSaveAnalysisPdf")
            ?.addEventListener("click", saveAnalysisAsPdf);

        document
            .getElementById("btnAddWatchedParcel")
            ?.addEventListener("click", dodajDoObserwowanychStub);
    }

    function init() {
        inicjalizujSlotAdministratora();
        bindEvents();
        loadAnalysisCrops();

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
