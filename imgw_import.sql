-- Uruchamiany automatycznie przez usluge imgw_import z docker-compose.yml.
-- Uwaga: pliki CSV sa dostepne w kontenerze pod /data/.
\set ON_ERROR_STOP on
\echo 'IMGW: przygotowanie tabel...'

BEGIN;
CREATE TABLE IF NOT EXISTS public.stations (
    station_id VARCHAR(30) PRIMARY KEY,
    station_name TEXT,
    imgw_map_code VARCHAR(20),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    elevation_m DOUBLE PRECISION,
    coordinate_source TEXT
);
CREATE TABLE IF NOT EXISTS public.precipitation_daily (
    station_id VARCHAR(30) NOT NULL REFERENCES public.stations(station_id),
    observation_date DATE NOT NULL,
    precipitation_mm DOUBLE PRECISION,
    quality_code VARCHAR(20),
    PRIMARY KEY (station_id, observation_date)
);
CREATE INDEX IF NOT EXISTS idx_precipitation_daily_date
    ON public.precipitation_daily (observation_date);

CREATE TEMP TABLE stage_stations (
    station_id TEXT,
    station_name TEXT,
    imgw_map_code TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    elevation_m DOUBLE PRECISION,
    coordinate_source TEXT
) ON COMMIT DROP;
\echo 'IMGW: wczytywanie stations.csv...'
\copy stage_stations (station_id, station_name, imgw_map_code, latitude, longitude, elevation_m, coordinate_source) FROM '/data/stations.csv' WITH (FORMAT csv, HEADER true, NULL '')

INSERT INTO public.stations (station_id, station_name, imgw_map_code, latitude, longitude, elevation_m, coordinate_source)
SELECT station_id, station_name, imgw_map_code, latitude, longitude, elevation_m, coordinate_source
FROM stage_stations
ON CONFLICT (station_id) DO UPDATE SET
    station_name = EXCLUDED.station_name,
    imgw_map_code = EXCLUDED.imgw_map_code,
    latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude,
    elevation_m = EXCLUDED.elevation_m,
    coordinate_source = EXCLUDED.coordinate_source
WHERE (stations.station_name, stations.imgw_map_code, stations.latitude,
       stations.longitude, stations.elevation_m, stations.coordinate_source)
  IS DISTINCT FROM
      (EXCLUDED.station_name, EXCLUDED.imgw_map_code, EXCLUDED.latitude,
       EXCLUDED.longitude, EXCLUDED.elevation_m, EXCLUDED.coordinate_source);

CREATE TEMP TABLE stage_precipitation (
    station_id TEXT,
    observation_date DATE,
    precipitation_mm DOUBLE PRECISION,
    quality_code TEXT
) ON COMMIT DROP;
\echo 'IMGW: wczytywanie precipitation_daily.csv...'
\copy stage_precipitation (station_id, observation_date, precipitation_mm, quality_code) FROM '/data/precipitation_daily.csv' WITH (FORMAT csv, HEADER true, NULL '')

INSERT INTO public.precipitation_daily (station_id, observation_date, precipitation_mm, quality_code)
SELECT station_id, observation_date, precipitation_mm, quality_code
FROM stage_precipitation
ON CONFLICT (station_id, observation_date) DO UPDATE SET
    precipitation_mm = EXCLUDED.precipitation_mm,
    quality_code = EXCLUDED.quality_code
WHERE (precipitation_daily.precipitation_mm, precipitation_daily.quality_code)
  IS DISTINCT FROM (EXCLUDED.precipitation_mm, EXCLUDED.quality_code);
COMMIT;

\echo 'IMGW: gotowe. Liczba rekordow:'
SELECT (SELECT COUNT(*) FROM public.stations) AS stations,
       (SELECT COUNT(*) FROM public.precipitation_daily) AS precipitation_daily;
