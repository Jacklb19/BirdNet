"""
Prepares the Colombia / Costa Rica coffee-farm soundscapes for the evaluation (docs/evaluacion.md).

Source: Vega-Hidalgo et al., "A collection of fully-annotated soundscape recordings from neotropical coffee
farms in Colombia and Costa Rica", https://doi.org/10.5281/zenodo.7525349 (CC BY 4.0): 34 one-hour recordings
annotated by ornithologists. Download and extract the record into one directory, then run

    python scripts/eval/import-coffee-farms.py <that directory>

It writes, in that directory, `recordings.csv`, `vocabulary.csv` and an Audacity label track next to each
recording, which is the layout `score-models.py` and `report.mjs` read.
"""
import csv
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ANNOTATIONS_FILE = "annotations.csv"
SPECIES_FILE = "species.csv"
LOCATIONS_FILE = "recording_location.txt"
RECORDINGS_FILE = "recordings.csv"
VOCABULARY_FILE = "vocabulary.csv"
AUDIO_SUFFIX = ".flac"
LABELS_SUFFIX = ".txt"

# Recording names are NES_<number>_<site>_<yyyymmdd>_<hhmmss>.flac; the time is local to the site.
FILENAME_PATTERN = re.compile(r"^NES_\d+_(?P<site>S\d+)_(?P<date>\d{8})_(?P<time>\d{6})\.flac$")
FILENAME_TIME_FORMAT = "%Y%m%d%H%M%S"
SITE_PATTERN = re.compile(r"Site (S\d+):.*?Latitude:\s*(-?[\d.]+).*?Longitude:\s*(-?[\d.]+)", re.DOTALL)

# Code the annotators gave to a bird sound they could not identify.
UNKNOWN_CODE = "????"
UNKNOWN_LABEL = "unidentified"
UNCERTAIN_SUFFIX = "?"
DEVICE = "field recorder"

# Names the same species has in the label files of the models compared, where they differ from the dataset's.
ALIASES = {
    "Psilorhinus morio": ("Cyanocorax morio",),
    "Milvago chimachima": ("Daptrius chimachima",),
}
ALIAS_SEPARATOR = ";"


def read_rows(path: Path) -> list[dict[str, str]]:
    with open(path, encoding="utf-8", newline="") as handle:
        return list(csv.DictReader(handle))


def write_rows(path: Path, columns: list[str], rows: list[dict[str, object]]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    root = Path(sys.argv[1]).resolve()
    species = {row["Species eBird Code"]: row for row in read_rows(root / SPECIES_FILE)}
    sites = {site: (float(latitude), float(longitude)) for site, latitude, longitude in SITE_PATTERN.findall((root / LOCATIONS_FILE).read_text(encoding="utf-8"))}
    audio = {path.name: path for path in root.rglob(f"*{AUDIO_SUFFIX}")}

    labels: dict[str, list[tuple[float, float, str]]] = defaultdict(list)
    for row in read_rows(root / ANNOTATIONS_FILE):
        code = row["Species eBird Code"]
        name = UNKNOWN_LABEL + UNCERTAIN_SUFFIX if code == UNKNOWN_CODE else species[code]["Scientific Name"]
        labels[row["Filename"]].append((float(row["Start Time (s)"]), float(row["End Time (s)"]), name))

    recordings: list[dict[str, object]] = []
    for filename in sorted(audio):
        match = FILENAME_PATTERN.match(filename)
        if not match:
            raise SystemExit(f"Unexpected recording name: {filename}")
        latitude, longitude = sites[match["site"]]
        path = audio[filename]
        # A recording without annotations is a valid, fully annotated hour in which no bird was identified.
        lines = [f"{start:.3f}\t{end:.3f}\t{name}" for start, end, name in sorted(labels.get(filename, []))]
        path.with_suffix(LABELS_SUFFIX).write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
        recordings.append({
            "file": path.relative_to(root).as_posix(),
            "recorded_at": datetime.strptime(match["date"] + match["time"], FILENAME_TIME_FORMAT).isoformat(),
            "latitude": latitude, "longitude": longitude, "device": DEVICE, "fully_annotated": "yes", "merlin_species": "",
        })
    # A partial download is still a usable set: the recordings that are missing are simply not evaluated.
    missing = sorted(set(labels) - set(audio))
    if missing:
        print(f"[WARN] {len(missing)} annotated recordings are not under {root} and were left out")

    write_rows(root / RECORDINGS_FILE, ["file", "recorded_at", "latitude", "longitude", "device", "fully_annotated", "merlin_species"], recordings)
    write_rows(root / VOCABULARY_FILE, ["scientific_name", "common_name", "aliases"], [
        {"scientific_name": row["Scientific Name"], "common_name": row["Common Name"], "aliases": ALIAS_SEPARATOR.join(ALIASES.get(row["Scientific Name"], ()))}
        for code, row in sorted(species.items()) if code != UNKNOWN_CODE
    ])
    print(f"[OK] {len(recordings)} recordings, {sum(len(labels.get(name, [])) for name in audio)} labels -> {root}")


if __name__ == "__main__":
    main()
