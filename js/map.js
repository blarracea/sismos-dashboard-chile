/* Mapa base Leaflet centrado en Chile / Sudamerica. */
window.SismosApp = window.SismosApp || {};

SismosApp.initMap = function () {
  const map = L.map("map", {
    minZoom: 3,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(map);

  // Encuadre inicial por bounds (no un centro+zoom fijo): asi Leaflet
  // calcula el zoom que de verdad corresponde al tamano real del
  // contenedor -- un numero de zoom fijo dejaba de calzar cada vez que el
  // mapa cambiaba de ancho (justo lo que se estaba pidiendo ajustar).
  // El rectangulo va desde el norte de Chile (Visviri, -17.5) hasta la
  // peninsula antartica (-70), para que de entrada se vea todo Chile Y la
  // Antartica sin tener que alejar el zoom a mano.
  const initialBounds = L.latLngBounds([-17.5, -80], [-70, -66]);

  // El contenedor #map recien termina su layout de CSS flex un instante
  // despues de crear el mapa (mismo problema que el heatmap en app.js) --
  // si fitBounds calcula el zoom antes de eso, lo hace contra un
  // contenedor de tamano incorrecto y el encuadre sale mal. No se puede
  // envolver esto en whenReady: el mapa nunca dispara "ready" hasta que
  // tiene una vista (center/zoom) asignada, y todavia no le dimos
  // ninguna -- fitBounds es justamente lo que se la da.
  setTimeout(() => {
    map.invalidateSize();
    map.fitBounds(initialBounds);
  }, 50);

  return map;
};
