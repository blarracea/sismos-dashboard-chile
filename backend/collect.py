"""
Script principal de recoleccion. Lo ejecuta GitHub Actions cada 30 minutos
(ver .github/workflows/collect.yml), pero tambien se puede correr a mano:

    cd backend
    pip install -r requirements.txt
    python collect.py

Trae sismos recientes de USGS (incluida la intensidad Mercalli percibida del
producto DYFI), los guarda en data/YYYY-MM-DD.json y purga lo mas viejo que
30 dias. CSN y redes sociales todavia no estan implementados (ver
backend/sources/csn.py y backend/sources/social.py).
"""
from datetime import datetime, timedelta, timezone

import keywords
import storage
from sources import usgs

# Bounding box aproximado de Chile + Sudamerica.
BBOX = {
    "minlatitude": -56,
    "maxlatitude": 13,
    "minlongitude": -82,
    "maxlongitude": -34,
}
MIN_MAGNITUDE = 2.5
LOOKBACK_DAYS = 3  # se reconsulta para capturar revisiones de magnitud y DYFI que llegan tarde
RETENTION_DAYS = 30
RELEVANT_MAGNITUDE = 5.0
RELEVANT_FELT_REPORTS = 50


def build_event_record(feature, dyfi_points):
    props = feature["properties"]
    lon, lat, depth = feature["geometry"]["coordinates"][:3]
    place = props.get("place") or ""
    magnitude = props.get("mag")
    felt = props.get("felt") or 0

    is_relevant = bool(
        (magnitude is not None and magnitude >= RELEVANT_MAGNITUDE)
        or props.get("tsunami")
        or felt >= RELEVANT_FELT_REPORTS
    )

    return {
        "id": feature["id"],
        "source": "usgs",
        "time": datetime.fromtimestamp(props["time"] / 1000, tz=timezone.utc).isoformat(),
        "updated": datetime.fromtimestamp(props["updated"] / 1000, tz=timezone.utc).isoformat(),
        "lat": lat,
        "lon": lon,
        "depth_km": depth,
        "magnitude": magnitude,
        "mag_type": props.get("magType"),
        "place": place,
        "cdi": props.get("cdi"),
        "mmi": props.get("mmi"),
        "felt_reports": felt,
        "tsunami_flag": bool(props.get("tsunami")),
        "dyfi_points": dyfi_points,
        "url": props.get("url"),
        "relevant": is_relevant,
        "keywords_matched": keywords.matched_keywords(place),
    }


def main():
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=LOOKBACK_DAYS)

    raw_events = usgs.fetch_events(start, now, MIN_MAGNITUDE, BBOX)

    events = []
    for feature in raw_events:
        props = feature["properties"]
        has_dyfi = props.get("felt") or "dyfi" in (props.get("types") or "")
        dyfi_points = usgs.fetch_dyfi_points(props.get("detail")) if has_dyfi else []
        events.append(build_event_record(feature, dyfi_points))

    storage.upsert_events(events)
    storage.purge_old(RETENTION_DAYS)
    storage.update_index()

    print(f"Procesados {len(events)} eventos ({start.date()} a {now.date()}).")


if __name__ == "__main__":
    main()
