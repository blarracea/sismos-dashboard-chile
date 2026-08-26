/* Mapa base Leaflet centrado en Chile / Sudamerica. */
window.SismosApp = window.SismosApp || {};

SismosApp.initMap = function () {
  const map = L.map("map", {
    // Centrado y con zoom para que Chile se vea como una franja vertical
    // protagonica de entrada (en vez de todo Sudamerica) -- minZoom deja
    // alejar para ver el resto de la region, Antartica incluida.
    center: [-35.5, -71.5],
    zoom: 5,
    minZoom: 3,
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
    maxZoom: 18,
  }).addTo(map);

  return map;
};
