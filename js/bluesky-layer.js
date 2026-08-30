/*
 * Panel "Bluesky en vivo" -- posts publicos que mencionan las palabras
 * clave del proyecto (ver backend/sources/bluesky.py). A diferencia de
 * "Menciones en medios" (cobertura de prensa ya redactada, via RSS), esto
 * es gente comentando en el momento: se muestra como un feed tipo chat, sin
 * capa en el mapa (es reaccion espontanea, no un dato geolocalizado
 * confiable como para dibujarlo junto a la intensidad oficial).
 */
window.SismosApp = window.SismosApp || {};

SismosApp.renderBlueskyFeed = function (mentions, container) {
  if (mentions.length === 0) {
    container.innerHTML = '<p class="bluesky-feed-empty">Sin posts recientes.</p>';
    return;
  }

  container.innerHTML = mentions
    .map((m) => {
      const when = m.published ? _timeAgoBsky(new Date(m.published)) : "";
      const avatar = m.author_avatar
        ? `<img class="bluesky-card-avatar" src="${m.author_avatar}" alt="" />`
        : '<span class="bluesky-card-avatar"></span>';
      return `
        <a class="bluesky-card-link" href="${m.link}" target="_blank" rel="noopener">
          <div class="bluesky-card">
            ${avatar}
            <div class="bluesky-card-body">
              <div class="bluesky-card-header">
                <span class="bluesky-card-name">${_escapeHtmlBsky(m.author_name)}</span>
                <span class="bluesky-card-handle">@${_escapeHtmlBsky(m.author_handle)}</span>
                <span class="bluesky-card-time">· ${when}</span>
              </div>
              <p class="bluesky-card-text">${_escapeHtmlBsky(m.text)}</p>
            </div>
          </div>
        </a>
      `;
    })
    .join("");
};

function _timeAgoBsky(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function _escapeHtmlBsky(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}
