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
