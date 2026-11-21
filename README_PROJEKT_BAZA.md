# Hacknation — pliki projektu i baza danych

Ten dokument wyjaśnia **prostym językiem**, za co odpowiadają poszczególne pliki i co przechowują tabele PostgreSQL. Jest przeznaczony dla osoby, która dopiero poznaje projekt.

## 1. O co chodzi w projekcie?

Aplikacja łączy informacje o **użytkownikach i polach uprawnych** z **danymi pogodowymi**. W szczególności przechowuje historyczne dobowe opady atmosferyczne z IMGW (lata **2010–2026**, w zależności od dostępności danych).

Najprościej:

1. **IMGW** dostarcza pomiary deszczu ze stacji pomiarowych.
2. **Python** porządkuje pobrane pliki.
3. **PostgreSQL** przechowuje dane w tabelach.
4. **FastAPI** udostępnia informacje pozostałym częściom aplikacji.
5. W przyszłości dane ze stacji będzie można wykorzystać do **interpolacji**, czyli oszacowania opadu w miejscu, gdzie nie ma stacji.

**Uwaga:** IMGW mierzy opady w konkretnych lokalizacjach. Samo zapisanie danych do bazy **nie oznacza**, że aplikacja potrafi już obliczyć opad dla dowolnego punktu Polski.

## 2. Trzy rzeczy, których nie należy mylić

- **Plik CSV** — zwykły plik z wierszami danych (podobny do arkusza kalkulacyjnego).
- **Tabela PostgreSQL** — miejsce przechowywania danych w działającej bazie.
- **Plik Python** — kod, który uruchamia aplikację albo przetwarza dane.

Przykład: `stations.csv` jest plikiem na dysku, natomiast `stations` jest tabelą w PostgreSQL. To dwa różne miejsca zawierające odpowiadające sobie informacje.

## 3. Struktura katalogów

Poniższe drzewo pokazuje **pliki ważne dla obecnej integracji**. Część istniejących modułów aplikacji została opisana na podstawie ich nazw — nie otrzymałem zawartości wszystkich plików `auth`, `field` i `database.py`.

```text
hacknation/
├── docker-compose.yml                   # Uruchamia kontenery
├── init.sql                             # Tworzy bazowe tabele w nowej bazie
├── imgw_import.sql                      # Importuje dane IMGW z CSV
│
└── backend/
    ├── Dockerfile                       # Przepis na kontener backendu
    ├── main.py                          # Uruchamia FastAPI i rejestruje trasy
    ├── database.py                      # Konfiguracja dostępu do bazy (*)
    ├── models/
    │   └── imgw.py                      # Opis tabel IMGW w SQLAlchemy
    ├── schemas/
    │   └── imgw.py                      # Format odpowiedzi IMGW w Pydantic
    ├── routes/
    │   ├── imgw.py                      # Zapytania API dotyczące IMGW
    │   ├── auth.py                      # Trasy logowania/użytkowników (*)
    │   └── field.py                     # Trasy dotyczące pól (*)
    ├── api/
    │   └── openmeteo.py                 # Obsługa danych Open-Meteo
    └── scripts/
        ├── imgw_prepare_for_postgres.py # Zamienia ZIP-y IMGW na gotowe CSV
        └── data/imgw/
            ├── raw/                     # Pobrane archiwa ZIP
            ├── meta/                    # Wykazy i współrzędne stacji
            └── processed/               # Gotowe CSV i raporty
                ├── stations.csv
                ├── precipitation_daily.csv
                ├── missing_coordinates.csv
                ├── invalid_rows.csv
                ├── conflicts.csv
                ├── station_name_variants.csv
                └── report.json
```

(*) Szczegóły tych plików wymagają sprawdzenia w aktualnym repozytorium. Jeśli skrypt przygotowujący dane leży w innym miejscu, użyj jego rzeczywistej ścieżki. **Ścieżka do gotowych CSV w przekazanym `docker-compose.yml` to** `backend/scripts/data/imgw/processed/`.

## 4. Co robi każdy główny plik?

| Plik | Proste wyjaśnienie |
|---|---|
| `docker-compose.yml` | „Kierownik”: mówi Dockerowi, jakie usługi uruchomić i w jakiej kolejności. |
| `init.sql` | „Plan budowy”: tworzy tabele i przykładowe rekordy, gdy PostgreSQL ma **pusty katalog danych**. |
| `imgw_import.sql` | „Dostawca”: czyta przygotowane CSV i wpisuje stacje oraz opady do PostgreSQL. |
| `backend/Dockerfile` | Instrukcja budowania środowiska Python dla backendu. |
| `backend/main.py` | Główny plik FastAPI — rejestruje adresy API. |
| `backend/database.py` | Plik związany z połączeniem z bazą — szczegółowej zawartości nie zweryfikowano. |
| `backend/models/imgw.py` | Modele SQLAlchemy dla tabel `stations` i `precipitation_daily`. |
| `backend/schemas/imgw.py` | Schematy Pydantic: określają, jak wyglądają odpowiedzi z API IMGW. |
| `backend/routes/imgw.py` | Endpointy pobierające stacje i pomiary z PostgreSQL. |
| `backend/api/openmeteo.py` | Kod komunikacji z zewnętrznym serwisem pogodowym Open-Meteo; **nie** importuje archiwum IMGW. |
| `backend/scripts/imgw_prepare_for_postgres.py` | Przechodzi przez pobrane ZIP-y IMGW i wytwarza czyste CSV oraz raporty. |

**Różnica `models` / `schemas` / `routes`:**

- **Model** opisuje **tabelę w bazie** (np. kolumny, klucz główny).
- **Schema** opisuje **dane wysyłane przez API** (np. pola w JSON).
- **Route** opisuje **adres i działanie API** (np. pobranie listy stacji).

## 5. Co znajduje się w folderach IMGW?

### Dane wejściowe (`raw/` i `meta/`)

| Plik | Zawartość |
|---|---|
| `raw/.../*.zip` | Oryginalne pobrane paczki IMGW zawierające pomiary opadów z poszczególnych lat i miesięcy. Nie trzeba ich ręcznie rozpakowywać. |
| `meta/wykaz_stacji.csv` | Oficjalny wykaz kodów i nazw stacji IMGW. |
| `meta/imgw_station_coordinates_approx.csv` | **Orientacyjne** współrzędne geograficzne wyodrębnione z mapy IMGW. |
| `o_d_nagłówek.csv` | Nazwy 16 kolumn źródłowych plików opadowych, np. `ROK`, `MC`, `DZ`, `SMDB`, `WSMDB`. To plik pomocniczy — nie jest importowany jako tabela. |
| `Opis.txt` | Informacje IMGW o strukturze archiwum i znaczeniu kodów. |
| `UWAGA!.txt` | Ostrzeżenia o zmianach formatu i zapisie brakujących wartości. |
| `lista_zmian.txt` | Historia poprawek w archiwum IMGW. |
| `mapa_zawartosci_opad.pdf` | Mapa/tabela lokalizacji i dostępności danych stacji; podane współrzędne mogą być przybliżone. |

Pliki `Opis.txt`, `UWAGA!.txt`, `lista_zmian.txt`, `o_d_nagłówek.csv` i PDF są **dokumentacją źródła danych**. Nie są osobnymi tabelami PostgreSQL.

### Dane wynikowe (`processed/`)

| Plik | Co zawiera? | Czy jest importowany do bazy? |
|---|---|---|
| `stations.csv` | Lista stacji: ID, nazwa i lokalizacja. | **Tak**, do `stations`. |
| `precipitation_daily.csv` | Dobowe pomiary opadów przypisane do stacji. | **Tak**, do `precipitation_daily`. |
| `missing_coordinates.csv` | Stacje, którym nie udało się przypisać współrzędnych. | Nie — raport. |
| `invalid_rows.csv` | Wiersze źródłowe, których nie można poprawnie przetworzyć. | Nie — raport. |
| `conflicts.csv` | Sprzeczne dane dla tej samej stacji i daty, jeżeli wystąpiły. | Nie — raport. |
| `station_name_variants.csv` | Różnice w nazwach stacji pomiędzy plikami. | Nie — raport. |
| `report.json` | Liczniki podsumowujące przetwarzanie. | Nie — raport. |

**Nie usuwaj oryginalnych plików ZIP** — pozwolą odtworzyć dane po poprawieniu skryptu.

## 6. Wszystkie tabele PostgreSQL

W przesłanym `init.sql` znajduje się **8 tabel**: sześć dotyczących użytkowników i pól oraz dwie nowe dotyczące IMGW.

### Szybki przegląd

| Tabela | Do czego służy? |
|---|---|
| `users` | Przechowuje konta użytkowników. |
| `soiltypes` | Przechowuje rodzaje gleby. |
| `fields` | Przechowuje informacje o polach uprawnych. |
| `userfields` | Łączy użytkowników z polami. |
| `sensortypes` | Przechowuje rodzaje czujników. |
| `sensors` | Przechowuje czujniki powiązane z polami. |
| `stations` | Przechowuje stacje pomiarowe IMGW. |
| `precipitation_daily` | Przechowuje dobowe opady z tych stacji. |

PostgreSQL zapisuje nazwy nieujęte w cudzysłów małymi literami. Dlatego tabela zadeklarowana jako `CREATE TABLE Users` ma w bazie nazwę `users`.

### `users` — konta użytkowników

Jedna linia = jedno konto.

| Kolumna | Znaczenie |
|---|---|
| `userid` | Numer użytkownika; automatycznie nadawany. |
| `username` | Nazwa użytkownika; musi być unikalna. |
| `email` | Adres e-mail; musi być unikalny. |
| `password` | Hasło zapisane w bazie (w danych przykładowych: hash). |
| `fieldadmin` | Informacja logiczna `true`/`false` o uprawnieniu `fieldAdmin`; domyślnie `false`. |

### `soiltypes` — rodzaje gleby

To słownik: zamiast wielokrotnie wpisywać nazwę gleby, tabela pól wskazuje jej numer.

| Kolumna | Znaczenie |
|---|---|
| `id` | Numer rodzaju gleby. |
| `name` | Nazwa, np. „Gleba brunatna”; musi być unikalna. |

### `fields` — pola uprawne

Jedna linia = jedno pole zapisane w aplikacji.

| Kolumna | Znaczenie |
|---|---|
| `fieldid` | Numer pola. |
| `name` | Nazwa pola. |
| `size` | Wielkość pola (jednostka nie jest określona w `init.sql`). |
| `soiltype` | Numer rodzaju gleby, połączony z `soiltypes.id`. |

**Ważne:** ta tabela w obecnym `init.sql` nie zawiera współrzędnych ani granic pola.

### `userfields` — które pole należy do którego użytkownika?

To tabela łącząca. Pozwala powiązać użytkowników z polami.

| Kolumna | Znaczenie |
|---|---|
| `id` | Numer powiązania. |
| `userid` | Numer użytkownika z `users`. |
| `fieldid` | Numer pola z `fields`. |

Przykład: użytkownik nr 3 może być powiązany z polem nr 7. Nie trzeba kopiować całych danych użytkownika ani pola.

### `sensortypes` — dostępne rodzaje czujników

| Kolumna | Znaczenie |
|---|---|
| `id` | Numer rodzaju czujnika. |
| `name` | Nazwa, np. „Czujnik wilgoci” albo „Termometr”. |

### `sensors` — czujniki przypisane do pól

| Kolumna | Znaczenie |
|---|---|
| `sensorid` | Numer czujnika. |
| `fieldid` | Numer pola, przy którym zapisano czujnik. |
| `typeid` | Rodzaj czujnika z tabeli `sensortypes`. |
| `value` | Wartość zapisana dla czujnika. Jednostka i czas pomiaru nie są określone w `init.sql`. |

### `stations` — stacje IMGW

Jedna linia = jedna stacja pomiarowa rozpoznawana po `station_id`.

| Kolumna | Znaczenie |
|---|---|
| `station_id` | Unikalny identyfikator stacji. |
| `station_name` | Nazwa stacji. |
| `imgw_map_code` | Kod pomagający dopasować stację do mapy IMGW. |
| `latitude` | Szerokość geograficzna (północ–południe). |
| `longitude` | Długość geograficzna (wschód–zachód). |
| `elevation_m` | Wysokość nad poziomem morza w metrach; może być pusta. |
| `coordinate_source` | Informacja, skąd pochodzą współrzędne (np. `IMGW_MAP_PDF_APPROX`). |

**Ważne:** współrzędne z mapy są **orientacyjne**. Przed dokładną interpolacją warto sprawdzić położenia stacji i ich historyczne przeniesienia.

### `precipitation_daily` — dobowe opady IMGW

Jedna linia = wpis o opadach dla **jednej stacji i jednego dnia**.

| Kolumna | Znaczenie |
|---|---|
| `station_id` | ID stacji; łączy pomiar z tabelą `stations`. |
| `observation_date` | Data pomiaru. |
| `precipitation_mm` | Dobowa suma opadu w milimetrach; może być pusta. |
| `quality_code` | Kod statusu z IMGW; pomaga odróżnić pomiar od braku danych. |

Dla tej tabeli **klucz główny jest złożony**: `station_id` + `observation_date`. Oznacza to, że w bazie nie można dwa razy zapisać wpisu tej samej stacji dla tego samego dnia.

### Co znaczą statusy opadów?

| Wartość | Znaczenie |
|---|---|
| `precipitation_mm = 0` | Zapisano liczbowo **zero milimetrów**. |
| `quality_code = 8` | **Brak pomiaru** — nie znamy wartości. |
| `quality_code = 9` | **Brak zjawiska opadowego** według oznaczenia IMGW. |
| Puste `precipitation_mm` | Brak liczby; trzeba sprawdzić kod statusu. |

**Brak pomiaru nie oznacza zera.** Tego rozróżnienia trzeba pilnować przy analizach i przyszłej interpolacji.

## 7. Jak tabele są ze sobą połączone?

```text
users ───────────┐
                 ├── userfields ─── fields ─── soiltypes
fields ──────────┘                     │
                                      └── sensors ─── sensortypes


stations ─────── precipitation_daily
       (jedna stacja → wiele dni pomiarowych)
```

Są to **dwa oddzielne obszary danych**: zarządzanie polami i użytkownikami oraz historia opadów IMGW. W przekazanym schemacie bazy nie ma jeszcze połączenia pomiędzy `fields` a `stations`.

### Co to jest klucz główny i obcy?

- **Klucz główny (`PRIMARY KEY`)** to unikalny numer lub zestaw pól identyfikujących rekord — jak numer legitymacji.
- **Klucz obcy (`FOREIGN KEY`)** to wskazanie rekordu w innej tabeli — np. `fields.soiltype` wskazuje `soiltypes.id`.

## 8. Jak uruchamiają się Docker i PostgreSQL?

W obecnym `docker-compose.yml` są trzy usługi:

| Usługa | Zadanie |
|---|---|
| `postgres_db` | Uruchamia PostgreSQL i trzyma tabele. |
| `imgw_import` | Czyta CSV, importuje stacje i opady, a następnie kończy działanie. |
| `backend` | Uruchamia aplikację Python/FastAPI. |

Kolejność:

```text
docker compose up --build -d
             ↓
       postgres_db
             ↓
    baza jest gotowa
             ↓
        imgw_import
       (import z CSV)
             ↓
          backend
         (FastAPI)
```

`init.sql` jest wykonywany **tylko przy pierwszym zakładaniu pustej bazy**. `imgw_import.sql` działa jako osobny krok i może uzupełnić **już istniejącą** bazę.

Plik `imgw_import.sql` stosuje `ON CONFLICT`: gdy rekord o tym samym kluczu już istnieje, może zostać zaktualizowany zamiast utworzenia duplikatu. Ponowne wykonanie importu wciąż wymaga odczytania dużych CSV.

### Gdzie Docker szuka plików?

W przekazanej konfiguracji:

```yaml
- ./imgw_import.sql:/scripts/imgw_import.sql:ro
- ./backend/scripts/data/imgw/processed:/data:ro
```

Zatem **na komputerze** pliki `stations.csv` i `precipitation_daily.csv` muszą znajdować się w `backend/scripts/data/imgw/processed/`.

Końcówka `:ro` znaczy: kontener może plik **czytać**, ale nie modyfikować.

## 9. Jak uruchomić i sprawdzić dane?

Polecenia wpisuj w **głównym katalogu `hacknation/`**, tam gdzie leży `docker-compose.yml`.

**Uruchomienie:**

```bash
docker compose up --build -d
```

**Stan usług:**

```bash
docker compose ps -a
```

Importer zakończony statusem `Exited (0)` to normalna sytuacja — jego praca jest jednorazowa.

**Logi importera:**

```bash
docker compose logs imgw_import
```

**Wejście do bazy:**

```bash
docker compose exec postgres_db psql -U hacknation_admin -d hacknation_db
```

W konsoli `psql` możesz wpisać:

```sql
\dt
```

Aby policzyć stacje i pomiary:

```sql
SELECT COUNT(*) FROM stations;
SELECT COUNT(*) FROM precipitation_daily;
```

Dla przetworzonego zbioru z naszego importu oczekiwano:

| Co sprawdzamy? | Liczba |
|---|---:|
| Stacje IMGW | **1 186** |
| Dobowe wpisy pomiarowe | **2 374 904** |
| Stacje z orientacyjnymi współrzędnymi | **1 162** |
| Stacje bez współrzędnych | **24** |

To wyniki konkretnego przetworzenia, a nie stałe wartości IMGW. Jeśli później zaktualizujesz CSV, liczby mogą się zmienić.

**Przykładowe dane stacji:**

```sql
SELECT station_id, station_name, latitude, longitude
FROM stations
LIMIT 10;
```

**Przykładowe pomiary z 2023 roku:**

```sql
SELECT station_id, observation_date, precipitation_mm, quality_code
FROM precipitation_daily
WHERE observation_date BETWEEN '2023-01-01' AND '2023-01-31'
LIMIT 10;
```

Aby wyjść z `psql`, wpisz `\q`.

> **Ostrzeżenie:** nie używaj `docker compose down -v`, jeśli chcesz zachować dane. Polecenie z `-v` usuwa również wolumeny projektu.

## 10. Jak działa API IMGW?

Jeśli skopiowano przygotowane moduły `models/imgw.py`, `schemas/imgw.py` i `routes/imgw.py`, a router IMGW został dołączony do `main.py`, można używać następujących adresów:

| Adres | Co zwraca? |
|---|---|
| `GET /imgw/stations` | Listę stacji, stronicowaną. |
| `GET /imgw/stations/{station_id}` | Jedną stację. |
| `GET /imgw/stations/{station_id}/precipitation?start_date=2023-01-01&end_date=2023-01-31` | Dzienne pomiary tej stacji w podanym okresie. |
| `GET /imgw/precipitation?observation_date=2023-01-01` | Pomiary różnych stacji dla jednej daty. |

`{station_id}` zastępujesz rzeczywistym ID stacji z bazy. API korzysta z `DATABASE_URL` ustawionego w środowisku backendu.

**Uwaga:** w udostępnionym wcześniej `main.py` widniały tylko routery `auth`, `field` i `openmeteo`. Moduły IMGW z osobnego pakietu **nie stają się aktywne automatycznie**. Trzeba je podłączyć:

```python
from routes import auth, field, imgw, openmeteo

app.include_router(imgw.router, prefix="/imgw")
```

Po uruchomieniu FastAPI dokumentacja dostępnych endpointów powinna być widoczna pod `http://localhost:8000/docs`.

## 11. Co już zrobiliśmy, a czego jeszcze nie?

**Zrobione:**
- pobrano archiwa IMGW;
- uporządkowano dane z lat 2010–2026;
- przygotowano `stations.csv` i `precipitation_daily.csv`;
- utworzono i zasilono tabele PostgreSQL;
- przygotowano modele, schematy i trasy API IMGW.

**Do sprawdzenia lub zrobienia później:**
- potwierdzenie, że router IMGW faktycznie jest zarejestrowany w uruchomionym backendzie;
- weryfikacja orientacyjnych współrzędnych stacji;
- znalezienie współrzędnych dla 24 stacji bez lokalizacji;
- interpolacja opadów dla dowolnego punktu na mapie;
- ewentualne dodanie geometrii pól do `fields`.

## 12. Najprostsze podsumowanie

**`stations` mówi: _gdzie stoi deszczomierz?_**

**`precipitation_daily` mówi: _ile opadu zapisano tam danego dnia?_**

**`fields` mówi: _jakie pola są w aplikacji?_**

**`users` i `userfields` mówią: _kto korzysta z aplikacji i z jakimi polami jest powiązany?_**

**`sensors` i `sensortypes` mówią: _jakie czujniki są przypisane do pól i jakie wartości zapisano?_**

**Docker uruchamia usługi, PostgreSQL przechowuje dane, a FastAPI pozwala je odczytać.**

---

### Źródła i zakres dokumentacji

README opracowano na podstawie przekazanych plików `init.sql`, `docker-compose.yml`, `imgw_import.sql`, modułów `models/imgw.py`, `schemas/imgw.py`, `routes/imgw.py`, skryptu przygotowania IMGW i dokumentacji źródłowej IMGW. Część plików aplikacji była znana tylko z nazwy i rejestracji w `main.py`; ich szczegółowego działania nie należy traktować jako zweryfikowanego.
