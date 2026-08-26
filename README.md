# Monitor de Sismos — Chile y Sudamérica

Dashboard gratuito que muestra sismos recientes de Chile y Sudamérica en un
mapa, con un heatmap de **intensidad percibida (escala Mercalli)** — qué tan
fuerte lo sintió la gente en cada zona, no la magnitud Richter del epicentro.

## Cómo funciona

- **Backend (`backend/`)**: un script Python (`collect.py`) que trae el
  catálogo base de sismos de USGS para toda la región, y la intensidad
  Mercalli percibida de dos fuentes según corresponda: **CSN/SENAPRED**
  como fuente principal para sismos chilenos (tiene mucha más participación
  ciudadana real que USGS en Chile), y **USGS "Did You Feel It?" / DYFI**
  como respaldo — para el resto de Sudamérica, o cuando un sismo chileno no
  tiene reporte del CSN. El dashboard solo muestra sismos con reporte real
  de percepción (deja afuera el catálogo completo de USGS, que incluye
  sismos chicos sin ningún reporte ciudadano). Todo se guarda en
  `data/YYYY-MM-DD.json`, un archivo por día.
- **GitHub Actions (`.github/workflows/collect.yml`)**: corre `collect.py`
  cada 5 minutos (el mínimo real que permite GitHub Actions, ver más abajo),
  sin depender de que nadie tenga el navegador abierto, y hace commit + push
  automático de los archivos que cambiaron en `data/`.
- **Frontend (`index.html`, `css/`, `js/`)**: página estática con un mapa
  Leaflet que **solo lee** los archivos ya guardados en `data/` — nunca llama
  directamente a las APIs externas. Se sirve gratis con GitHub Pages.
- **Retención**: el propio `collect.py` borra los archivos de `data/` con más
  de 30 días de antigüedad en cada corrida.

## Estado de cada fuente de datos

| Fuente | Estado |
|---|---|
| USGS (catálogo de sismos, toda la región) | ✅ Implementada, es la base de todos los eventos |
| CSN/SENAPRED | ✅ Implementada — fuente **principal** de intensidad Mercalli para sismos en Chile. Ninguno de los dos tiene API pública: se lee el archivo propio de SENAPRED (`senapred.cl/eventos/`, retiene semanas de historial) como primera pasada, y la portada del CSN (`sismologia.cl`, solo sus ~15 sismos más recientes) como respaldo para el caso borde de un sismo tan reciente que SENAPRED todavía no indexó. El reporte de intensidad por comuna se lee con Playwright (SENAPRED es una app en React sin API documentada). Ver `backend/sources/csn.py` |
| USGS "Did You Feel It?" / DYFI | ✅ Implementada — fuente **de respaldo**: se usa para el resto de Sudamérica, y para sismos chilenos sin match/reporte en el CSN/SENAPRED |
| Menciones en medios (RSS) | ✅ Implementada — Google News RSS filtrado por palabras clave (agrega Emol, La Tercera, BioBioChile y otros). Es un proxy de "dónde se habla del sismo", no intensidad verificada. Ver `backend/sources/social.py` |

### Cómo se combinan las fuentes de intensidad

Para cada sismo del catálogo de USGS cuyo `place` menciona "Chile", el script
busca primero en el archivo de SENAPRED, y si no lo encuentra ahí, en la
portada del CSN, un evento con hora, ubicación y magnitud parecidas (mismo
sismo, catálogos distintos → sin id en común). Si lo encuentra y fue
reportado como percibido, se usa el reporte de intensidad por comuna
(geocodificado con un set base de comunas + Nominatim como respaldo,
cacheado en `data/comuna_coords_cache.json`). Si no hay match, se usa DYFI
de USGS. Cada evento guarda `intensity_source` (`"csn"`, `"usgs_dyfi"` o
`null`) para saber de dónde salió el dato. **El dashboard solo muestra los
eventos con `intensity_source === "csn"`** — sismos sin reporte real de
percepción no aparecen ni en el mapa ni en la tabla.

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
3. El workflow `.github/workflows/collect.yml` corre cada 5 minutos vía
   cron y también se puede disparar a mano desde la pestaña "Actions" del
   repo (botón "Run workflow"). `concurrency` en el workflow evita que dos
   corridas se pisen si una tarda más de 5 minutos.

## Ajustes comunes

- **Frecuencia de recolección**: cambia el cron `*/5 * * * *` en
  `.github/workflows/collect.yml`. **Importante**: GitHub Actions no permite
  programar workflows más seguido que cada 5 minutos (`*/5` ya es el piso
  real de la plataforma) — cualquier valor menor simplemente no se ejecuta
  a esa cadencia. Además, ir más rápido no aporta mucho: el CSN/SENAPRED
  tarda tiempo real en armar un reporte de intensidad (participación
  ciudadana), y cada corrida ya usa Playwright contra `senapred.cl` (más
  pesado que un simple request) — conviene no exagerar la frecuencia por
  respeto a esos servicios gratuitos de terceros.
- **Rango de días mostrado en el mapa**: cambia el número en
  `SismosApp.loadRecentEvents(7)` dentro de `js/app.js`.
- **Magnitud mínima que se guarda**: constante `MIN_MAGNITUDE` en
  `backend/collect.py`.
- **Umbral para marcar un evento como "relevante"** (resalte visual):
  constantes `RELEVANT_MAGNITUDE` y `RELEVANT_FELT_REPORTS` en
  `backend/collect.py`.
