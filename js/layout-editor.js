/*
 * Modo "Editar diseño": deja arrastrar y redimensionar a mano los 5
 * paneles de sismos-por-dia / detalle / proximamente / redes-en-vivo /
 * menciones-en-medios, para que la persona pruebe posiciones antes de
 * decidir el layout final. El orden y el tamano elegidos quedan en
 * localStorage (por navegador) para sobrevivir a un refresh mientras se
 * esta probando -- no se manda a ningun lado, es solo para experimentar.
 */
(function () {
  const PANEL_SELECTORS = [
    ".day-table",
    ".event-detail",
    ".placeholder-panel",
    ".live-feed",
    ".social-feed",
  ];
  const STORAGE_KEY = "sismos-layout-editor-v1";

  const topRow = document.querySelector(".top-row");
  const bottomRow = document.querySelector(".bottom-row");
  const appMain = document.querySelector(".app-main");
  const toggleBtn = document.getElementById("layout-edit-toggle");
  const resetBtn = document.getElementById("layout-reset-btn");
  if (!topRow || !bottomRow || !appMain || !toggleBtn || !resetBtn) return;

  const panels = PANEL_SELECTORS.map((sel) => document.querySelector(sel)).filter(Boolean);
  if (panels.length === 0) return;

  let editing = false;
  let dragged = null;

  function setEditing(on) {
    editing = on;
    appMain.classList.toggle("layout-editing", on);
    panels.forEach((p) => {
      p.draggable = on;
      p.classList.toggle("layout-editable", on);
    });
    toggleBtn.textContent = on ? "Listo" : "Editar diseño";
    toggleBtn.classList.toggle("is-active", on);
    resetBtn.classList.toggle("hidden", !on);
  }

  // El tamano manual (resize:both en CSS) no dispara un evento propio --
  // se detecta comparando el tamano del panel antes/despues de soltar el
  // mouse, y solo entonces se guarda (evita escribir en localStorage en
  // cada pixel del arrastre).
  function watchResize(panel) {
    panel.addEventListener("mousedown", () => {
      const before = `${panel.offsetWidth}x${panel.offsetHeight}`;
      const onUp = () => {
        window.removeEventListener("mouseup", onUp);
        const after = `${panel.offsetWidth}x${panel.offsetHeight}`;
        if (after !== before) saveLayout();
      };
      window.addEventListener("mouseup", onUp);
    });
  }

  function saveLayout() {
    try {
      const order = [...topRow.children, ...bottomRow.children]
        .filter((el) => panels.includes(el))
        .map((el) => ({
          selector: PANEL_SELECTORS.find((sel) => el.matches(sel)),
          row: el.parentElement === topRow ? "top" : "bottom",
          width: el.style.width || "",
          height: el.style.height || "",
        }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
    } catch (err) {
      // localStorage puede fallar (privado, cuota, etc.) -- no es critico,
      // la persona sigue pudiendo probar posiciones aunque no se guarden.
    }
  }

  function loadLayout() {
    let saved;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch (err) {
      return;
    }
    if (!Array.isArray(saved)) return;
    saved.forEach(({ selector, row, width, height }) => {
      const el = document.querySelector(selector);
      if (!el) return;
      (row === "top" ? topRow : bottomRow).appendChild(el);
      if (width) el.style.width = width;
      if (height) el.style.height = height;
    });
  }

  panels.forEach((panel) => {
    watchResize(panel);

    panel.addEventListener("dragstart", () => {
      dragged = panel;
      panel.classList.add("layout-dragging");
    });
    panel.addEventListener("dragend", () => {
      panel.classList.remove("layout-dragging");
      dragged = null;
    });
    panel.addEventListener("dragover", (e) => {
      if (!editing || !dragged || dragged === panel) return;
      e.preventDefault();
    });
    panel.addEventListener("drop", (e) => {
      if (!editing || !dragged || dragged === panel) return;
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      const before = e.clientX - rect.left < rect.width / 2;
      panel.parentElement.insertBefore(dragged, before ? panel : panel.nextSibling);
      saveLayout();
    });
  });

  [topRow, bottomRow].forEach((row) => {
    row.addEventListener("dragover", (e) => {
      if (!editing || !dragged) return;
      e.preventDefault();
    });
    row.addEventListener("drop", (e) => {
      if (!editing || !dragged || e.target !== row) return;
      e.preventDefault();
      row.appendChild(dragged);
      saveLayout();
    });
  });

  toggleBtn.addEventListener("click", () => setEditing(!editing));

  resetBtn.addEventListener("click", () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      // ver comentario en saveLayout
    }
    location.reload();
  });

  loadLayout();
})();
