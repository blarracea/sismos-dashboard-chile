/*
 * Capa de intensidad percibida (Mercalli / DYFI) y marcadores de eventos.
 * La escala de color sigue la escala de intensidad de USGS DYFI (I a X+),
 * no la magnitud Richter -- el heatmap usa la intensidad de cada punto
 * reportado por la ciudadania, no la energia liberada en el epicentro.
 */
window.SismosApp = window.SismosApp || {};

const INTENSITY_GRADIENT = {
  0.0: "#2ecc71",
  0.3: "#f1c40f",
  0.55: "#e67e22",
  0.75: "#e74c3c",
  1.0: "#8e2de2",
};

SismosApp.buildHeatLayer = function (events) {
  const points = [];
  events.forEach((event) => {
    (event.dyfi_points || []).forEach((p) => {
      if (p.intensity == null) return;
      points.push([p.lat, p.lon, Math.min(p.intensity / 10, 1)]);
    });
  });
  // Sin puntos, Leaflet.heat igual crea su canvas interno y puede tirar un
  // error de consola inofensivo al dibujar con ancho 0 -- mas simple evitar
  // crear la capa cuando no hay nada que pintar todavia.
  if (points.length === 0) return null;
  return L.heatLayer(points, {
    radius: 22,
    blur: 18,
    max: 1.0,
    gradient: INTENSITY_GRADIENT,
  });
};

SismosApp.addEventMarkers = function (map, events, onSelect) {
  const layer = L.layerGroup();
  events.forEach((event) => {
    if (event.lat == null || event.lon == null) return;
    const radius = 3 + Math.max(event.magnitude || 0, 0) * 1.8;
    const marker = L.circleMarker([event.lat, event.lon], {
      radius,
      color: event.relevant ? "#e74c3c" : "#123a5e",
      fillColor: event.relevant ? "#e74c3c" : "#f2a71b",
      fillOpacity: 0.75,
      weight: 1.5,
      className: event.relevant ? "quake-marker--relevant" : "",
    });
    marker.on("click", () => onSelect(event));
    marker.addTo(layer);
  });
  layer.addTo(map);
  return layer;
};
