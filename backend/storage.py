"""
Guarda y lee los eventos sismicos en archivos JSON particionados por dia
(data/YYYY-MM-DD.json), y mantiene data/index.json con la lista de archivos
disponibles.

Se eligio JSON particionado por dia en vez de una base de datos porque con
commits automaticos cada 30 minutos, un archivo .db binario ensuciaria el
historial de git; con JSON por dia, cada commit solo toca el archivo del dia
en curso y cualquiera puede abrirlo con un editor de texto normal.
"""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
INDEX_FILE = DATA_DIR / "index.json"
SOCIAL_FILE = DATA_DIR / "social_mentions.json"
SOCIAL_RETENTION_HOURS = 72


def _day_file(date_str):
    return DATA_DIR / f"{date_str}.json"


def _event_date(event):
    return event["time"][:10]  # "2026-08-21T14:32:10+00:00" -> "2026-08-21"


def _is_day_file(path):
    """True solo para archivos con forma de dia (YYYY-MM-DD.json) -- evita
    que otros .json de data/ (ej. index.json, comuna_coords_cache.json)
    se cuelen como si fueran un dia de eventos."""
    try:
        datetime.strptime(path.stem, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def load_day(date_str):
    path = _day_file(date_str)
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_day(date_str, events):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    events_sorted = sorted(events, key=lambda e: e["time"])
    with _day_file(date_str).open("w", encoding="utf-8") as f:
        json.dump(events_sorted, f, ensure_ascii=False, indent=2)


def upsert_events(events):
    """Agrupa los eventos nuevos por dia y los mezcla (por id) con lo ya guardado."""
    by_day = {}
    for event in events:
        by_day.setdefault(_event_date(event), []).append(event)

    for date_str, day_events in by_day.items():
        existing = {e["id"]: e for e in load_day(date_str)}
        for event in day_events:
            existing[event["id"]] = event
        save_day(date_str, list(existing.values()))


def update_index():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(p.stem for p in DATA_DIR.glob("*.json") if _is_day_file(p))
    with INDEX_FILE.open("w", encoding="utf-8") as f:
        json.dump(
            {"days": files, "updated": datetime.now(timezone.utc).isoformat()},
            f,
            ensure_ascii=False,
            indent=2,
        )


def load_social_mentions():
    if not SOCIAL_FILE.exists():
        return []
    with SOCIAL_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_social_mentions(new_mentions):
    """
    Mezcla las menciones nuevas con las ya guardadas (por link) y recorta a
    las ultimas SOCIAL_RETENTION_HOURS -- a diferencia de los sismos, aca
    solo importa lo reciente, no hace falta un historial de 30 dias.
    """
    existing = {m["link"]: m for m in load_social_mentions()}
    for mention in new_mentions:
        existing[mention["link"]] = mention

    cutoff = datetime.now(timezone.utc) - timedelta(hours=SOCIAL_RETENTION_HOURS)
    kept = []
    for mention in existing.values():
        published = mention.get("published")
        if published:
            try:
                if datetime.fromisoformat(published) < cutoff:
                    continue
            except ValueError:
                pass
        kept.append(mention)
    kept.sort(key=lambda m: m.get("published") or "", reverse=True)

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with SOCIAL_FILE.open("w", encoding="utf-8") as f:
        json.dump(kept, f, ensure_ascii=False, indent=2)


def purge_old(retention_days):
    """Borra los archivos diarios con mas de `retention_days` dias de antiguedad."""
    cutoff = datetime.now(timezone.utc).date() - timedelta(days=retention_days)
    for path in DATA_DIR.glob("*.json"):
        if not _is_day_file(path):
            continue
        file_date = datetime.strptime(path.stem, "%Y-%m-%d").date()
        if file_date < cutoff:
            path.unlink()
