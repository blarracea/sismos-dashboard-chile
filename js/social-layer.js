/*
 * Capa de menciones en redes/medios -- Fase 2.
 * Es un proxy de "donde se habla del sismo" (RSS via Google News, ver
 * backend/sources/social.py), NO intensidad Mercalli verificada. Por eso
 * el feed y los marcadores del mapa usan un estilo bien distinto al
 * heatmap oficial (morado, marcador hueco) y estan siempre rotulados como
 * "no verificado".
 */
window.SismosApp = window.SismosApp || {};

SismosApp.renderSocialFeed = function (mentions, container) {
  if (mentions.length === 0) {
    container.innerHTML = '<p class="social-feed-empty">Sin menciones recientes.</p>';
    return;
  }

  container.innerHTML = mentions
    .map((m) => {
      const when = m.published
        ? new Date(m.published).toLocaleString("es-CL", { timeZone: "America/Santiago" })
        : "";
      const place = m.place ? `<span class="social-card-place">📍 ${_capitalize(m.place)}</span>` : "";
      return `
        <a class="social-card" href="${m.link}" target="_blank" rel="noopener">
          <p class="social-card-title">${_escapeHtml(m.title)}</p>
          <p class="social-card-meta">${_escapeHtml(m.source || "")} · ${when} ${place}</p>
        </a>
      `;
    })
    .join("");
};

SismosApp.buildSocialMapLayer = function (mentions) {
  const withPlace = mentions.filter((m) => m.lat != null && m.lon != null);
  if (withPlace.length === 0) return null;

  const layer = L.layerGroup();
  withPlace.forEach((m) => {
    const marker = L.circleMarker([m.lat, m.lon], {
      radius: 7,
      color: "#8e44ad",
      weight: 2,
      fillColor: "#8e44ad",
      fillOpacity: 0.15,
      dashArray: "3,3",
    });
    marker.bindTooltip(`${m.title} — no verificado`, { direction: "top" });
    marker.addTo(layer);
  });
  return layer;
};

function _capitalize(text) {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function _escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
