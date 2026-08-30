"""
Fuente Bluesky -- feed en vivo de posts publicos que mencionan las palabras
clave del proyecto (ver keywords.py).

Bluesky exige sesion iniciada para buscar posts (app.bsky.feed.searchPosts):
se verifico que ni siquiera el sitio oficial bsky.app permite buscar estando
deslogueado ("La busqueda no esta disponible actualmente cuando has cerrado
sesion"). Por eso este modulo inicia sesion en cada corrida con una cuenta de
Bluesky y una "contrasena de aplicacion" (token separado y revocable que se
genera en Configuracion > Contrasenas de aplicacion -- nunca la contrasena
real de la cuenta), leidos desde las variables de entorno BLUESKY_HANDLE y
BLUESKY_APP_PASSWORD (secrets de GitHub Actions, ver
.github/workflows/collect.yml). Si no estan configuradas, esta fuente se
salta sin romper el resto de la recoleccion.

El login se hace contra bsky.social (el PDS por defecto, donde vive la
mayoria de las cuentas). El token resultante es un JWT valido contra
cualquier servicio de la red AT Protocol, asi que la busqueda en si se hace
contra el AppView publico (public.api.bsky.app) con ese token -- es el mismo
camino que usa bsky.app cuando el usuario esta logueado.
"""
import os
from datetime import datetime, timezone

import requests

import comuna_coords
import keywords

LOGIN_URL = "https://bsky.social/xrpc/com.atproto.server.createSession"
SEARCH_URL = "https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts"
REQUEST_TIMEOUT = 20
POSTS_PER_KEYWORD = 25


def fetch_bluesky_mentions():
    """Una busqueda por cada palabra clave, dedupeadas por link al post."""
    handle = os.environ.get("BLUESKY_HANDLE")
    app_password = os.environ.get("BLUESKY_APP_PASSWORD")
    if not handle or not app_password:
        print("Aviso: BLUESKY_HANDLE/BLUESKY_APP_PASSWORD no configurados, se omite Bluesky.")
        return []

    access_jwt = _login(handle, app_password)
    if not access_jwt:
        return []

    mentions = {}
    for keyword in keywords.KEYWORDS:
        try:
            posts = _search_posts(keyword, access_jwt)
        except Exception as exc:
            print(f"Aviso: no se pudo consultar Bluesky para '{keyword}' ({exc}).")
            continue
        for post in posts:
            mentions[post["link"]] = post
    return list(mentions.values())


def _login(handle, app_password):
    try:
        response = requests.post(
            LOGIN_URL,
            json={"identifier": handle, "password": app_password},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        return response.json()["accessJwt"]
    except requests.HTTPError as exc:
        # El cuerpo de la respuesta de AT Protocol trae el motivo real (ej.
        # "Invalid identifier or password") sin exponer la credencial en si.
        detail = exc.response.text[:300] if exc.response is not None else str(exc)
        print(f"Aviso: no se pudo iniciar sesion en Bluesky ({detail}).")
        return None
    except Exception as exc:
        print(f"Aviso: no se pudo iniciar sesion en Bluesky ({exc}).")
        return None


def _search_posts(keyword, access_jwt):
    params = {"q": keyword, "lang": "es", "sort": "latest", "limit": POSTS_PER_KEYWORD}
    headers = {"Authorization": f"Bearer {access_jwt}"}
    response = requests.get(SEARCH_URL, params=params, headers=headers, timeout=REQUEST_TIMEOUT)
    response.raise_for_status()
    data = response.json()

    items = []
    for post in data.get("posts", []):
        text = ((post.get("record") or {}).get("text") or "").strip()
        if not text or not keywords.is_relevant(text):
            continue

        author = post.get("author") or {}
        handle = author.get("handle")
        rkey = (post.get("uri") or "").rsplit("/", 1)[-1]
        if not handle or not rkey:
            continue

        place, coords = comuna_coords.find_known_place(text)

        items.append(
            {
                "link": f"https://bsky.app/profile/{handle}/post/{rkey}",
                "text": text,
                "author_handle": handle,
                "author_name": author.get("displayName") or handle,
                "author_avatar": author.get("avatar"),
                "published": _parse_created_at((post.get("record") or {}).get("createdAt")),
                "like_count": post.get("likeCount") or 0,
                "keywords_matched": keywords.matched_keywords(text),
                "place": place,
                "lat": coords[0] if coords else None,
                "lon": coords[1] if coords else None,
            }
        )
    return items


def _parse_created_at(created_at):
    if not created_at:
        return None
    try:
        parsed = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.astimezone(timezone.utc).isoformat()
