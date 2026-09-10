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
  // mapa cambiaba de ancho. El rectangulo va desde el norte de Chile
  // (Visviri, -17.5) hasta el sur (Cabo de Hornos / Falklands, -56), sin
  // llegar a la Antartica -- este es el encuadre que el usuario confirmo
  // que le acomoda (Chile completo, con Argentina/Bolivia/Paraguay/
  // Uruguay alrededor, sin oceano ni espacio vacio de mas).
  const initialBounds = L.latLngBounds([-17.5, -78], [-56, -53]);

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
