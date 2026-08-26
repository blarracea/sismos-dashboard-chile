/* Orquesta la carga de datos y el armado del mapa. */
(async function () {
  const statusEl = document.getElementById("status");
  const detailSection = document.getElementById("event-detail");
  const detailBody = document.getElementById("event-detail-body");
  const heatToggle = document.getElementById("toggle-heatmap");

  const map = SismosApp.initMap();

  let events = [];
  try {
    events = await SismosApp.loadRecentEvents(7);
    statusEl.textContent = `${events.length} eventos cargados (ultimos 7 dias).`;
  } catch (err) {
    statusEl.textContent = err.message;
    return;
  }

  const heatLayer = SismosApp.buildHeatLayer(events);
  if (heatLayer) {
    // Se agrega cada sub-capa (CSN, DYFI) por separado en vez de confiar en
    // heatLayer.addTo(map): si una sub-capa tira un error al agregarse,
    // L.LayerGroup corta el loop interno y la siguiente nunca se agrega --
    // asi una capa rota no se lleva puesta a la otra.
    //
    // Ademas, aunque el mapa ya este "listo" (whenReady), el contenedor
    // #map recien termina su layout de CSS grid un instante despues -- si
    // Leaflet.heat lee el ancho del canvas antes de eso, lee 0 y el canvas
    // queda roto para siempre (no se autocorrige solo, no es cosmetico).
    // setTimeout (no requestAnimationFrame -- no dispara si la pestana no
    // esta compositando frames) da tiempo a que el layout ya este resuelto.
    const addHeatLayer = () => {
      map.invalidateSize();
      setTimeout(() => {
        heatLayer.eachLayer((layer) => {
          try {
            layer.addTo(map);
          } catch (err) {
            console.warn("No se pudo agregar una capa de heatmap", err);
          }
        });
      }, 50);
    };
    map.whenReady(addHeatLayer);
    heatToggle.addEventListener("change", () => {
      if (heatToggle.checked) {
        addHeatLayer();
      } else {
        heatLayer.eachLayer((layer) => map.removeLayer(layer));
      }
    });
  } else {
    heatToggle.checked = false;
    heatToggle.disabled = true;
    heatToggle.closest("label").title = "Todavia no hay reportes DYFI en los eventos cargados.";
  }

  const INTENSITY_SOURCE_LABELS = {
    csn: "Centro Sismológico Nacional (Chile)",
    usgs_dyfi: "USGS “Did You Feel It?”",
  };

  const showEventDetail = (event) => {
    const localTime = new Date(event.time).toLocaleString("es-CL", {
      timeZone: "America/Santiago",
    });
    const intensitySourceLabel = INTENSITY_SOURCE_LABELS[event.intensity_source] || "Sin reportes ciudadanos";
    const fuenteLinks = event.csn_url
      ? `<a href="${event.url}" target="_blank" rel="noopener">USGS</a> · <a href="${event.csn_url}" target="_blank" rel="noopener">CSN</a>`
      : `<a href="${event.url}" target="_blank" rel="noopener">USGS</a>`;
    detailBody.innerHTML = `
      <dt>Lugar</dt><dd>${event.place || "-"}</dd>
      <dt>Magnitud</dt><dd>${event.magnitude ?? "-"} ${event.mag_type || ""}</dd>
      <dt>Profundidad</dt><dd>${event.depth_km != null ? event.depth_km.toFixed(1) + " km" : "-"}</dd>
      <dt>Hora (Chile)</dt><dd>${localTime}</dd>
      <dt>Intensidad (MMI)</dt><dd>${event.mmi ?? "-"}</dd>
      <dt>Fuente de intensidad</dt><dd>${intensitySourceLabel}</dd>
      <dt>Fuente</dt><dd>${fuenteLinks}</dd>
    `;
    detailSection.classList.remove("hidden");
  };

  SismosApp.addEventMarkers(map, events, showEventDetail);
})();
