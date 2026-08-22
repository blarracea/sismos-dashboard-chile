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
    map.whenReady(() => heatLayer.addTo(map));
    heatToggle.addEventListener("change", () => {
      if (heatToggle.checked) {
        heatLayer.addTo(map);
      } else {
        map.removeLayer(heatLayer);
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
    detailBody.innerHTML = `
      <dt>Lugar</dt><dd>${event.place || "-"}</dd>
      <dt>Magnitud</dt><dd>${event.magnitude ?? "-"} ${event.mag_type || ""}</dd>
      <dt>Profundidad</dt><dd>${event.depth_km != null ? event.depth_km.toFixed(1) + " km" : "-"}</dd>
      <dt>Hora (Chile)</dt><dd>${localTime}</dd>
      <dt>Intensidad (MMI)</dt><dd>${event.mmi ?? "-"}</dd>
      <dt>Fuente de intensidad</dt><dd>${intensitySourceLabel}</dd>
      <dt>Fuente</dt><dd><a href="${event.url}" target="_blank" rel="noopener">USGS</a></dd>
    `;
    detailSection.classList.remove("hidden");
  };

  SismosApp.addEventMarkers(map, events, showEventDetail);
})();
