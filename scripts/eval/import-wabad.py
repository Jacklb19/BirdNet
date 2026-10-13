"""
Prepares the Colombian sites of WABAD for the evaluation (docs/evaluacion.md).

Source: Pérez-Granados et al., "WABAD: A World Annotated Bird Acoustic Dataset for passive acoustic monitoring",
https://doi.org/10.5281/zenodo.14191524 (CC BY 4.0): one-minute recordings annotated to species by local
experts, one archive per recording site. It is independent of the laboratory that makes BirdNET and was
published after BirdNET v2.4, so that model cannot have been trained on it. Download the archives of the sites
into one directory, then run

    python scripts/eval/import-wabad.py <directory with the site archives> <directory for the evaluation set>

It extracts every archive it knows and writes `recordings.csv`, `vocabulary.csv` and an Audacity label track
next to each recording, which is the layout `score-models.py` and `report.mjs` read.
"""
import csv
import re
import sys
import zipfile
from datetime import datetime
from pathlib import Path

# Centre of each recording site, from Table 2 of the data paper (decimal degrees).
SITES: dict[str, tuple[float, float]] = {
    "BRE": (4.6753, -75.6136),    # Reserva Natural Bremen-La Popa, Quindío
    "CARI": (6.2831, -71.7778),   # Vereda Caribabare, Tame, Arauca
    "SAL": (4.6325, -75.4594),    # Reserva Natural La Montaña, Salento
    "SPMCO": (6.4258, -75.5358),  # San Pedro de los Milagros, Antioquia
    "TAM": (5.7533, -72.2108),    # Bosque El Algarrobo, Támara, Casanare
    "UNI": (4.5539, -75.6611),    # Jardín Botánico de la Universidad del Quindío
    "VER": (4.5914, -75.5908),    # Alto Quindío, El Vergel
}

ARCHIVE_SUFFIX = ".zip"
AUDIO_FOLDER = "Recordings"
LABELS_FOLDER = "Audacity annotations"
AUDIO_SUFFIX = ".wav"
LABELS_SUFFIX = ".txt"
RECORDINGS_FILE = "recordings.csv"
VOCABULARY_FILE = "vocabulary.csv"
# Recording names are <site>_<yyyymmdd>_<hhmmss>.wav; the time is local to the site.
FILENAME_PATTERN = re.compile(r"^(?P<site>[A-Z]+)_(?P<date>\d{8})_(?P<time>\d{6})\.wav$", re.IGNORECASE)
FILENAME_TIME_FORMAT = "%Y%m%d%H%M%S"
FIELD_SEPARATOR = "\t"
# Audacity writes the frequency range of a selection on a second line that starts with a backslash.
SPECTRAL_LINE_PREFIX = "\\"
NO_VALUE = "NA"
DEVICE = "field recorder"

# Names the same species has in the label files of the models compared, where they differ from the dataset's.
ALIASES: dict[str, tuple[str, ...]] = {
    "Phylloscartes ophthalmicus": ("Pogonotriccus ophthalmicus",),
    "Phyllomyias nigrocapillus": ("Tyranniscus nigrocapillus",),
}
ALIAS_SEPARATOR = ";"


def extract(archive: Path, root: Path) -> None:
    """Extracts a site archive under `root`, refusing any member that would land outside it."""
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            target = (root / member.filename).resolve()
            if root not in target.parents and target != root:
                raise SystemExit(f"Unsafe path in {archive.name}: {member.filename}")
        bundle.extractall(root)


def read_labels(path: Path) -> list[tuple[float, float, str]]:
    labels = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        if not line.strip() or line.startswith(SPECTRAL_LINE_PREFIX):
            continue
        fields = [field.strip() for field in line.split(FIELD_SEPARATOR)]
        if fields == [NO_VALUE] * 3:
            # A minute in which the annotator identified no bird carries one placeholder line.
            continue
        if len(fields) < 3 or not fields[2]:
            raise SystemExit(f"Unexpected label line in {path}: {line}")
        # A few selections were drawn from right to left and carry their end before their start.
        start, end = sorted((float(fields[0].replace(",", ".")), float(fields[1].replace(",", "."))))
        labels.append((start, end, fields[2]))
    return sorted(labels)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    archives, root = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve()
    root.mkdir(parents=True, exist_ok=True)

    recordings: list[dict[str, object]] = []
    species: set[str] = set()
    total_labels = 0
    for site, (latitude, longitude) in sorted(SITES.items()):
        archive = archives / f"{site}{ARCHIVE_SUFFIX}"
        if not archive.exists():
            # A partial download is still a usable set: the sites that are missing are simply not evaluated.
            print(f"[WARN] {archive.name} is not under {archives}; the site was left out")
            continue
        if not (root / site).exists():
            extract(archive, root)
        for audio in sorted((root / site / AUDIO_FOLDER).glob(f"*{AUDIO_SUFFIX}")):
            match = FILENAME_PATTERN.match(audio.name)
            if not match:
                raise SystemExit(f"Unexpected recording name: {audio.name}")
            source = root / site / LABELS_FOLDER / audio.with_suffix(LABELS_SUFFIX).name
            # Every recording of the set was annotated in full; one without a label track has no identified bird.
            labels = read_labels(source) if source.exists() else []
            lines = [f"{start:.3f}{FIELD_SEPARATOR}{end:.3f}{FIELD_SEPARATOR}{name}" for start, end, name in labels]
            audio.with_suffix(LABELS_SUFFIX).write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
            species.update(name for _, _, name in labels)
            total_labels += len(labels)
            recordings.append({
                "file": audio.relative_to(root).as_posix(),
                "recorded_at": datetime.strptime(match["date"] + match["time"], FILENAME_TIME_FORMAT).isoformat(),
                "latitude": latitude, "longitude": longitude, "device": DEVICE, "fully_annotated": "yes", "merlin_species": "",
            })

    with open(root / RECORDINGS_FILE, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["file", "recorded_at", "latitude", "longitude", "device", "fully_annotated", "merlin_species"])
        writer.writeheader()
        writer.writerows(recordings)
    with open(root / VOCABULARY_FILE, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["scientific_name", "common_name", "aliases"])
        writer.writeheader()
        writer.writerows({"scientific_name": name, "common_name": "", "aliases": ALIAS_SEPARATOR.join(ALIASES.get(name, ()))} for name in sorted(species))
    print(f"[OK] {len(recordings)} recordings, {total_labels} labels, {len(species)} species -> {root}")


if __name__ == "__main__":
    main()
