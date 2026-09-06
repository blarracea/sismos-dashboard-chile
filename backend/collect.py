"""
Script principal de recoleccion. Lo ejecuta GitHub Actions cada 30 minutos
(ver .github/workflows/collect.yml), pero tambien se puede correr a mano:

    cd backend
    pip install -r requirements.txt
    python -m playwright install --with-deps chromium
    python collect.py

Trae el catalogo base de sismos de USGS para toda la region (incluye el
Territorio Chileno Antartico). Para la intensidad Mercalli percibida:

- Sismos en Chile: se prioriza el CSN/SENAPRED -- tiene muchisima mas
  participacion ciudadana real que el DYFI de USGS para eventos chilenos.
  Dentro de esto, el archivo propio de SENAPRED (senapred.cl/eventos/) es la
  fuente PRINCIPAL porque retiene semanas de historial; la portada del CSN
  (solo sus ~15 sismos mas recientes) queda como respaldo para el caso
  borde de un sismo tan reciente que SENAPRED todavia no indexo. Ver
  sources/csn.py para el detalle de como se obtiene (ninguno de los dos
  tiene API publica).
- Resto de Sudamerica, o sismos chilenos sin match/reporte en ninguna de
  las dos: se usa USGS DYFI como respaldo (baja participacion en la region,
  pero es lo unico disponible fuera de Chile).

Ademas, guarda menciones recientes de sismos en medios chilenos (RSS via
Google News, ver sources/social.py) en data/social_mentions.json -- un
proxy de "donde se habla del sismo", no intensidad Mercalli verificada. Y
guarda posts publicos de Bluesky con las palabras clave del proyecto (ver
sources/bluesky.py) en data/bluesky_mentions.json, para el panel "Bluesky en
vivo" del dashboard.
"""
import math
from datetime import datetime, timedelta, timezone

import comuna_coords
import keywords
import storage
from sources import bluesky, csn, social, usgs

CSN_MATCH_MAX_SECONDS = 180
CSN_MATCH_MAX_DEGREES = 0.5
CSN_MATCH_MAX_MAGNITUDE_DIFF = 1.0

# Un reporte de intensidad para UN sismo no deberia tener comunas
# arbitrariamente lejos del epicentro -- si una comuna geocodifica asi de
# lejos, es casi siempre un nombre ambiguo mal resuelto (ver
# comuna_coords.NOT_A_COMUNA para el caso conocido de "El Loa") o un mal
# match entre el evento y un reporte de SENAPRED de OTRO sismo (dos sismos
# distintos el mismo dia, con hora/magnitud parecidas -- SENAPRED_MATCH no
# tiene forma de descartar esto de antemano porque su archivo no da lat/lon,
# ver enrich_with_senapred_archive). Ninguno de los dos casos es un dato
# real. Esta es la defensa general: cubre cualquier nombre/match mal
# resuelto que todavia no este identificado puntualmente.
#
# El limite escala con la magnitud porque un sismo chico no se siente
# realistamente a cientos de km (un M4.4 emparejado por error con un
# reporte a ~660 km es justamente el caso que este chequeo tiene que
# atrapar), pero un sismo grande si puede sentirse mas lejos. 150 km de piso
# y 700 km de techo son a criterio, calibrados contra los reportes reales
# vistos hasta ahora (el mas ancho, un M4.7 sentido desde Cuya hasta
# Antofagasta, no pasa de ~340 km del epicentro).
MAX_INTENSITY_POINT_DISTANCE_FLOOR_KM = 150
MAX_INTENSITY_POINT_DISTANCE_CEILING_KM = 700
MAX_INTENSITY_POINT_DISTANCE_KM_PER_MAGNITUDE = 120


def _max_intensity_distance_km(magnitude):
    if magnitude is None:
        return MAX_INTENSITY_POINT_DISTANCE_CEILING_KM
    return max(
        MAX_INTENSITY_POINT_DISTANCE_FLOOR_KM,
        min(MAX_INTENSITY_POINT_DISTANCE_CEILING_KM, magnitude * MAX_INTENSITY_POINT_DISTANCE_KM_PER_MAGNITUDE),
    )

# El archivo de SENAPRED solo da hora local (no lat/lon), asi que la segunda
# pasada usa una ventana de tiempo mas ancha y matchea por magnitud en vez
# de por ubicacion.
SENAPRED_MATCH_MAX_MINUTES = 90
SENAPRED_MATCH_MAX_MAGNITUDE_DIFF = 1.0

# Bounding box aproximado de Chile + Sudamerica + Territorio Chileno Antartico
# (entre los meridianos 53O y 90O, desde los 60S hasta el Polo Sur).
BBOX = {
    "minlatitude": -90,
    "maxlatitude": 13,
    "minlongitude": -95,
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
        "intensity_source": "usgs_dyfi" if dyfi_points else None,
        "senapred_url": None,
        "csn_informe_url": None,
        "url": props.get("url"),
        "relevant": is_relevant,
        "keywords_matched": keywords.matched_keywords(place),
    }


def is_chile_event(place):
    return "chile" in (place or "").lower()


def _haversine_km(lat1, lon1, lat2, lon2):
    earth_radius_km = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    a = math.sin(delta_lat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(delta_lon / 2) ** 2
    return 2 * earth_radius_km * math.asin(math.sqrt(a))


def _build_intensity_point(entry, event):
    """
    Geocodifica una entrada de comuna del reporte y arma el punto para
    dyfi_points -- o descarta el punto (devuelve None) si el nombre no se
    pudo geocodificar o geocodifico a un lugar demasiado lejos del
    epicentro del sismo (ver MAX_INTENSITY_POINT_DISTANCE_KM).
    """
    coords = comuna_coords.get_coords(entry["comuna"])
    if coords is None:
        return None

    distance_km = _haversine_km(event["lat"], event["lon"], coords[0], coords[1])
    if distance_km > _max_intensity_distance_km(event["magnitude"]):
        print(
            f"Aviso: se descarta el punto de intensidad de '{entry['comuna']}' para "
            f"{event['id']} -- geocodifico a {distance_km:.0f} km del epicentro, "
            "probablemente un nombre mal resuelto."
        )
        return None

    return {
        "lat": coords[0],
        "lon": coords[1],
        "intensity": entry["intensity"],
        "responses": None,
        "comuna": entry["comuna"],
        "region": entry["region"],
    }


def find_csn_match(usgs_event, csn_details):
    """
    Empareja un evento de USGS con el detalle de un evento del CSN por
    cercania en tiempo, ubicacion y magnitud -- no comparten un id comun
    porque son catalogos independientes.
    """
    usgs_time = datetime.fromisoformat(usgs_event["time"])
    best = None
    best_score = None
    for detail in csn_details:
        if detail["utc_time"] is None or detail["lat"] is None or detail["lon"] is None:
            continue
        seconds_diff = abs((usgs_time - detail["utc_time"]).total_seconds())
        if seconds_diff > CSN_MATCH_MAX_SECONDS:
            continue
        lat_diff = abs(usgs_event["lat"] - detail["lat"])
        lon_diff = abs(usgs_event["lon"] - detail["lon"])
        if lat_diff > CSN_MATCH_MAX_DEGREES or lon_diff > CSN_MATCH_MAX_DEGREES:
            continue
        if usgs_event["magnitude"] is not None and detail["magnitude"] is not None:
            if abs(usgs_event["magnitude"] - detail["magnitude"]) > CSN_MATCH_MAX_MAGNITUDE_DIFF:
                continue
        score = seconds_diff + (lat_diff + lon_diff) * 100
        if best_score is None or score < best_score:
            best, best_score = detail, score
    return best


def enrich_with_csn(events):
    """
    Dos cosas, para eventos en Chile:

    1. Pasada secundaria de intensidad: para eventos que
       enrich_with_senapred_archive() (la fuente principal, ver mas abajo)
       no pudo resolver, busca en la portada del CSN (sus ~15 sismos mas
       recientes) -- sirve para el caso borde de un sismo tan reciente que
       todavia no aparece en el archivo de SENAPRED.
    2. Completa el link al informe real del CSN (sismologia.cl) en eventos
       que YA tienen intensidad resuelta por SENAPRED -- son dos paginas
       distintas (el informe del CSN enlaza al reporte de SENAPRED, pero no
       son la misma URL) y el panel de detalle del sitio muestra ambas por
       separado.
    """
    chile_events = [e for e in events if is_chile_event(e["place"])]
    if not chile_events:
        return

    try:
        recent = csn.fetch_recent_events()
    except Exception as exc:
        print(f"Aviso: no se pudo consultar CSN ({exc}), se usa solo USGS DYFI para Chile.")
        return

    felt_details = []
    for item in recent:
        if not item["felt"]:
            continue
        try:
            detail = csn.fetch_event_detail(item["csn_url"])
        except Exception as exc:
            print(f"Aviso: no se pudo leer el informe CSN {item['csn_url']} ({exc}).")
            continue
        if detail:
            detail["csn_url"] = item["csn_url"]
            felt_details.append(detail)

    if not felt_details:
        return

    for event in chile_events:
        match = find_csn_match(event, felt_details)
        if match is None:
            continue

        if event["intensity_source"] == "csn":
            # Ya tiene intensidad de SENAPRED (pasada principal) -- solo
            # completa el link del informe del CSN, no vuelve a pedir el
            # reporte de intensidad de nuevo.
            event["csn_informe_url"] = match["csn_url"]
            continue

        if not match["senapred_url"]:
            continue
        try:
            intensity_report = csn.fetch_intensity_report(match["senapred_url"])
        except Exception as exc:
            print(f"Aviso: no se pudo leer el reporte SENAPRED de {event['id']} ({exc}).")
            continue

        points = [p for p in (_build_intensity_point(entry, event) for entry in intensity_report) if p]

        if points:
            event["dyfi_points"] = points
            event["intensity_source"] = "csn"
            event["senapred_url"] = match["senapred_url"]
            event["csn_informe_url"] = match["csn_url"]


def enrich_with_senapred_archive(events):
    """
    Pasada PRINCIPAL para intensidad de sismos chilenos: busca en el archivo
    propio de SENAPRED (senapred.cl/eventos/), que retiene semanas de
    historial -- a diferencia de la portada del CSN, que solo expone sus
    ~15 sismos mas recientes y por eso pierde eventos en horas. Matchea por
    cercania de tiempo (SENAPRED no da lat/lon en su listado) y por la
    magnitud que la propia pagina del reporte menciona, como cross-check.
    """
    pending = [e for e in events if is_chile_event(e["place"]) and e["intensity_source"] != "csn"]
    if not pending:
        return

    try:
        candidates = csn.fetch_senapred_seismic_events()
    except Exception as exc:
        print(f"Aviso: no se pudo consultar el archivo de eventos de SENAPRED ({exc}).")
        return

    for event in pending:
        usgs_time = datetime.fromisoformat(event["time"])
        nearby = sorted(
            (
                c
                for c in candidates
                if c["local_time"] is not None
                and abs((usgs_time - c["local_time"]).total_seconds()) <= SENAPRED_MATCH_MAX_MINUTES * 60
            ),
            key=lambda c: abs((usgs_time - c["local_time"]).total_seconds()),
        )
        if not nearby:
            continue

        for candidate in nearby:
            try:
                report = csn.fetch_senapred_report(candidate["url"])
            except Exception as exc:
                print(f"Aviso: no se pudo leer {candidate['url']} ({exc}).")
                continue
            if report is None or not report["points"]:
                continue
            if (
                report["magnitude"] is not None
                and event["magnitude"] is not None
                and abs(report["magnitude"] - event["magnitude"]) > SENAPRED_MATCH_MAX_MAGNITUDE_DIFF
            ):
                continue

            points = [p for p in (_build_intensity_point(entry, event) for entry in report["points"]) if p]
            if points:
                event["dyfi_points"] = points
                event["intensity_source"] = "csn"
                event["senapred_url"] = candidate["url"]
                break  # encontramos un match valido, no probar mas candidatos


def collect_social_mentions():
    """Guarda menciones recientes de sismos en medios chilenos (ver sources/social.py)."""
    try:
        mentions = social.fetch_rss_mentions()
    except Exception as exc:
        print(f"Aviso: no se pudo consultar RSS de menciones ({exc}).")
        return
    storage.save_social_mentions(mentions)
    print(f"Menciones en medios: {len(mentions)} nuevas encontradas.")


def collect_bluesky_mentions():
    """Guarda posts publicos de Bluesky con las palabras clave (ver sources/bluesky.py)."""
    try:
        mentions = bluesky.fetch_bluesky_mentions()
    except Exception as exc:
        print(f"Aviso: no se pudo consultar Bluesky ({exc}).")
        return
    storage.save_bluesky_mentions(mentions)
    print(f"Bluesky: {len(mentions)} posts nuevos encontrados.")


def preserve_existing_csn_data(events):
    """
    El CSN solo expone sus ~15 sismos mas recientes -- un evento que tuvo
    match en una corrida puede dejar de tenerlo en la siguiente corrida
    simplemente porque ya roto fuera de esa lista, no porque el dato haya
    dejado de ser valido. Como collect.py reconstruye cada evento desde cero
    en cada corrida (para capturar revisiones de USGS), sin esto se perderia
    la intensidad del CSN ya capturada. Se restaura desde lo guardado si la
    corrida actual no encontro un match nuevo.

    Se revalida la distancia al restaurar (no solo al construir el punto por
    primera vez): un match viejo entre el evento y el reporte de SENAPRED
    equivocado (dos sismos distintos el mismo dia, con hora/magnitud
    parecidas) puede haber quedado guardado de una corrida anterior a que
    existiera esta validacion, y sin este chequeo se seguiria preservando
    para siempre.
    """
    stored_by_date = {}
    for event in events:
        if event["intensity_source"] == "csn":
            continue  # ya tiene match fresco de esta corrida
        date_str = event["time"][:10]
        if date_str not in stored_by_date:
            stored_by_date[date_str] = {e["id"]: e for e in storage.load_day(date_str)}
        previous = stored_by_date[date_str].get(event["id"])
        if previous and previous.get("intensity_source") == "csn":
            max_distance_km = _max_intensity_distance_km(event["magnitude"])
            valid_points = [
                p
                for p in previous["dyfi_points"]
                if p.get("lat") is not None
                and _haversine_km(event["lat"], event["lon"], p["lat"], p["lon"]) <= max_distance_km
            ]
            if not valid_points:
                continue  # el match guardado ya no pasa la validacion -- no se preserva
            event["dyfi_points"] = valid_points
            event["intensity_source"] = "csn"
            event["senapred_url"] = previous.get("senapred_url")
            event["csn_informe_url"] = previous.get("csn_informe_url")


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

    enrich_with_senapred_archive(events)
    enrich_with_csn(events)
    preserve_existing_csn_data(events)

    storage.upsert_events(events)
    storage.purge_old(RETENTION_DAYS)
    storage.update_index()
    collect_social_mentions()
    collect_bluesky_mentions()

    print(f"Procesados {len(events)} eventos ({start.date()} a {now.date()}).")


if __name__ == "__main__":
    main()
