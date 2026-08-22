# Monitor de Sismos — Chile y Sudamérica

Dashboard gratuito que muestra sismos recientes de Chile y Sudamérica en un
mapa, con un heatmap de **intensidad percibida (escala Mercalli)** — qué tan
fuerte lo sintió la gente en cada zona, no la magnitud Richter del epicentro.

## Cómo funciona

- **Backend (`backend/`)**: un script Python (`collect.py`) que consulta la
  API pública de USGS (incluido el producto "Did You Feel It?" / DYFI, que
  trae la intensidad Mercalli reportada por la ciudadanía) y guarda los
  eventos en `data/YYYY-MM-DD.json`, un archivo por día.
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
| USGS (sismos + intensidad DYFI) | ✅ Implementada, es la fuente principal |
| CSN Chile | ⛔ No implementada — no se encontró una API pública/RSS documentada, solo el sitio sismologia.cl. Ver `backend/sources/csn.py` |
| Redes sociales (Bluesky) / RSS de medios | ⛔ Fase 2, no implementada — estructura lista en `backend/sources/social.py` y `js/social-layer.js` |

## Correrlo en tu computador

```bash
cd backend
pip install -r requirements.txt
python collect.py
```

> **Windows**: si `python` o `pip` no se reconocen (pasa seguido en Git Bash
> por los alias de Microsoft Store), usa el lanzador `py` en su lugar:
> `py -m pip install -r requirements.txt` y `py collect.py`.

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
