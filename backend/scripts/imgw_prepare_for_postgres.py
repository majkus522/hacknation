#!/usr/bin/env python3
"""IMGW opady dobowe 2010-2026: ZIP -> dwa CSV do PostgreSQL.

Źródła:
  * ZIP z dobowe/opad (rekordy bez nagłówka, 16 pól NSP,POST,ROK,...)
  * wykaz_stacji.csv (NSP,nazwa,kod_mapy, kodowanie CP1250)
  * OPCJONALNIE imgw_station_coordinates_approx.csv (współrzędne
    przybliżone z mapy IMGW; pochodzenie zachowane w wyniku)

Przykłady:
  python scripts/imgw_prepare_for_postgres.py --limit 2
  python scripts/imgw_prepare_for_postgres.py
  python scripts/imgw_prepare_for_postgres.py --input data/imgw/raw \
      --stations data/imgw/meta/wykaz_stacji.csv \
      --coordinates data/imgw/meta/imgw_station_coordinates_approx.csv \
      --output data/imgw/processed

Dostępne pliki wynikowe (UTF-8):
  stations.csv, precipitation_daily.csv, conflicts.csv,
  invalid_rows.csv, missing_coordinates.csv, station_name_variants.csv,
  report.json.

Brak pomiaru WSMDB=8 oraz brak zjawiska WSMDB=9 są zapisywane jako
pusta precipitation_mm, NIE jako zero. Zachowany jest kod jakości WSMDB.
Do interpolacji wybieraj pomiary z precipitation_mm IS NOT NULL oraz
zweryfikowanymi współrzędnymi. Dane mapowe są tylko orientacyjne.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import sqlite3
import zipfile
from collections import Counter
from contextlib import closing
from datetime import date
from pathlib import Path


START_YEAR = 2010
END_YEAR = 2026


def load_station_register(path: Path) -> tuple[dict[str, tuple[str, str]], int]:
    """Odczytuje NSP -> (nazwa, 3–5-znakowy kod z mapy); naprawia 1 uszkodzony wiersz."""
    result: dict[str, tuple[str, str]] = {}
    repaired = 0
    with path.open("r", encoding="cp1250", newline="") as file:
        for line_number, row in enumerate(csv.reader(file), start=1):
            if len(row) >= 3:
                station_id, name, map_code = row[:3]
            elif len(row) == 2:
                # Znany przypadek w wykazie IMGW: GOŁYMIN-OŚRODEK,93668"
                match = re.fullmatch(r'(.*?),"?(\d{4,5})"?\s*', row[1].strip())
                if match is None:
                    raise ValueError(
                        f"Nierozpoznany wiersz wykazu {path}:{line_number}: {row!r}"
                    )
                station_id, name, map_code = row[0], match.group(1), match.group(2)
                repaired += 1
            else:
                raise ValueError(f"Niekompletny wiersz wykazu {line_number}: {row!r}")

            station_id, name, map_code = (
                station_id.strip(), name.strip().strip('"'), map_code.strip()
            )
            if not re.fullmatch(r"\d{9}", station_id):
                raise ValueError(f"Nieprawidłowy NSP w wykazie, linia {line_number}")
            if not re.fullmatch(r"\d{3,5}", map_code):
                raise ValueError(f"Nieprawidłowy kod mapy w wykazie, linia {line_number}")
            result[station_id] = (name, map_code)
    return result, repaired


def load_coordinates(path: Path | None) -> dict[str, tuple[str, str, str]]:
    """Wczytuje przybliżone pozycje według kodu 5-znakowego."""
    if path is None:
        return {}
    result = {}
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            code = row["map_code"].strip()
            lat, lon = row["latitude"].strip(), row["longitude"].strip()
            if not (49 <= float(lat) <= 55 and 14 <= float(lon) <= 25):
                raise ValueError(f"Pozycja poza obszarem Polski: {code} / {lat}, {lon}")
            result[code] = (
                lat, lon, row.get("coordinate_source", "IMGW_MAP_PDF_APPROX").strip()
            )
    return result


def init_work_db(db: sqlite3.Connection) -> None:
    db.execute("PRAGMA synchronous=NORMAL")
    db.execute("PRAGMA journal_mode=DELETE")
    db.executescript("""
        CREATE TABLE observations (
            station_id TEXT NOT NULL,
            observation_date TEXT NOT NULL,
            precipitation_mm REAL,
            quality_code TEXT NOT NULL,
            source_archive TEXT NOT NULL,
            PRIMARY KEY (station_id, observation_date)
        );
        CREATE TABLE observed_stations (
            station_id TEXT PRIMARY KEY,
            source_station_name TEXT NOT NULL
        );
    """)


def parse_row(row: list[str], start_year: int, end_year: int):
    """Zwraca 4 użyteczne pola; None oznacza pominięcie roku."""
    if len(row) < 7:
        raise ValueError(f"Wiersz ma {len(row)} kolumn (minimum: 7)")

    station_id = row[0].strip()
    if not re.fullmatch(r"\d{9}", station_id):
        raise ValueError(f"Nieprawidłowy NSP: {station_id!r}")

    try:
        year, month, day = (int(value.strip()) for value in row[2:5])
    except ValueError as exc:
        raise ValueError("Niepoprawny rok, miesiąc lub dzień") from exc
    if not (start_year <= year <= end_year):
        return None
    try:
        observed_on = date(year, month, day).isoformat()
    except ValueError as exc:
        raise ValueError(f"Niewłaściwa data: {year}-{month}-{day}") from exc

    raw_value = row[5].strip()
    status = row[6].strip()
    if status in {"8", "9"} or raw_value in {"", "-999", "-999.0"}:
        precipitation = None
    else:
        try:
            precipitation = float(raw_value)
        except ValueError as exc:
            raise ValueError(f"Nieprawidłowa suma opadu: {raw_value!r}") from exc
        if not (0 <= precipitation <= 2000):
            raise ValueError(f"Podejrzana wartość opadu [mm]: {precipitation}")

    return station_id, row[1].strip(), observed_on, precipitation, status


def archive_year(path: Path) -> int | None:
    """Umożliwia szybkie pominięcie starych plików bez otwierania ZIP."""
    match = re.match(r"^(\d{4})(?:_|\.)", path.name)
    return int(match.group(1)) if match else None


def csv_export(db: sqlite3.Connection, path: Path, header: list[str], query: str) -> None:
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(header)
        cursor = db.execute(query)
        while rows := cursor.fetchmany(10_000):
            writer.writerows(rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Przygotowuje dane IMGW z ZIP do PostgreSQL, bez zapisu do bazy."
    )
    parser.add_argument("--input", type=Path, default=Path("data/imgw/raw"))
    parser.add_argument("--output", type=Path, default=Path("data/imgw/processed"))
    parser.add_argument(
        "--stations", type=Path, default=Path("data/imgw/meta/wykaz_stacji.csv")
    )
    parser.add_argument(
        "--coordinates", type=Path,
        default=Path("data/imgw/meta/imgw_station_coordinates_approx.csv"),
        help="Opcjonalny wykaz przybliżonych współrzędnych z mapy IMGW",
    )
    parser.add_argument("--start-year", type=int, default=START_YEAR)
    parser.add_argument("--end-year", type=int, default=END_YEAR)
    parser.add_argument("--limit", type=int, help="Liczba archiwów do próbnego przetworzenia")
    args = parser.parse_args()

    if args.start_year > args.end_year:
        parser.error("--start-year nie może być większy od --end-year")
    if not args.stations.is_file():
        parser.error(f"Brak wykazu stacji: {args.stations}")
    if args.coordinates is not None and not args.coordinates.is_file():
        print(f"UWAGA: brak pliku {args.coordinates}; współrzędne zostaną puste.")
        args.coordinates = None
    if not args.input.is_dir():
        parser.error(f"Brak katalogu ZIP: {args.input}")

    archives = sorted(
        path for path in args.input.rglob("*.zip")
        if archive_year(path) is None
        or args.start_year <= archive_year(path) <= args.end_year
    )
    if args.limit is not None:
        archives = archives[: args.limit]
    if not archives:
        parser.error("Nie znaleziono archiwów ZIP w wybranym okresie")

    register, repaired = load_station_register(args.stations)
    positions = load_coordinates(args.coordinates)
    args.output.mkdir(parents=True, exist_ok=True)

    # Tylko plik roboczy tworzony przez TEN skrypt; żadnych operacji na PostgreSQL.
    db_path = args.output / "imgw_working.sqlite"
    if db_path.exists():
        db_path.unlink()

    stats = Counter()
    name_variants = set()

    with closing(sqlite3.connect(db_path)) as db, (
        (args.output / "invalid_rows.csv").open("w", encoding="utf-8", newline="")
    ) as invalid_file, (
        (args.output / "conflicts.csv").open("w", encoding="utf-8", newline="")
    ) as conflicts_file:
        init_work_db(db)
        errors_writer = csv.writer(invalid_file)
        conflicts_writer = csv.writer(conflicts_file)
        errors_writer.writerow(["source_archive", "source_csv", "line", "reason", "raw_preview"])
        conflicts_writer.writerow([
            "station_id", "observation_date", "first_mm", "other_mm",
            "first_quality", "other_quality", "first_source", "other_source"
        ])

        for i, archive_path in enumerate(archives, start=1):
            print(f"[{i}/{len(archives)}] {archive_path}", flush=True)
            try:
                with zipfile.ZipFile(archive_path) as archive:
                    members = sorted(
                        name for name in archive.namelist()
                        if name.lower().endswith(".csv") and not name.startswith("__MACOSX/")
                    )
                    if not members:
                        stats["archives_without_csv"] += 1
                    for member in members:
                        with archive.open(member) as raw:
                            lines = io.TextIOWrapper(
                                raw, encoding="cp1250", errors="replace", newline=""
                            )
                            for line_number, row in enumerate(csv.reader(lines), start=1):
                                if not row or not any(cell.strip() for cell in row):
                                    continue
                                try:
                                    result = parse_row(row, args.start_year, args.end_year)
                                except ValueError as exc:
                                    stats["invalid_rows"] += 1
                                    errors_writer.writerow([
                                        str(archive_path), member, line_number,
                                        str(exc), repr(row[:8])[:350]
                                    ])
                                    continue
                                if result is None:
                                    stats["outside_period"] += 1
                                    continue
                                station_id, source_name, observed_on, mm, quality = result
                                stats["records_parsed"] += 1
                                if quality == "8": stats["status_8_missing"] += 1
                                if quality == "9": stats["status_9_no_phenomenon"] += 1
                                if mm is None: stats["precipitation_null"] += 1

                                known_name = register.get(station_id, (source_name, ""))[0]
                                if known_name and source_name and known_name != source_name:
                                    name_variants.add((station_id, known_name, source_name))
                                db.execute(
                                    "INSERT OR IGNORE INTO observed_stations VALUES (?, ?)",
                                    (station_id, source_name or known_name),
                                )
                                cur = db.execute(
                                    "INSERT OR IGNORE INTO observations VALUES (?, ?, ?, ?, ?)",
                                    (station_id, observed_on, mm, quality, archive_path.name),
                                )
                                if cur.rowcount == 1:
                                    stats["records_unique"] += 1
                                    continue
                                prev = db.execute(
                                    "SELECT precipitation_mm, quality_code, source_archive "
                                    "FROM observations WHERE station_id=? AND observation_date=?",
                                    (station_id, observed_on),
                                ).fetchone()
                                if prev is not None and prev[:2] == (mm, quality):
                                    stats["duplicates_identical"] += 1
                                else:
                                    stats["conflicts"] += 1
                                    conflicts_writer.writerow([
                                        station_id, observed_on, prev[0] if prev else "",
                                        mm, prev[1] if prev else "", quality,
                                        prev[2] if prev else "", archive_path.name,
                                    ])
            except (OSError, zipfile.BadZipFile, RuntimeError) as exc:
                stats["archives_failed"] += 1
                errors_writer.writerow([str(archive_path), "", "", f"ZIP: {exc}", ""])
            db.commit()
            stats["archives_scanned"] += 1

        stations_path = args.output / "stations.csv"
        no_coords_path = args.output / "missing_coordinates.csv"
        with stations_path.open("w", encoding="utf-8", newline="") as stations_file, (
            no_coords_path.open("w", encoding="utf-8", newline="")
        ) as missing_file:
            station_writer = csv.writer(stations_file)
            missing_writer = csv.writer(missing_file)
            station_writer.writerow([
                "station_id", "station_name", "imgw_map_code", "latitude", "longitude",
                "elevation_m", "coordinate_source"
            ])
            missing_writer.writerow(["station_id", "station_name", "imgw_map_code", "reason"])

            for station_id, source_name in db.execute(
                "SELECT station_id, source_station_name FROM observed_stations ORDER BY station_id"
            ):
                station_name, map_code = register.get(station_id, (source_name, ""))
                if station_id not in register:
                    stats["stations_not_in_registry"] += 1
                if map_code in positions:
                    lat, lon, source = positions[map_code]
                    stats["stations_with_approx_coordinates"] += 1
                else:
                    lat, lon, source = "", "", ""
                    stats["stations_without_coordinates"] += 1
                    reason = (
                        "no_station_register_match" if not map_code
                        else "not_found_or_invalid_in_pdf_map"
                    )
                    missing_writer.writerow([station_id, station_name, map_code, reason])
                station_writer.writerow([
                    station_id, station_name, map_code, lat, lon, "", source
                ])
                stats["stations_total"] += 1

        csv_export(
            db, args.output / "precipitation_daily.csv",
            ["station_id", "observation_date", "precipitation_mm", "quality_code"],
            "SELECT station_id, observation_date, precipitation_mm, quality_code "
            "FROM observations ORDER BY station_id, observation_date",
        )
        with (args.output / "station_name_variants.csv").open(
            "w", encoding="utf-8", newline=""
        ) as file:
            writer = csv.writer(file)
            writer.writerow(["station_id", "station_register_name", "source_measurement_name"])
            writer.writerows(sorted(name_variants))

    stats["station_register_rows"] = len(register)
    stats["station_register_repaired_lines"] = repaired
    stats["station_name_variants"] = len(name_variants)
    report = {
        "range": [args.start_year, args.end_year],
        "source": "IMGW dobowe/opad",
        "coordinates_note": (
            "Współrzędne z mapy PDF są orientacyjne, nieoficjalne jako dokładne "
            "metadane lokalizacji i mogą nie odpowiadać wszystkim zmianom położenia."
        ),
        "quality_note": "WSMDB 8 i 9 -> brak wartości mm (NULL), kody zachowane",
        "stats": dict(stats),
    }
    (args.output / "report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    db_path.unlink(missing_ok=True)
    print("\nZAKOŃCZONO:")
    for name, value in sorted(stats.items()):
        print(f"  {name}: {value}")
    print(f"CSV i raport: {args.output.resolve()}")
    print("UWAGA: coordinates_source=IMGW_MAP_PDF_APPROX oznacza pozycję orientacyjną.")


if __name__ == "__main__":
    main()
