# Monitor de Sismos — Chile y Sudamérica

Dashboard gratuito que muestra sismos recientes de Chile y Sudamérica en un
mapa, con un heatmap de **intensidad percibida (escala Mercalli)** — qué tan
fuerte lo sintió la gente en cada zona, no la magnitud Richter del epicentro.

## Cómo funciona

- **Backend (`backend/`)**: un script Python (`collect.py`) que trae el
  catálogo base de sismos de USGS para toda la región, y la intensidad
  Mercalli percibida de dos fuentes según corresponda: **CSN Chile
  (sismologia.cl)** como fuente principal para sismos chilenos (tiene mucha
  más participación ciudadana real que USGS en Chile), y **USGS "Did You
  Feel It?" / DYFI** como respaldo — para el resto de Sudamérica, o cuando un
  sismo chileno no tiene reporte en el CSN. Todo se guarda en
  `data/YYYY-MM-DD.json`, un archivo por día.
- **GitHub Actions (`.github/workflows/collect.yml`)**: corre `collect.py`
  cada 30 minutos, sin depender de que nadie tenga el navegador abierto, y
  hace commit + push automático de los archivos que cambiaron en `data/`.
- **Frontend (`index.html`, `css/`, `js/`)**: página estática con un mapa
  Leaflet que **solo lee** los archivos ya guardados en `data/` — nunca llama
  directamente a las APIs externas. Se sirve gratis con GitHub Pages.
- **Retención**: el propio `collect.py` borra los archivos de `data/` con más
  de 30 días de antigüedad en cada corrida.

## Estado de cada fuente de datos

| Fuente | Estado |
|---|---|
| USGS (catálogo de sismos, toda la región) | ✅ Implementada, es la base de todos los eventos |
| CSN Chile (sismologia.cl + SENAPRED) | ✅ Implementada — fuente **principal** de intensidad Mercalli para sismos en Chile. No tiene API pública: se lee su HTML público (sin necesidad de navegador) y, cuando el sismo fue percibido, se renderiza con Playwright el reporte de intensidad por comuna que arma SENAPRED (una app en React sin API documentada). Ver `backend/sources/csn.py` |
| USGS "Did You Feel It?" / DYFI | ✅ Implementada — fuente **de respaldo**: se usa para el resto de Sudamérica, y para sismos chilenos sin match/reporte en el CSN |
| Redes sociales (Bluesky) / RSS de medios | ⛔ Fase 2, no implementada — estructura lista en `backend/sources/social.py` y `js/social-layer.js` |

### Cómo se combinan CSN y DYFI

Para cada sismo del catálogo de USGS cuyo `place` menciona "Chile", el script
busca en la lista de "Últimos sismos" del CSN un evento con hora, ubicación y
magnitud parecidas (mismo sismo, catálogos distintos → sin id en común). Si
lo encuentra y el CSN lo marcó como percibido, se usa el reporte de
intensidad por comuna de SENAPRED (geocodificado con un set base de comunas
+ Nominatim como respaldo, cacheado en `data/comuna_coords_cache.json`). Si
no hay match o el sismo no fue percibido en Chile, se usa DYFI de USGS como
siempre. Cada evento guarda `intensity_source` (`"csn"`, `"usgs_dyfi"` o
`null`) para saber de dónde salió el dato — el panel de detalle del sitio lo
muestra.

## Correrlo en tu computador

```bash
cd backend
pip install -r requirements.txt
python -m playwright install --with-deps chromium
python collect.py
```

> **Windows**: si `python` o `pip` no se reconocen (pasa seguido en Git Bash
> por los alias de Microsoft Store), usa el lanzador `py` en su lugar:
> `py -m pip install -r requirements.txt`, `py -m playwright install chromium`
> y `py collect.py`.

El paso de Playwright descarga Chromium (~150 MB) — solo hace falta una vez;
se usa para leer el reporte de intensidad de SENAPRED cuando un sismo
chileno fue percibido (ver más abajo).

Esto crea/actualiza los archivos en `data/`. Luego, para ver el frontend:

```bash
python -m http.server 8000
```

y abre `http://localhost:8000` en el navegador.

## Cómo queda desplegado

1. El repo vive en GitHub (público, para que Actions y Pages sean 100%
   gratis y sin límites de minutos).
2. GitHub Pages sirve el sitio directamente desde la raíz del repo en la
   rama `main` (Settings → Pages → Branch: main / root).
3. El workflow `.github/workflows/collect.yml` corre cada 30 minutos vía
   cron y también se puede disparar a mano desde la pestaña "Actions" del
   repo (botón "Run workflow").

## Ajustes comunes

- **Frecuencia de recolección**: cambia el cron `*/30 * * * *` en
  `.github/workflows/collect.yml` (por ejemplo `*/15 * * * *` para cada 15
  minutos).
- **Rango de días mostrado en el mapa**: cambia el número en
  `SismosApp.loadRecentEvents(7)` dentro de `js/app.js`.
- **Magnitud mínima que se guarda**: constante `MIN_MAGNITUDE` en
  `backend/collect.py`.
- **Umbral para marcar un evento como "relevante"** (resalte visual):
  constantes `RELEVANT_MAGNITUDE` y `RELEVANT_FELT_REPORTS` en
  `backend/collect.py`.
