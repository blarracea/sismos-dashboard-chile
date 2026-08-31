/* Orquesta la carga de datos y el armado del mapa. */
(async function () {
  const statusEl = document.getElementById("status");
  const detailPlaceholder = document.getElementById("event-detail-placeholder");
  const detailBody = document.getElementById("event-detail-body");
  const heatToggle = document.getElementById("toggle-heatmap");
  const socialToggle = document.getElementById("toggle-social");
  const socialFeedBody = document.getElementById("social-feed-body");
  const blueskyFeedBody = document.getElementById("bluesky-feed-body");
  const dayPicker = document.getElementById("day-picker");
  const dayTableBody = document.getElementById("day-table-body");

  // La pagina no se refresca sola por si misma -- sin esto, alguien que deja
  // la pestana abierta nunca ve un sismo nuevo ni una mencion nueva sin
  // recargar a mano. El ciclo re-pide todo lo que cambia con el tiempo
  // (eventos, mapa, ambos feeds, tabla del dia de hoy) sin tocar la vista
  // del mapa ni el detalle que la persona tenga seleccionado.
  const REFRESH_INTERVAL_MS = 3 * 60 * 1000;

  const map = SismosApp.initMap();

  // Solo se muestran sismos con reporte de percepcion real del CSN/SENAPRED
  // -- se deja afuera el catalogo completo de USGS (incluye sismos chicos
  // sin ningun reporte ciudadano) y los que solo tienen DYFI de USGS.
  const hasSenapredReport = (event) => event.intensity_source === "csn";

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
    const eventDate = new Date(event.time);
    const timeFormat = {
      hour12: false,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    };
    const utcTime = eventDate.toLocaleString("es-CL", { ...timeFormat, timeZone: "UTC" });
    const chileTime = eventDate.toLocaleString("es-CL", { ...timeFormat, timeZone: "America/Santiago" });
    // USGS es siempre el catalogo base. SENAPRED es el reporte de intensidad
    // en si (lo que realmente se leyo para el heatmap). CSN es el informe
    // propio del evento en sismologia.cl, cuando se pudo encontrar -- son
    // tres paginas distintas, cada link va a la que corresponde de verdad.
    const fuenteParts = [`<a href="${event.url}" target="_blank" rel="noopener">USGS</a>`];
    if (event.senapred_url) {
      fuenteParts.push(`<a href="${event.senapred_url}" target="_blank" rel="noopener">SENAPRED</a>`);
    }
    if (event.csn_informe_url) {
      fuenteParts.push(`<a href="${event.csn_informe_url}" target="_blank" rel="noopener">CSN</a>`);
    }
    const fuenteLinks = fuenteParts.join(" · ");
    detailBody.innerHTML = `
      <dt>Referencia geográfica</dt><dd>${event.place || "-"}</dd>
      <dt>Magnitud</dt><dd>${event.magnitude ?? "-"} ${event.mag_type || ""}</dd>
      <dt>Hora (UTC)</dt><dd>${utcTime}</dd>
      <dt>Hora (Chile)</dt><dd>${chileTime}</dd>
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

  // --- Heatmap de intensidad + marcadores de eventos ---
  let heatLayer = null;
  let markersLayer = null;

  const addHeatLayer = () => {
    if (!heatLayer) return;
    // El contenedor #map recien termina su layout de CSS grid un instante
    // despues de whenReady -- si Leaflet.heat lee el ancho del canvas antes
    // de eso, lee 0 y el canvas queda roto para siempre (no se autocorrige
    // solo). setTimeout (no requestAnimationFrame, que no dispara si la
    // pestana no esta compositando frames) da tiempo a que el layout ya
    // este resuelto. Cada sub-capa (CSN, DYFI) se agrega por separado: si
    // una tira un error, L.LayerGroup no debe cortar el loop y dejar a la
    // otra sin agregar.
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

  const removeHeatLayer = () => {
    if (!heatLayer) return;
    heatLayer.eachLayer((layer) => map.removeLayer(layer));
  };

  heatToggle.addEventListener("change", () => {
    if (heatToggle.checked) {
      addHeatLayer();
    } else {
      removeHeatLayer();
    }
  });

  // Trae los eventos, reconstruye heatmap y marcadores. Se llama al iniciar
  // y despues cada REFRESH_INTERVAL_MS -- no toca el zoom/centro del mapa
  // ni el detalle seleccionado, solo los datos.
  const refreshEvents = async () => {
    let events;
    try {
      const allEvents = await SismosApp.loadRecentEvents(7);
      events = allEvents.filter(hasSenapredReport);
      statusEl.textContent = `${events.length} sismos con reporte de SENAPRED (ultimos 7 dias).`;
    } catch (err) {
      statusEl.textContent = err.message;
      return;
    }

    removeHeatLayer();
    heatLayer = SismosApp.buildHeatLayer(events);
    if (heatLayer) {
      heatToggle.disabled = false;
      heatToggle.closest("label").title = "";
      if (heatToggle.checked) {
        map.whenReady(addHeatLayer);
      }
    } else {
      heatToggle.checked = false;
      heatToggle.disabled = true;
      heatToggle.closest("label").title = "Todavia no hay sismos con reporte de SENAPRED en la ventana cargada.";
    }

    if (markersLayer) map.removeLayer(markersLayer);
    markersLayer = SismosApp.addEventMarkers(map, events, showEventDetail);
  };

  // --- Menciones en medios (RSS, no verificado) ---
  let socialLayer = null;
  socialToggle.addEventListener("change", () => {
    if (!socialLayer) return;
    if (socialToggle.checked) {
      socialLayer.addTo(map);
    } else {
      map.removeLayer(socialLayer);
    }
  });

  const refreshSocialFeed = async () => {
    try {
      const mentions = await SismosApp.loadSocialMentions();
      SismosApp.renderSocialFeed(mentions, socialFeedBody);
      if (socialLayer) map.removeLayer(socialLayer);
      socialLayer = SismosApp.buildSocialMapLayer(mentions);
      if (socialLayer && socialToggle.checked) socialLayer.addTo(map);
    } catch (err) {
      socialFeedBody.innerHTML = '<p class="social-feed-empty">No se pudieron cargar las menciones.</p>';
    }
  };

  // --- Bluesky en vivo (posts publicos con las palabras clave del proyecto) ---
  const refreshBlueskyFeed = async () => {
    try {
      const blueskyMentions = await SismosApp.loadBlueskyMentions();
      SismosApp.renderBlueskyFeed(blueskyMentions, blueskyFeedBody);
    } catch (err) {
      blueskyFeedBody.innerHTML = '<p class="bluesky-feed-empty">No se pudieron cargar los posts.</p>';
    }
  };

  // --- Tabla "Sismos por dia" ---
  const renderDayTable = async (dateStr) => {
    dayTableBody.innerHTML = '<tr><td colspan="3">Cargando...</td></tr>';
    const dayEvents = (await SismosApp.loadDay(dateStr)).filter(hasSenapredReport);
    if (dayEvents.length === 0) {
      dayTableBody.innerHTML = '<tr><td colspan="3">Sin sismos con reporte de SENAPRED ese dia.</td></tr>';
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

  dayPicker.addEventListener("change", () => {
    if (dayPicker.value) renderDayTable(dayPicker.value);
  });

  // Solo re-renderiza la tabla si la persona esta viendo el dia mas
  // reciente -- si esta mirando un dia pasado (que ya no cambia), no la
  // interrumpe ni la saca de ahi cada vez que corre el refresco.
  const refreshDayTable = async () => {
    try {
      const range = await SismosApp.loadAvailableDateRange();
      if (!range) {
        dayTableBody.innerHTML = '<tr><td colspan="3">Todavia no hay datos.</td></tr>';
        return;
      }
      const wasOnLatest = !dayPicker.value || dayPicker.value === dayPicker.max;
      dayPicker.min = range.min;
      dayPicker.max = range.max;
      if (wasOnLatest) {
        dayPicker.value = range.max;
        await renderDayTable(range.max);
      }
    } catch (err) {
      dayTableBody.innerHTML = '<tr><td colspan="3">No se pudo cargar el listado.</td></tr>';
    }
  };

  await Promise.all([refreshEvents(), refreshSocialFeed(), refreshBlueskyFeed(), refreshDayTable()]);

  setInterval(() => {
    refreshEvents();
    refreshSocialFeed();
    refreshBlueskyFeed();
    refreshDayTable();
  }, REFRESH_INTERVAL_MS);
})();
