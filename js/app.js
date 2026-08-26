/* Orquesta la carga de datos y el armado del mapa. */
(async function () {
  const statusEl = document.getElementById("status");
  const detailPlaceholder = document.getElementById("event-detail-placeholder");
  const detailBody = document.getElementById("event-detail-body");
  const heatToggle = document.getElementById("toggle-heatmap");
  const socialToggle = document.getElementById("toggle-social");
  const socialFeedBody = document.getElementById("social-feed-body");
  const dayPicker = document.getElementById("day-picker");
  const dayTableBody = document.getElementById("day-table-body");

  const map = SismosApp.initMap();

  let events = [];
  try {
    events = await SismosApp.loadRecentEvents(7);
    statusEl.textContent = `${events.length} eventos cargados (ultimos 7 dias).`;
  } catch (err) {
    statusEl.textContent = err.message;
    return;
  }

  const INTENSITY_SOURCE_LABELS = {
    csn: "Centro Sismológico Nacional (Chile)",
    usgs_dyfi: "USGS “Did You Feel It?”",
  };

  // Anillo amarillo que marca cual es el sismo seleccionado (desde la tabla
  // o clickeando un marcador), para ubicarlo de un vistazo en el mapa.
  let selectionMarker = null;
  const highlightEvent = (event) => {
    if (selectionMarker) {
      map.removeLayer(selectionMarker);
      selectionMarker = null;
    }
    if (event.lat == null || event.lon == null) return;
    selectionMarker = L.circleMarker([event.lat, event.lon], {
      radius: 14,
      color: "#ffd400",
      weight: 3,
      fillOpacity: 0,
      className: "selection-ring",
    }).addTo(map);
  };

  const showEventDetail = (event) => {
    highlightEvent(event);
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
    detailPlaceholder.classList.add("hidden");
  };

  const focusEvent = (event) => {
    showEventDetail(event);
    if (event.lat != null && event.lon != null) {
      map.setView([event.lat, event.lon], 7);
    }
  };

  // --- Heatmap de intensidad ---
  const heatLayer = SismosApp.buildHeatLayer(events);
  if (heatLayer) {
    // El contenedor #map recien termina su layout de CSS grid un instante
    // despues de whenReady -- si Leaflet.heat lee el ancho del canvas antes
    // de eso, lee 0 y el canvas queda roto para siempre (no se autocorrige
    // solo). setTimeout (no requestAnimationFrame, que no dispara si la
    // pestana no esta compositando frames) da tiempo a que el layout ya
    // este resuelto. Cada sub-capa (CSN, DYFI) se agrega por separado: si
    // una tira un error, L.LayerGroup no debe cortar el loop y dejar a la
    // otra sin agregar.
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

  SismosApp.addEventMarkers(map, events, showEventDetail);

  // --- Menciones en medios (RSS, no verificado) ---
  let socialLayer = null;
  try {
    const mentions = await SismosApp.loadSocialMentions();
    SismosApp.renderSocialFeed(mentions, socialFeedBody);
    socialLayer = SismosApp.buildSocialMapLayer(mentions);
  } catch (err) {
    socialFeedBody.innerHTML = '<p class="social-feed-empty">No se pudieron cargar las menciones.</p>';
  }
  socialToggle.addEventListener("change", () => {
    if (!socialLayer) return;
    if (socialToggle.checked) {
      socialLayer.addTo(map);
    } else {
      map.removeLayer(socialLayer);
    }
  });

  // --- Tabla "Sismos por dia" ---
  const renderDayTable = async (dateStr) => {
    dayTableBody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
    const dayEvents = await SismosApp.loadDay(dateStr);
    if (dayEvents.length === 0) {
      dayTableBody.innerHTML = '<tr><td colspan="3">Sin sismos registrados ese dia.</td></tr>';
      return;
    }
    dayTableBody.innerHTML = dayEvents
      .slice()
      .reverse()
      .map((event, idx) => {
        const hora = new Date(event.time).toLocaleTimeString("es-CL", {
          timeZone: "America/Santiago",
          hour: "2-digit",
          minute: "2-digit",
        });
        return `<tr data-idx="${idx}"><td>${hora}</td><td>${event.place || "-"}</td><td>${event.magnitude ?? "-"}</td></tr>`;
      })
      .join("");

    dayTableBody.querySelectorAll("tr[data-idx]").forEach((row) => {
      row.addEventListener("click", () => {
        const event = dayEvents.slice().reverse()[Number(row.dataset.idx)];
        focusEvent(event);
      });
    });
  };

  try {
    const range = await SismosApp.loadAvailableDateRange();
    if (range) {
      dayPicker.min = range.min;
      dayPicker.max = range.max;
      dayPicker.value = range.max;
      await renderDayTable(range.max);
    } else {
      dayTableBody.innerHTML = '<tr><td colspan="3">Todavia no hay datos.</td></tr>';
    }
  } catch (err) {
    dayTableBody.innerHTML = '<tr><td colspan="3">No se pudo cargar el listado.</td></tr>';
  }

  dayPicker.addEventListener("change", () => {
    if (dayPicker.value) renderDayTable(dayPicker.value);
  });
})();
