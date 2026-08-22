"""
Coordenadas (lat, lon) de comunas chilenas, para ubicar en el mapa los
reportes de intensidad Mercalli por comuna que publica SENAPRED (ver
sources/csn.py). SENAPRED entrega el nombre de la comuna, no coordenadas.

Este archivo trae un set base con las capitales regionales y comunas mas
pobladas -- lo suficiente para no depender de una consulta externa en la
mayoria de los reportes. Cualquier comuna que no este aca se geocodifica una
sola vez contra Nominatim (OpenStreetMap, gratuito) y el resultado queda
guardado en data/comuna_coords_cache.json, para no volver a consultarla.
"""
import json
import time
import unicodedata
from pathlib import Path

import requests

CACHE_FILE = Path(__file__).resolve().parent.parent / "data" / "comuna_coords_cache.json"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Nominatim exige un User-Agent identificable y maximo 1 solicitud por segundo.
NOMINATIM_HEADERS = {"User-Agent": "sismos-dashboard-chile/1.0 (github.com/blarracea/sismos-dashboard-chile)"}
NOMINATIM_DELAY_SECONDS = 1.1

# Capitales regionales y comunas grandes, cubren la mayoria de los reportes
# de intensidad de SENAPRED sin necesidad de geocodificar.
SEED_COORDS = {
    "arica": (-18.4783, -70.3126),
    "iquique": (-20.2133, -70.1503),
    "alto hospicio": (-20.2716, -70.1000),
    "antofagasta": (-23.6509, -70.3975),
    "calama": (-22.4667, -68.9333),
    "tocopilla": (-22.0925, -70.1979),
    "copiapo": (-27.3668, -70.3323),
    "vallenar": (-28.5708, -70.7581),
    "la serena": (-29.9027, -71.2519),
    "coquimbo": (-29.9533, -71.3436),
    "ovalle": (-30.6006, -71.1994),
    "illapel": (-31.6335, -71.1697),
    "valparaiso": (-33.0472, -71.6127),
    "vina del mar": (-33.0246, -71.5518),
    "quillota": (-32.8811, -71.2492),
    "san antonio": (-33.5928, -71.6128),
    "los andes": (-32.8339, -70.5983),
    "santiago": (-33.4489, -70.6693),
    "puente alto": (-33.6110, -70.5756),
    "maipu": (-33.5167, -70.7667),
    "la florida": (-33.5241, -70.5978),
    "las condes": (-33.4089, -70.5693),
    "rancagua": (-34.1701, -70.7444),
    "san fernando": (-34.5845, -70.9880),
    "rengo": (-34.4083, -70.8583),
    "talca": (-35.4264, -71.6554),
    "curico": (-34.9828, -71.2394),
    "linares": (-35.8467, -71.5936),
    "chillan": (-36.6066, -72.1034),
    "los angeles": (-37.4694, -72.3533),
    "concepcion": (-36.8270, -73.0503),
    "talcahuano": (-36.7167, -73.1167),
    "coronel": (-37.0333, -73.1500),
    "temuco": (-38.7359, -72.5904),
    "angol": (-37.7986, -72.7147),
    "villarrica": (-39.2833, -72.2167),
    "valdivia": (-39.8142, -73.2459),
    "osorno": (-40.5739, -73.1336),
    "puerto montt": (-41.4693, -72.9424),
    "puerto varas": (-41.3195, -72.9856),
    "castro": (-42.4821, -73.7628),
    "ancud": (-41.8697, -73.8203),
    "coyhaique": (-45.5752, -72.0662),
    "punta arenas": (-53.1638, -70.9171),
    "puerto natales": (-51.7236, -72.5064),
    "andacollo": (-30.2333, -71.0833),
    "paiguano": (-30.0167, -70.6833),
    "rio hurtado": (-30.3667, -70.9833),
    "tongoy": (-30.2578, -71.4864),
    "monte patria": (-30.6947, -70.9600),
    "la higuera": (-29.5000, -71.1500),
    "vicuna": (-30.0319, -70.7081),
    "punitaqui": (-30.7833, -71.2500),
    "alto del carmen": (-28.9667, -70.5333),
}


def _normalize(name):
    name = name.strip().lower()
    name = unicodedata.normalize("NFKD", name)
    # quita tildes (combining) y caracteres invisibles de formato (ej. guion
    # suave que a veces inserta SENAPRED para el corte de linea)
    return "".join(c for c in name if not unicodedata.combining(c) and unicodedata.category(c) != "Cf")


def _load_cache():
    if not CACHE_FILE.exists():
        return {}
    with CACHE_FILE.open("r", encoding="utf-8") as f:
        return json.load(f)


def _save_cache(cache):
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with CACHE_FILE.open("w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2, sort_keys=True)


def _geocode_nominatim(comuna_name):
    params = {
        "q": f"{comuna_name}, Chile",
        "format": "json",
        "limit": 1,
    }
    response = requests.get(NOMINATIM_URL, params=params, headers=NOMINATIM_HEADERS, timeout=15)
    time.sleep(NOMINATIM_DELAY_SECONDS)  # respeta el limite de 1 req/seg de Nominatim
    if response.status_code != 200:
        return None
    results = response.json()
    if not results:
        return None
    return float(results[0]["lat"]), float(results[0]["lon"])


def get_coords(comuna_name):
    """
    Devuelve (lat, lon) para una comuna chilena. Busca primero en el set
    base, despues en el cache local, y como ultimo recurso geocodifica
    contra Nominatim y guarda el resultado en el cache.
    """
    key = _normalize(comuna_name)

    if key in SEED_COORDS:
        return SEED_COORDS[key]

    cache = _load_cache()
    if key in cache:
        return tuple(cache[key])

    coords = _geocode_nominatim(comuna_name)
    if coords is None:
        return None

    cache[key] = coords
    _save_cache(cache)
    return coords
