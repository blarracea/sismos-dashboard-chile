/*
 * Panel "Redes en vivo" -- posts publicos de Bluesky y Mastodon que
 * mencionan las palabras clave del proyecto (ver backend/sources/bluesky.py
 * y backend/sources/mastodon.py). A diferencia de "Menciones en medios"
 * (cobertura de prensa ya redactada, via RSS), esto es gente comentando en
 * el momento (mas algunos bots de monitoreo grandes, M5.0+): se muestra
 * como un feed tipo chat, sin capa en el mapa (es reaccion espontanea, no
 * un dato geolocalizado confiable como para dibujarlo junto a la
 * intensidad oficial).
 */
window.SismosApp = window.SismosApp || {};

const PLATFORM_BADGE = {
  bluesky: { icon: "🦋", label: "Bluesky" },
  mastodon: { icon: "🐘", label: "Mastodon" },
};

SismosApp.renderLiveFeed = function (mentions, container) {
  if (mentions.length === 0) {
    container.innerHTML = '<p class="live-feed-empty">Sin posts recientes.</p>';
    return;
  }

  container.innerHTML = mentions
    .map((m) => {
      const when = m.published ? _timeAgoLive(new Date(m.published)) : "";
      const avatar = m.author_avatar
        ? `<img class="live-card-avatar" src="${m.author_avatar}" alt="" />`
        : '<span class="live-card-avatar"></span>';
      const badge = PLATFORM_BADGE[m.platform] || PLATFORM_BADGE.bluesky;
      return `
        <a class="live-card-link" href="${m.link}" target="_blank" rel="noopener">
          <div class="live-card">
            ${avatar}
            <div class="live-card-body">
              <div class="live-card-header">
                <span class="live-card-platform" title="${badge.label}">${badge.icon}</span>
                <span class="live-card-name">${_escapeHtmlLive(m.author_name)}</span>
                <span class="live-card-handle">@${_escapeHtmlLive(m.author_handle)}</span>
                <span class="live-card-time">· ${when}</span>
              </div>
              <p class="live-card-text">${_escapeHtmlLive(m.text)}</p>
            </div>
          </div>
        </a>
      `;
    })
    .join("");
};

function _timeAgoLive(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

function _escapeHtmlLive(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}
