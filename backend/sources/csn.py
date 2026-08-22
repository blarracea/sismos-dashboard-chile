"""
Fuente CSN Chile (Centro Sismologico Nacional, sismologia.cl) -- fuente
PRIMARIA de intensidad Mercalli para sismos en territorio chileno.

Por que CSN antes que USGS DYFI para Chile: el CSN es la fuente local que
conoce y usa la poblacion chilena para reportar "lo senti", asi que tiene
muchisima mas participacion real que el DYFI de USGS (que ademas esta en
ingles) para eventos chilenos. USGS DYFI queda como respaldo -- se sigue
usando en collect.py cuando un evento chileno no tiene match en CSN, y sigue
siendo la unica fuente de intensidad para el resto de Sudamerica.

Como funciona (investigado navegando el sitio, no hay API publica):
  1. sismologia.cl (la portada) es HTML plano, generado en el servidor, con
     la tabla de "Ultimos sismos". Las filas de sismos reportados como
     percibidos tienen la clase css "percibido" (confirmado en su style.css:
     ".percibido td { font-weight: 700 }" -- el "negrita" que menciona el
     sitio).
  2. Cada fila linkea a un informe individual (tambien HTML plano) con
     lat/lon, hora UTC, profundidad y magnitud exactos.
  3. Si el sismo fue percibido, el informe tiene un boton "Reporte de
     intensidades" que en realidad apunta a SENAPRED (senapred.cl/evento/...),
     no a un endpoint propio del CSN.
  4. La pagina de SENAPRED es una aplicacion React que arma el reporte
     (intensidad Mercalli por comuna) contra una API GraphQL privada de AWS
     (Cognito + AppSync) sin documentacion publica -- no es viable ni
     responsable imitar ese login interno. En cambio, se usa Playwright para
     renderizar la pagina tal como la ve cualquier visitante y leer el texto
     ya mostrado en pantalla (scraping de contenido publico, no de la API
     privada).
"""
import re
import unicodedata
from datetime import datetime, timezone

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://www.sismologia.cl"
REQUEST_TIMEOUT = 30
ROMAN_VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}


def fetch_recent_events():
    """
    Trae la lista de "Ultimos sismos" de la portada del CSN (los ~15 mas
    recientes). Para cada uno: hora local, lugar, profundidad, magnitud,
    link al informe y si fue reportado como percibido.
    """
    response = requests.get(BASE_URL + "/", timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")

    table = soup.find("table", class_="sismologia")
    if table is None:
        return []

    events = []
    for row in table.find_all("tr"):
        link = row.find("a", href=True)
        if link is None:
            continue  # fila de encabezado

        cells = row.find_all("td")
        if len(cells) < 3:
            continue

        place_lines = [line.strip() for line in cells[0].get_text(separator="\n").split("\n") if line.strip()]
        place = place_lines[-1] if place_lines else ""
        depth_text = cells[1].get_text(strip=True)
        magnitude_text = cells[2].get_text(strip=True)

        events.append(
            {
                "csn_url": BASE_URL + link["href"],
                "local_time_text": link.get_text(strip=True),
                "place": place,
                "depth_km": _parse_float(depth_text),
                "magnitude": _parse_float(magnitude_text),
                "felt": "percibido" in (row.get("class") or []),
            }
        )
    return events


def fetch_event_detail(csn_url):
    """
    Trae el informe individual de un sismo del CSN: lat/lon, hora UTC,
    profundidad, magnitud y el link a SENAPRED si fue percibido.
    """
    response = requests.get(csn_url, timeout=REQUEST_TIMEOUT)
    if response.status_code != 200:
        return None
    soup = BeautifulSoup(response.text, "html.parser")

    fields = {}
    for row in soup.find_all("tr"):
        cells = row.find_all("td")
        if len(cells) == 2:
            label = cells[0].get_text(strip=True)
            value = cells[1].get_text(strip=True)
            fields[label] = value

    senapred_link = soup.find("a", class_="boton")
    senapred_url = senapred_link["href"] if senapred_link and senapred_link.has_attr("href") else None

    utc_dt = None
    if fields.get("Hora UTC"):
        utc_dt = datetime.strptime(fields["Hora UTC"], "%H:%M:%S %d/%m/%Y").replace(tzinfo=timezone.utc)

    magnitude, mag_type = _split_magnitude(fields.get("Magnitud"))

    return {
        "place": fields.get("Referencia"),
        "lat": _parse_float(fields.get("Latitud")),
        "lon": _parse_float(fields.get("Longitud")),
        "depth_km": _parse_float(fields.get("Profundidad")),
        "utc_time": utc_dt,
        "magnitude": magnitude,
        "magnitude_type": mag_type,
        "senapred_url": senapred_url,
    }


def fetch_intensity_report(senapred_url):
    """
    Usa un navegador headless (Playwright) para renderizar la pagina de
    SENAPRED -- es una aplicacion React, el contenido no existe en el HTML
    crudo -- y lee la lista de intensidad Mercalli por comuna ya mostrada en
    pantalla. Devuelve [{"comuna", "region", "intensity_roman", "intensity"}].
    """
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            page = browser.new_page()
            page.goto(senapred_url, wait_until="domcontentloaded", timeout=30000)
            # El contenido lo arma React contra su API despues de cargar la
            # pagina -- "networkidle" a veces dispara antes de que termine,
            # asi que se espera a que el texto realmente aparezca en pantalla.
            try:
                page.get_by_text("Mercalli").first.wait_for(timeout=20000)
            except Exception:
                return []  # el sismo no tenia reporte de intensidades (pagina generica)
            text = page.inner_text("body")
        finally:
            browser.close()

    return _parse_intensity_text(text)


def _parse_intensity_text(text):
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    entries = []
    region = None
    i = 0
    while i < len(lines):
        line = lines[i]
        region_match = re.match(r"^Regi[oó]n:\s*(.+)$", line)
        if region_match:
            region = region_match.group(1).strip()
            i += 1
            continue

        if line.endswith(":") and i + 1 < len(lines) and _is_roman_numeral(lines[i + 1]):
            comuna = _strip_format_chars(line[:-1].strip())
            roman = lines[i + 1]
            entries.append(
                {
                    "comuna": comuna,
                    "region": region,
                    "intensity_roman": roman,
                    "intensity": _roman_to_int(roman),
                }
            )
            i += 2
            continue

        i += 1
    return entries


def _strip_format_chars(text):
    """
    SENAPRED inserta guiones invisibles (soft hyphen, categoria Unicode "Cf")
    en nombres largos como sugerencia de corte de linea -- ej. "Ri\xado
    Hurtado" en vez de "Rio Hurtado". Se quitan para no romper el nombre.
    """
    return "".join(c for c in text if unicodedata.category(c) != "Cf")


def _is_roman_numeral(text):
    return bool(re.fullmatch(r"[IVXLCDM]+", text)) and 0 < _roman_to_int(text) <= 12


def _roman_to_int(roman):
    total = 0
    prev = 0
    for char in reversed(roman.upper()):
        value = ROMAN_VALUES.get(char, 0)
        total += -value if value < prev else value
        prev = value
    return total


def _parse_float(text):
    if not text:
        return None
    match = re.search(r"-?\d+(\.\d+)?", text)
    return float(match.group()) if match else None


def _split_magnitude(text):
    if not text:
        return None, None
    match = re.match(r"(-?\d+(\.\d+)?)\s*(\S+)?", text)
    if not match:
        return None, None
    value = float(match.group(1))
    mag_type = match.group(3)
    return value, mag_type
