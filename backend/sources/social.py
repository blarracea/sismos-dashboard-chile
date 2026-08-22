"""
Fuente de redes sociales / RSS de medios -- Fase 2, NO IMPLEMENTADA.

Plan para cuando se implemente (ver README.md):
  1. Partir con RSS de medios chilenos (Emol, La Tercera, BioBioChile) por
     ser mas simple y confiable que buscar en redes sociales.
  2. Sumar Bluesky como mejora, usando su endpoint publico de busqueda
     `app.bsky.feed.searchPosts` (sin API key ni aprobacion).
  3. Cada mencion debe pasar por keywords.matched_keywords() antes de
     guardarse -- solo interesa contenido que mencione sismo/terremoto/
     tsunami/temblor/megaterremoto/destruccion.
  4. La ubicacion no viene geolocalizada: hay que extraer el nombre de
     ciudad/region del texto y geocodificarlo con Nominatim (OpenStreetMap,
     gratuito) para poder ubicarlo en el mapa.

Importante: esta fuente es un proxy de "donde se habla del sismo", no un
dato de intensidad Mercalli verificada. En el frontend debe mostrarse en una
capa separada y claramente rotulada como tal (ver js/social-layer.js).
"""


def fetch_rss_mentions():
    raise NotImplementedError("Fase 2 no implementada todavia -- ver el docstring de este modulo.")


def fetch_bluesky_mentions():
    raise NotImplementedError("Fase 2 no implementada todavia -- ver el docstring de este modulo.")
