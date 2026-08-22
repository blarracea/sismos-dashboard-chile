"""
Fuente CSN Chile (Centro Sismologico Nacional) -- NO IMPLEMENTADA.

Se investigo si el CSN expone un feed publico JSON/RSS (agosto 2026) y no se
encontro documentacion de una API publica estable: sismologia.cl es un sitio
pensado para personas, no una API. Hacer scraping del sitio seria fragil (se
rompe con cualquier cambio de diseno) y no esta claramente autorizado por
ellos, asi que se deja pendiente en vez de implementarlo a la fuerza.

Si en el futuro consiguen acceso a un feed oficial del CSN, esta es la
funcion que collect.py deberia llamar para sumar esa fuente junto a USGS,
devolviendo eventos con el mismo formato que backend/collect.py arma para
USGS (ver build_event_record).
"""


def fetch_events():
    raise NotImplementedError(
        "Fuente CSN no implementada todavia -- ver el docstring de este modulo."
    )
