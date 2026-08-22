/*
 * Capa de intensidad percibida (Mercalli / DYFI) y marcadores de eventos.
 * La escala de color sigue la escala de intensidad de USGS DYFI (I a X+),
 * no la magnitud Richter -- el heatmap usa la intensidad de cada punto
 * reportado por la ciudadania, no la energia liberada en el epicentro.
 */
window.SismosApp = window.SismosApp || {};

// Gradiente estilo "jet" (azul -> cian -> verde -> amarillo -> rojo -> magenta),
// el mismo look clasico de los mapas de calor de sensores ambientales.
const INTENSITY_GRADIENT = {
  0.0: "#1a3fa0",
  0.2: "#1f8fe0",
  0.4: "#22c7c7",
  0.55: "#3ecb4a",
  0.7: "#d8e023",
  0.82: "#f7b500",
  0.92: "#e8382a",
  1.0: "#ff2fb0",
};

// DYFI reporta en una grilla densa (decenas de puntos muy juntos, a veces a
// 1 km entre si), asi que un radio grande da un heatmap suave y continuo.
// El CSN reporta por comuna -- pocos puntos (10-15) separados por decenas o
// cientos de km -- el mismo radio se ve como una sola mancha gigante en vez
// de distinguir cada comuna, asi que usa un radio bastante mas chico.
const HEAT_STYLE_BY_SOURCE = {
  usgs_dyfi: { radius: 32, blur: 24 },
  csn: { radius: 16, blur: 12 },
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
        minOpacity: 0.35,
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
