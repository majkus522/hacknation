
import argparse
import time
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests


BASE_URL = (
    "https://danepubliczne.imgw.pl/data/"
    "dane_pomiarowo_obserwacyjne/"
    "dane_meteorologiczne/dobowe/opad/"
)

OUTPUT_DIR = Path("data/imgw/raw")

REQUEST_INTERVAL = 2.0
TIMEOUT = (10, 60)


class LinkParser(HTMLParser):
    """
    Odczytywanie odnośników z indeksu katalogu IMGW.
    """

    def __init__(self) -> None:
        super().__init__()
        self.links = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag != "a":
            return

        for name, value in attrs:
            if name == "href" and value:
                self.links.append(value)


def get_links(session: requests.Session, url: str) -> list[str]:
    """
    Pobieranie listy odnośników ze strony IMGW.
    """
    response = session.get(url, timeout=TIMEOUT)
    response.raise_for_status()

    parser = LinkParser()
    parser.feed(response.text)

    return parser.links


def discover_archives(
    session: requests.Session,
) -> list[tuple[str, str, str]]:
    """
    Wyszukiwanie wszystkich archiwów ZIP z opadami.
    """
    archives = []

    directories = get_links(session, BASE_URL)

    for directory in directories:
        if not directory.endswith("/"):
            continue

        if not directory.rstrip("/").replace("_", "").isdigit():
            continue

        directory_url = urljoin(BASE_URL, directory)

        print(f"Sprawdzanie: {directory}", flush=True)

        time.sleep(REQUEST_INTERVAL)

        links = get_links(session, directory_url)

        for filename in links:
            if not filename.lower().endswith(".zip"):
                continue

            if Path(filename).name != filename:
                continue

            file_url = urljoin(directory_url, filename)

            if urlparse(file_url).netloc != urlparse(BASE_URL).netloc:
                continue

            archives.append(
                (directory.rstrip("/"), filename, file_url)
            )

    return sorted(archives)


def is_valid_zip(path: Path) -> bool:
    """
    Sprawdzanie poprawności archiwum ZIP.
    """
    if not path.is_file():
        return False

    try:
        with zipfile.ZipFile(path) as archive:
            return archive.testzip() is None
    except (OSError, zipfile.BadZipFile):
        return False


def download_archive(
    session: requests.Session,
    directory: str,
    filename: str,
    url: str,
) -> bool:
    """
    Pobieranie jednego archiwum IMGW.
    """
    destination = OUTPUT_DIR / directory / filename

    destination.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    if is_valid_zip(destination):
        print(f"Pominięto: {filename}", flush=True)
        return False

    temporary = destination.with_suffix(".zip.part")

    print(f"Pobieranie: {filename}", flush=True)

    try:
        with session.get(
            url,
            stream=True,
            timeout=TIMEOUT,
        ) as response:
            if response.status_code == 429:
                retry_after = response.headers.get(
                    "Retry-After"
                )
                raise RuntimeError(
                    f"Limit IMGW (429). Retry-After: {retry_after}"
                )

            response.raise_for_status()

            with temporary.open("wb") as file:
                for chunk in response.iter_content(
                    chunk_size=64 * 1024
                ):
                    if chunk:
                        file.write(chunk)

        if not is_valid_zip(temporary):
            raise ValueError(
                f"Nieprawidłowy plik ZIP: {filename}"
            )

        temporary.replace(destination)

        print(
            f"Zapisano: {destination} "
            f"({destination.stat().st_size / 1024:.1f} KB)",
            flush=True,
        )

        return True

    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    """
    Pobieranie archiwalnych danych opadowych IMGW.
    """
    parser = argparse.ArgumentParser()

    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maksymalna liczba archiwów do pobrania",
    )

    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    with requests.Session() as session:
        print("Wyszukiwanie archiwów IMGW...", flush=True)

        archives = discover_archives(session)

        print(
            f"Znaleziono {len(archives)} archiwów.",
            flush=True,
        )

        downloaded = 0
        skipped = 0

        for directory, filename, url in archives:
            if args.limit is not None:
                if downloaded >= args.limit:
                    break

            path = OUTPUT_DIR / directory / filename

            if is_valid_zip(path):
                skipped += 1
                continue

            time.sleep(REQUEST_INTERVAL)

            try:
                was_downloaded = download_archive(
                    session,
                    directory,
                    filename,
                    url,
                )

                if was_downloaded:
                    downloaded += 1

            except (
                requests.RequestException,
                RuntimeError,
                ValueError,
                OSError,
            ) as error:
                print(f"Błąd: {error}", flush=True)
                print(
                    "Zatrzymano pobieranie. "
                    "Możesz wznowić je później.",
                    flush=True,
                )
                break

        print("\nPodsumowanie:", flush=True)
        print(f"Pobrano: {downloaded}", flush=True)
        print(f"Pominięto: {skipped}", flush=True)


if __name__ == "__main__":
    main()
