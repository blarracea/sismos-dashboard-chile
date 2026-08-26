/*
 * Capa de intensidad percibida (Mercalli / DYFI) y marcadores de eventos.
 * La escala de color sigue la escala de intensidad de USGS DYFI (I a X+),
 * no la magnitud Richter -- el heatmap usa la intensidad de cada punto
 * reportado por la ciudadania, no la energia liberada en el epicentro.
 */
window.SismosApp = window.SismosApp || {};

// Gradiente estilo "jet" (azul -> cian -> verde -> amarillo -> rojo -> magenta),
// con una franja pareja por cada numero romano de la escala Mercalli (I a X,
// paradas en intensidad/10 = 0.1, 0.2 ... 1.0). Antes las paradas no estaban
// parejas y saltaban III y V, asi que un reporte real de V (ej. La Serena en
// el sismo M4.7 del CSN, consistente con la tabla magnitud/intensidad de
// USGS para M4.0-4.9 -> IV-V) se veia corrido visualmente hacia el VI.
const INTENSITY_GRADIENT = {
  0.1: "#14328c",
  0.2: "#1f6fe0",
  0.3: "#1fb5e0",
  0.4: "#22c7a0",
  0.5: "#6fcf3e",
  0.6: "#c6d823",
  0.7: "#f7b500",
  0.8: "#f2701f",
  0.9: "#e8382a",
  1.0: "#ff2fb0",
};

// DYFI reporta en una grilla densa (decenas de puntos muy juntos, a veces a
// 1 km entre si), asi que un radio grande da un heatmap suave y continuo --
// los puntos se superponen y el difuminado de cada uno se compensa con el
// de los vecinos. El CSN reporta por comuna -- pocos puntos (3-15) muy
// separados, sin superposicion -- si el blur es casi tan grande como el
// radio (poco "nucleo" solido), el pico de cada punto queda diluido y una
// intensidad real III-V se ve casi transparente. Por eso el CSN usa un
// radio chico (para no verse como una mancha gigante) pero con un nucleo
// bien solido (blur bajo en proporcion), para que el color en el centro
// refleje la intensidad real reportada.
const HEAT_STYLE_BY_SOURCE = {
  usgs_dyfi: { radius: 32, blur: 24 },
  csn: { radius: 20, blur: 8 },
};

SismosApp.buildHeatLayer = function (events) {
  const pointsBySource = { usgs_dyfi: [], csn: [] };
  events.forEach((event) => {
    const source = event.intensity_source;
    const bucket = pointsBySource[source];
    if (!bucket) return;
    (event.dyfi_points || []).forEach((p) => {
      if (p.intensity == null) return;
      bucket.push([p.lat, p.lon, Math.min(p.intensity / 10, 1)]);
    });
  });

  const layers = Object.keys(pointsBySource)
    .filter((source) => pointsBySource[source].length > 0)
    .map((source) =>
      L.heatLayer(pointsBySource[source], {
        ...HEAT_STYLE_BY_SOURCE[source],
        max: 1.0,
        // Sin minOpacity, Leaflet.heat usa un piso interno de 0.05 -- un
        // reporte real de intensidad III-V (lo mas comun) queda con una
        // opacidad maxima de ~13%, practicamente invisible. 0.15 lo hace
        // visible sin volver a generar un halo marcado donde no hay dato
        // (el halo grande era con 0.35, ver commit anterior).
        minOpacity: 0.15,
        gradient: INTENSITY_GRADIENT,
      })
    );

  // Sin puntos, Leaflet.heat igual crea su canvas interno y puede tirar un
  // error de consola inofensivo al dibujar con ancho 0 -- mas simple evitar
  // crear capas cuando no hay nada que pintar todavia.
  if (layers.length === 0) return null;
  return L.layerGroup(layers);
};

SismosApp.addEventMarkers = function (map, events, onSelect) {
  // Marcadores chicos: son solo el punto de click para ver el detalle del
  // epicentro, no deben competir visualmente con el heatmap de intensidad.
  const layer = L.layerGroup();
  events.forEach((event) => {
    if (event.lat == null || event.lon == null) return;
    const radius = 1.5 + Math.max(event.magnitude || 0, 0) * 0.55;
    const marker = L.circleMarker([event.lat, event.lon], {
      radius,
      color: "#ffffff",
      fillColor: event.relevant ? "#e74c3c" : "#123a5e",
      fillOpacity: 0.9,
      weight: 0.75,
      className: event.relevant ? "quake-marker--relevant" : "",
    });
    marker.on("click", () => onSelect(event));
    marker.addTo(layer);
  });
  layer.addTo(map);
  return layer;
};
