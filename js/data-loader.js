/* Carga data/index.json y los archivos diarios que necesita el dashboard. */
window.SismosApp = window.SismosApp || {};

SismosApp.loadRecentEvents = async function (days) {
  const indexResponse = await fetch("data/index.json", { cache: "no-store" });
  if (!indexResponse.ok) {
    throw new Error(
      "No se encontro data/index.json todavia (esperando la primera recoleccion de GitHub Actions)."
    );
  }
  const index = await indexResponse.json();
  const dayFiles = (index.days || []).slice(-days);

  const allEvents = [];
  for (const day of dayFiles) {
    try {
      const response = await fetch(`data/${day}.json`, { cache: "no-store" });
      if (!response.ok) continue;
      const events = await response.json();
      allEvents.push(...events);
    } catch (err) {
      console.warn(`No se pudo cargar data/${day}.json`, err);
    }
  }
  return allEvents;
};

/* Fecha minima/maxima disponibles, segun data/index.json (para el selector de fecha). */
SismosApp.loadAvailableDateRange = async function () {
  const indexResponse = await fetch("data/index.json", { cache: "no-store" });
  if (!indexResponse.ok) return null;
  const index = await indexResponse.json();
  const days = index.days || [];
  if (days.length === 0) return null;
  return { min: days[0], max: days[days.length - 1] };
};

/* Trae los eventos de un dia puntual (para la tabla "Sismos por dia"). */
SismosApp.loadDay = async function (dateStr) {
  const response = await fetch(`data/${dateStr}.json`, { cache: "no-store" });
  if (!response.ok) return [];
  return response.json();
};

/* Menciones recientes en medios (RSS) -- ver js/social-layer.js. */
SismosApp.loadSocialMentions = async function () {
  const response = await fetch("data/social_mentions.json", { cache: "no-store" });
  if (!response.ok) return [];
  return response.json();
};

/* Posts de Bluesky con las palabras clave del proyecto -- ver js/bluesky-layer.js. */
SismosApp.loadBlueskyMentions = async function () {
  const response = await fetch("data/bluesky_mentions.json", { cache: "no-store" });
  if (!response.ok) return [];
  return response.json();
};
