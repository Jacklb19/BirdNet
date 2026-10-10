"""
Builds public/models/species-photos.json: the photo of every bird likely in the deployment region, so the app shows
it at once instead of asking two services per species (ADR-23).

The region's species come from BirdNET's geographic model (public/models/birdnet_geo_model.onnx, see
prepare-geo-model.py): every label whose year-round probability passes BirdNET's location threshold at any of
REGION_POINTS. For each one, the lead image of its Wikipedia article is looked up and its thumbnail, author and
license are read from Wikimedia Commons, the same sources and rules as src/features/species/speciesPhotos.ts.
Species without an article image or without a license are left out; the app looks those up itself.

Run from the frontend root when the model or the region changes: `npm run data:species-photos`.
Needs onnxruntime, numpy and requests (the packages prepare-model.py already uses).
"""

from __future__ import annotations

import json
import re
import time
from datetime import date
from pathlib import Path

import numpy as np
import onnxruntime as ort
import requests

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "public" / "models"
GEO_MODEL_PATH = MODELS_DIR / "birdnet_geo_model.onnx"
LABELS_PATH = MODELS_DIR / "labels.txt"
# Mirrors MODEL_FILES.speciesPhotos in build.config.mjs.
OUTPUT_PATH = MODELS_DIR / "species-photos.json"

# Cities spread over Colombia's regions (Andes, Caribbean, Pacific, Orinoquia, Amazonia): latitude, longitude.
REGION_POINTS: dict[str, tuple[float, float]] = {
    "Bogotá": (4.711, -74.072),
    "Medellín": (6.244, -75.581),
    "Cali": (3.452, -76.532),
    "Barranquilla": (10.969, -74.781),
    "Bucaramanga": (7.119, -73.123),
    "Pasto": (1.214, -77.281),
    "Santa Marta": (11.241, -74.199),
    "Quibdó": (5.692, -76.658),
    "Villavicencio": (4.142, -73.627),
    "Leticia": (-4.215, -69.941),
}
# BirdNET's week for a year-round prediction and its default location-filter threshold (src/features/inference/geoFilter.ts).
YEAR_ROUND_WEEK = -1.0
GEO_THRESHOLD = np.float32(0.03)
# Model labels are "<scientific name>_<English common name>".
LABEL_SEPARATOR = "_"

WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"
# Hosts the app accepts photos from (config.photos.allowedImageHosts).
ALLOWED_IMAGE_HOSTS = ("thumb.wikimedia.org", "upload.wikimedia.org")
# Mirrors THUMBNAIL_WIDTH_PX in src/features/species/speciesPhotos.ts.
THUMBNAIL_WIDTH_PX = 500
# MediaWiki accepts at most 50 titles per query for anonymous clients.
TITLES_PER_QUERY = 50
REQUEST_TIMEOUT_SECONDS = 30
# A pause between queries and an identifying agent, as the Wikimedia API etiquette asks.
PAUSE_SECONDS = 0.5
USER_AGENT = "TrinoSpeciesPhotos/1.0 (academic project; https://birdnet-nu.vercel.app)"
FILE_NAMESPACE = "File:"
TAG_PATTERN = re.compile(r"<[^>]*>")
SPACE_PATTERN = re.compile(r"\s+")


def region_species() -> list[str]:
    """Scientific names likely at any region point over the year, in label order."""
    labels = [line.strip() for line in LABELS_PATH.read_text(encoding="utf-8").splitlines() if line.strip()]
    session = ort.InferenceSession(str(GEO_MODEL_PATH), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    points = np.array([[lat, lon, YEAR_ROUND_WEEK] for lat, lon in REGION_POINTS.values()], dtype=np.float32)
    probabilities = session.run(None, {input_name: points})[0]
    if probabilities.shape != (len(REGION_POINTS), len(labels)):
        raise RuntimeError("The geographic model does not match the labels.")
    likely = (probabilities >= GEO_THRESHOLD).any(axis=0)
    return [labels[index].split(LABEL_SEPARATOR)[0] for index in np.flatnonzero(likely)]


def query(session: requests.Session, api: str, params: dict[str, str]) -> dict:
    response = session.get(api, params={"format": "json", "action": "query", **params}, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    body = response.json()
    if "query" not in body:
        raise RuntimeError(f"Unexpected answer from {api}: {str(body)[:200]}")
    time.sleep(PAUSE_SECONDS)
    return body["query"]


def resolved_titles(result: dict, titles: list[str]) -> dict[str, str]:
    """Each requested title mapped to the title the API answered with (after normalization and redirects)."""
    steps: dict[str, str] = {}
    for key in ("normalized", "redirects"):
        for step in result.get(key, []):
            steps[step["from"]] = step["to"]
    resolved = {}
    for title in titles:
        current = title
        while current in steps:
            current = steps[current]
        resolved[title] = current
    return resolved


def page_images(session: requests.Session, species: list[str]) -> dict[str, str]:
    """Lead image file of each species' Wikipedia article."""
    files: dict[str, str] = {}
    for start in range(0, len(species), TITLES_PER_QUERY):
        batch = species[start:start + TITLES_PER_QUERY]
        result = query(session, WIKIPEDIA_API, {
            "prop": "pageimages", "piprop": "name", "pilimit": str(TITLES_PER_QUERY), "redirects": "1", "titles": "|".join(batch),
        })
        by_title = {page["title"]: page.get("pageimage") for page in result.get("pages", {}).values()}
        for name, title in resolved_titles(result, batch).items():
            if by_title.get(title):
                files[name] = by_title[title]
    return files


def plain(value: object) -> str:
    return SPACE_PATTERN.sub(" ", TAG_PATTERN.sub("", value)).strip() if isinstance(value, str) else ""


def image_infos(session: requests.Session, files: list[str]) -> dict[str, tuple[str, str | None, str]]:
    """Thumbnail URL, author and license of each Commons file; files without a license or an allowed host are skipped."""
    infos: dict[str, tuple[str, str | None, str]] = {}
    for start in range(0, len(files), TITLES_PER_QUERY):
        batch = [FILE_NAMESPACE + name for name in files[start:start + TITLES_PER_QUERY]]
        result = query(session, COMMONS_API, {
            "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": str(THUMBNAIL_WIDTH_PX), "titles": "|".join(batch),
        })
        by_title = {page["title"]: page for page in result.get("pages", {}).values()}
        for requested, title in resolved_titles(result, batch).items():
            info = (by_title.get(title, {}).get("imageinfo") or [None])[0]
            if not info or not isinstance(info.get("thumburl"), str):
                continue
            # The tracking query Commons appends is not part of the file's address.
            url = info["thumburl"].split("?")[0]
            if not any(url.startswith(f"https://{host}/") for host in ALLOWED_IMAGE_HOSTS):
                continue
            metadata = info.get("extmetadata") or {}
            license_name = plain((metadata.get("LicenseShortName") or {}).get("value"))
            if not license_name:
                continue
            author = plain((metadata.get("Artist") or {}).get("value")) or None
            infos[requested[len(FILE_NAMESPACE):]] = (url, author, license_name)
    return infos


def main() -> None:
    species = region_species()
    with requests.Session() as session:
        session.headers["User-Agent"] = USER_AGENT
        files = page_images(session, species)
        infos = image_infos(session, sorted(set(files.values())))
    photos = {name: list(infos[file]) for name, file in sorted(files.items()) if file in infos}
    OUTPUT_PATH.write_text(json.dumps({
        "source": "Lead image of each species' English Wikipedia article, served by Wikimedia Commons with its author and license.",
        "region": sorted(REGION_POINTS),
        "width": THUMBNAIL_WIDTH_PX,
        "updated_at": date.today().isoformat(),
        "photos": photos,
    }, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"{len(photos)} photos for {len(species)} regional species written to {OUTPUT_PATH.name} ({size_kb:.0f} kB).")  # noqa: T201


if __name__ == "__main__":
    main()
