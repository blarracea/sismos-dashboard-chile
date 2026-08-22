/* Orquesta la carga de datos y el armado del mapa. */
(async function () {
  const statusEl = document.getElementById("status");
  const alertBanner = document.getElementById("alert-banner");
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

  const showEventDetail = (event) => {
    const localTime = new Date(event.time).toLocaleString("es-CL", {
      timeZone: "America/Santiago",
    });
    detailBody.innerHTML = `
      <dt>Lugar</dt><dd>${event.place || "-"}</dd>
      <dt>Magnitud</dt><dd>${event.magnitude ?? "-"} ${event.mag_type || ""}</dd>
      <dt>Profundidad</dt><dd>${event.depth_km != null ? event.depth_km.toFixed(1) + " km" : "-"}</dd>
      <dt>Hora (Chile)</dt><dd>${localTime}</dd>
      <dt>Intensidad (MMI)</dt><dd>${event.mmi ?? "-"}</dd>
      <dt>Reportes DYFI</dt><dd>${event.felt_reports ?? 0}</dd>
      <dt>Fuente</dt><dd><a href="${event.url}" target="_blank" rel="noopener">USGS</a></dd>
    `;
    detailSection.classList.remove("hidden");
  };

  SismosApp.addEventMarkers(map, events, showEventDetail);

  const relevantEvents = events.filter((e) => e.relevant);
  if (relevantEvents.length > 0) {
    const latest = relevantEvents[relevantEvents.length - 1];
    alertBanner.textContent = `Evento relevante: M${latest.magnitude} — ${latest.place}`;
    alertBanner.classList.remove("hidden");
  }
})();
