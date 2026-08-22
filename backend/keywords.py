"""
Utilidades para detectar palabras clave relevantes en texto libre.

Se usa hoy para marcar si el campo "place" de un evento de USGS menciona
alguna palabra clave, y queda lista para filtrar texto de redes sociales /
RSS cuando se implemente la Fase 2 (ver sources/social.py).
"""
import re
import unicodedata

KEYWORDS = [
    "sismo",
    "terremoto",
    "tsunami",
    "temblor",
    "megaterremoto",
    "destruccion",
]


def normalize(text):
    """Pasa a minusculas y quita tildes, para que la busqueda no dependa de acentos."""
    if not text:
        return ""
    text = text.lower()
    text = unicodedata.normalize("NFKD", text)
    return "".join(c for c in text if not unicodedata.combining(c))


def matched_keywords(text):
    normalized = normalize(text)
    return [kw for kw in KEYWORDS if re.search(r"\b" + kw + r"\w*", normalized)]


def is_relevant(text):
    return len(matched_keywords(text)) > 0
