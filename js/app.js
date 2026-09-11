/* Orquesta la carga de datos y el armado del mapa. */
(async function () {
  const statusEl = document.getElementById("status");
  const detailPlaceholder = document.getElementById("event-detail-placeholder");
  const detailBody = document.getElementById("event-detail-body");
  const socialToggle = document.getElementById("toggle-social");
  const socialFeedBody = document.getElementById("social-feed-body");
  const liveFeedBody = document.getElementById("live-feed-body");
  const dayPicker = document.getElementById("day-picker");
  const dayTableBody = document.getElementById("day-table-body");

  // La pagina no se refresca sola por si misma -- sin esto, alguien que deja
  // la pestana abierta nunca ve un sismo nuevo ni una mencion nueva sin
  // recargar a mano. El ciclo re-pide todo lo que cambia con el tiempo
  // (eventos, mapa, ambos feeds, tabla del dia de hoy) sin tocar la vista
  // del mapa ni el detalle que la persona tenga seleccionado.
  //
  // No hay forma de que esta pagina estatica se entere del momento exacto
  // en que GitHub Actions termina una recoleccion (no existe un canal para
  // que el backend le avise al navegador) -- y ademas el ciclo de
  // recoleccion no corre en horario fijo (recolecta, espera 300s, recolecta
  // de nuevo), asi que "a los N segundos de la recoleccion" no es algo a lo
  // que este cliente se pueda sincronizar. En su lugar, se pregunta seguido
  // (cada 60s) si hay datos nuevos -- logra el mismo objetivo real (ver lo
  // nuevo poco despues de que se recolecto) sin depender de un timing exacto.
  const REFRESH_INTERVAL_MS = 60 * 1000;

  const map = SismosApp.initMap();

  // Solo se muestran sismos con reporte de percepcion real del CSN/SENAPRED
  // -- se deja afuera el catalogo completo de USGS (incluye sismos chicos
  // sin ningun reporte ciudadano) y los que solo tienen DYFI de USGS.
  const hasSenapredReport = (event) => event.intensity_source === "csn";

  // Anillo amarillo que marca cual es el sismo seleccionado (desde la tabla
  // o clickeando un marcador), para ubicarlo de un vistazo en el mapa.
  let selectionMarker = null;
  // Capa de intensidad solo del sismo seleccionado -- ver el comentario
  // en showEventDetail, mas abajo, para el problema que resuelve.
  let selectedEventHeatLayer = null;
  // URLs de los sismos que ya estan en el heatmap general (ultimos 7
  // dias) -- si el sismo elegido ya esta ahi, no hace falta (ni conviene)
  // agregarle una segunda capa encima: sus mismos puntos se dibujarian
  // dos veces y esa comuna se veria mas intensa de lo real mientras dure
  // seleccionada.
  let recentEventKeys = new Set();
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

    // El heatmap normal solo tiene los ultimos 7 dias (ver refreshEvents)
    // -- un sismo elegido desde "Sismos por dia" puede ser de cualquier
    // fecha del historial, bastante mas vieja que eso. Sin esto, el
    // detalle se llenaba pero el mapa de calor de ESE sismo (sus
    // intensidades por comuna) nunca aparecia porque sus puntos nunca
    // habian sido cargados. Se arma una capa aparte solo con este evento,
    // independiente de la ventana de 7 dias -- pero solo si hace falta:
    // si el sismo ya esta en la ventana de 7 dias, el heatmap general ya
    // tiene esos mismos puntos pintados, y agregar otra capa encima solo
    // duplicaria la intensidad de esa comuna mientras siga seleccionado.
    if (selectedEventHeatLayer) {
      map.removeLayer(selectedEventHeatLayer);
      selectedEventHeatLayer = null;
    }
    if (!recentEventKeys.has(event.url)) {
      selectedEventHeatLayer = SismosApp.buildHeatLayer([event]);
      if (selectedEventHeatLayer) {
        selectedEventHeatLayer.addTo(map);
      }
    }
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

  // El checkbox #toggle-heatmap sigue en el DOM pero esta oculto (ver
  // index.html) y no hay forma de que la persona lo cambie -- por eso el
  // heatmap general ya no depende de su estado "checked". Antes, si en
  // algun refresco no habia ningun sismo con reporte SENAPRED, el codigo
  // dejaba el checkbox desmarcado para "apagar" el heatmap, pero como
  // nada lo volvia a marcar despues, el mapa de calor general se quedaba
  // apagado para siempre aunque despues sí aparecieran sismos nuevos.
  // Ahora simplemente se muestra cada vez que hay datos, sin ese estado
  // intermedio que nadie puede tocar.

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

    recentEventKeys = new Set(events.map((event) => event.url));

    removeHeatLayer();
    heatLayer = SismosApp.buildHeatLayer(events);
    if (heatLayer) {
      map.whenReady(addHeatLayer);
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

  // --- Redes en vivo (Bluesky + Mastodon, posts con las palabras clave del proyecto) ---
  const refreshLiveFeed = async () => {
    try {
      const mentions = await SismosApp.loadLiveMentions();
      SismosApp.renderLiveFeed(mentions, liveFeedBody);
    } catch (err) {
      liveFeedBody.innerHTML = '<p class="live-feed-empty">No se pudieron cargar los posts.</p>';
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

  await Promise.all([refreshEvents(), refreshSocialFeed(), refreshLiveFeed(), refreshDayTable()]);

  setInterval(() => {
    refreshEvents();
    refreshSocialFeed();
    refreshLiveFeed();
    refreshDayTable();
  }, REFRESH_INTERVAL_MS);
})();
