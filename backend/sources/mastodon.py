"""
Fuente Mastodon -- complementa a Bluesky en el mismo panel "Redes en vivo"
con posts publicos que mencionan las palabras clave del proyecto (ver
keywords.py), en cualquier parte del mundo -- sin filtro geografico, a
pedido del usuario.

A diferencia de Bluesky, Mastodon expone timelines publicas por hashtag
(api/v1/timelines/tag/:hashtag) sin necesitar cuenta ni autenticacion --
no hace falta el manejo de sesion que si requiere sources/bluesky.py.

Mastodon es una red federada, no existe un "buscador global" unico. Se
consulta una sola instancia grande y bien conectada (mastodon.social); su
timeline de cada hashtag agrega lo que esa instancia ya conoce via
federacion, que en la practica cubre una porcion razonable de lo que se
publica con ese hashtag en el resto de la red -- el mismo principio que ya
usa sources/social.py al apoyarse en Google News como agregador en vez de
mantener un feed propio por cada medio.

Mastodon tiene su propio ecosistema de bots de monitoreo sismico mundial
(ej. "monitorsismico", "NCSeismicobserv") que, a diferencia de la familia
de bots de Bluesky, no comparten un formato de texto comun ni un llamado a
la accion estandarizado -- se detectan por cuenta conocida en vez de por
una frase, y se les aplica el mismo umbral de magnitud 5.0+ que a los bots
de Bluesky (ver sources/bluesky.py) para que los sismos grandes se sigan
viendo.
"""
import re
from datetime import datetime, timezone
from html import unescape

import requests

import comuna_coords
import keywords

INSTANCE_DOMAIN = "mastodon.social"
HASHTAG_TIMELINE_URL = f"https://{INSTANCE_DOMAIN}/api/v1/timelines/tag/{{tag}}"
REQUEST_TIMEOUT = 20
POSTS_PER_KEYWORD = 20

# Cuentas conocidas que republican CUALQUIER sismo detectado en el mundo
# (formato libre, sin un patron de texto en comun) -- se dejan pasar solo
# si mencionan un sismo M5.0+, igual que los bots de Bluesky.
MIN_BOT_MAGNITUDE = 5.0
BOT_ACCOUNTS = {"monitorsismico", "ncseismicobserv", "earthquake_monitor", "earthquakebot", "nws_ntwc_bot"}
MAGNITUDE_PATTERNS = [
    re.compile(r"magnitud\s+(\d+(?:[.,]\d+)?)", re.IGNORECASE),
    re.compile(r"\b(?:mb|ml|mlv|mw|md)\s*(\d+(?:\.\d+)?)\b", re.IGNORECASE),
]


def fetch_mastodon_mentions():
    """Una consulta al timeline de cada palabra clave como hashtag, dedupeadas por link."""
    mentions = {}
    for keyword in keywords.KEYWORDS:
        try:
            posts = _fetch_hashtag_timeline(keyword)
        except Exception as exc:
            print(f"Aviso: no se pudo consultar Mastodon para '#{keyword}' ({exc}).")
            continue
        for post in posts:
            mentions[post["link"]] = post
    return list(mentions.values())


def _fetch_hashtag_timeline(tag):
    url = HASHTAG_TIMELINE_URL.format(tag=tag)
    response = requests.get(url, params={"limit": POSTS_PER_KEYWORD}, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    statuses = response.json()

    items = []
    for status in statuses:
        text = _strip_html(status.get("content") or "")
        if not text or not keywords.is_relevant(text):
            continue

        account = status.get("account") or {}
        acct = account.get("acct")
        link = status.get("url")
        if not acct or not link:
            continue

        if _is_bot_account(acct) and (_extract_magnitude(text) or 0) < MIN_BOT_MAGNITUDE:
            continue

        place, coords = comuna_coords.find_known_place(text)

        items.append(
            {
                "platform": "mastodon",
                "link": link,
                "text": text,
                "author_handle": _full_handle(acct),
                "author_name": account.get("display_name") or acct,
                "author_avatar": account.get("avatar"),
                "published": _parse_created_at(status.get("created_at")),
                "like_count": status.get("favourites_count") or 0,
                "keywords_matched": keywords.matched_keywords(text),
                "place": place,
                "lat": coords[0] if coords else None,
                "lon": coords[1] if coords else None,
            }
        )
    return items


def _strip_html(html):
    """El campo "content" de Mastodon viene como HTML (parrafos, links de hashtag)."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _full_handle(acct):
    """Una cuenta LOCAL a la instancia consultada viene sin @instancia (ej.
    "monitorsismico") -- se le agrega la instancia para mostrar un handle
    completo y sin ambiguedad, igual que una cuenta remota ya lo trae."""
    return acct if "@" in acct else f"{acct}@{INSTANCE_DOMAIN}"


def _is_bot_account(acct):
    username = acct.split("@")[0].lower()
    return username in BOT_ACCOUNTS


def _extract_magnitude(text):
    for pattern in MAGNITUDE_PATTERNS:
        match = pattern.search(text)
        if match:
            try:
                return float(match.group(1).replace(",", "."))
            except ValueError:
                continue
    return None


def _parse_created_at(created_at):
    if not created_at:
        return None
    try:
        parsed = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc).isoformat()
