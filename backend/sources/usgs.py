"""
Cliente para la API publica de USGS (Servicio Geologico de EE.UU.).

Trae el catalogo de sismos en un rango de fechas/zona geografica y, para los
eventos con reportes ciudadanos ("Did You Feel It?" / DYFI), trae tambien la
grilla de intensidad Mercalli percibida por zona -- ese es el dato real que
alimenta el heatmap del dashboard (no la magnitud Richter del epicentro).

No requiere API key. Documentacion: https://earthquake.usgs.gov/fdsnws/event/1/
"""
import requests

FEED_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"
REQUEST_TIMEOUT = 30

# Orden de preferencia de las grillas DYFI que publica USGS (mas fina primero).
_GEO_FILE_PREFERENCE = [
    "dyfi_geo_1km.geojson",
    "dyfi_geo_10km.geojson",
    "dyfi_geo_dyfi.geojson",
]


def fetch_events(start_time, end_time, min_magnitude, bbox):
    """Devuelve la lista cruda de features GeoJSON de USGS para el rango/zona dados."""
    params = {
        "format": "geojson",
        "starttime": start_time.strftime("%Y-%m-%dT%H:%M:%S"),
        "endtime": end_time.strftime("%Y-%m-%dT%H:%M:%S"),
        "minmagnitude": min_magnitude,
        "minlatitude": bbox["minlatitude"],
        "maxlatitude": bbox["maxlatitude"],
        "minlongitude": bbox["minlongitude"],
        "maxlongitude": bbox["maxlongitude"],
        "orderby": "time",
    }
    response = requests.get(FEED_URL, params=params, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    return response.json().get("features", [])


def fetch_dyfi_points(detail_url):
    """
    Dado el link de detalle de un evento, busca el producto DYFI y devuelve
    los puntos de intensidad percibida (lat, lon, intensidad) reportados por
    la ciudadania. Si el evento no tiene producto DYFI, devuelve lista vacia.
    """
    if not detail_url:
        return []

    response = requests.get(detail_url, timeout=REQUEST_TIMEOUT)
    if response.status_code != 200:
        return []

    products = response.json().get("properties", {}).get("products", {})
    dyfi_products = products.get("dyfi")
    if not dyfi_products:
        return []

    geo_file = _pick_geo_file(dyfi_products[0].get("contents", {}))
    if not geo_file:
        return []

    geo_response = requests.get(geo_file["url"], timeout=REQUEST_TIMEOUT)
    if geo_response.status_code != 200:
        return []

    points = []
    for feature in geo_response.json().get("features", []):
        props = feature.get("properties", {})
        coords = (feature.get("geometry") or {}).get("coordinates")
        intensity = props.get("cdi") or props.get("intensity")
        if not coords or len(coords) < 2 or intensity is None:
            continue
        points.append(
            {
                "lat": coords[1],
                "lon": coords[0],
                "intensity": intensity,
                "responses": props.get("nresp") or props.get("nresponses"),
            }
        )
    return points


def _pick_geo_file(contents):
    for name in _GEO_FILE_PREFERENCE:
        if name in contents:
            return contents[name]
    for name, value in contents.items():
        if name.startswith("dyfi_geo") and name.endswith(".geojson"):
            return value
    return None
