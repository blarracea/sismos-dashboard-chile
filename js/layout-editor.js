/*
 * Modo "Editar diseño": deja arrastrar y redimensionar a mano los 5
 * paneles de sismos-por-dia / detalle / proximamente / redes-en-vivo /
 * menciones-en-medios, para que la persona pruebe posiciones antes de
 * decidir el layout final. El orden y el tamano elegidos quedan en
 * localStorage (por navegador) para sobrevivir a un refresh mientras se
 * esta probando -- no se manda a ningun lado, es solo para experimentar.
 *
 * El arrastre es a mano (mousedown/mousemove/mouseup), no HTML5 drag and
 * drop: la primera version usaba "draggable" sobre todo el panel y era
 * dificil de controlar -- el click se lo comian los elementos de adentro
 * (tabla, links, input de fecha) en vez de iniciar el arrastre. Ahora hay
 * una agarradera fija (".layout-handle", una barra que aparece arriba de
 * cada panel solo en modo edicion) que es el unico lugar desde donde se
 * puede arrastrar, y mientras se arrastra se resalta bien marcado donde
 * va a caer.
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
  const rows = [topRow, bottomRow];
  const appMain = document.querySelector(".app-main");
  const toggleBtn = document.getElementById("layout-edit-toggle");
  const resetBtn = document.getElementById("layout-reset-btn");
  if (!topRow || !bottomRow || !appMain || !toggleBtn || !resetBtn) return;

  const panels = PANEL_SELECTORS.map((sel) => document.querySelector(sel)).filter(Boolean);
  if (panels.length === 0) return;

  let editing = false;
  let dragState = null;

  function makeHandle() {
    const handle = document.createElement("div");
    handle.className = "layout-handle";
    handle.textContent = "⠿⠿ Mover";
    return handle;
  }

  function setEditing(on) {
    editing = on;
    appMain.classList.toggle("layout-editing", on);
    panels.forEach((panel) => {
      panel.classList.toggle("layout-editable", on);
      const existingHandle = panel.querySelector(":scope > .layout-handle");
      if (on && !existingHandle) {
        panel.insertBefore(makeHandle(), panel.firstChild);
      } else if (!on && existingHandle) {
        existingHandle.remove();
      }
    });
    toggleBtn.textContent = on ? "Listo" : "Editar diseño";
    toggleBtn.classList.toggle("is-active", on);
    resetBtn.classList.toggle("hidden", !on);
  }

  // Guarda el tamano manual (resize:both en CSS) -- no dispara un evento
  // propio, asi que se detecta comparando el tamano antes/despues de
  // soltar el mouse en cualquier parte del panel.
  function watchResize(panel) {
    panel.addEventListener("mousedown", (e) => {
      if (!editing || e.target.closest(".layout-handle")) return;
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

  // Bajo el punto (x,y) del mouse: primero busca si hay OTRO panel debajo
  // (para insertarse justo antes de ese), y si no, si hay una fila debajo
  // (para agregarse al final de esa fila -- soltar en un hueco vacio).
  function findDropTarget(x, y) {
    for (const panel of panels) {
      if (panel === dragState.panel) continue;
      const rect = panel.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return panel;
      }
    }
    for (const row of rows) {
      const rect = row.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return row;
      }
    }
    return null;
  }

  function clearDropHighlight() {
    document.querySelectorAll(".layout-drop-target").forEach((el) => el.classList.remove("layout-drop-target"));
  }

  function onMouseMove(e) {
    if (!dragState) return;
    const target = findDropTarget(e.clientX, e.clientY);
    clearDropHighlight();
    if (target) target.classList.add("layout-drop-target");
    dragState.lastTarget = target;
  }

  function onMouseUp(e) {
    if (!dragState) return;
    const { panel } = dragState;
    // No depende solo del ultimo "mousemove" (un drag rapido, con pocos
    // eventos intermedios, podia soltar sin haber actualizado el target
    // nunca) -- se recalcula el destino con la posicion final del mouse.
    const target = findDropTarget(e.clientX, e.clientY);
    clearDropHighlight();
    panel.classList.remove("layout-dragging");
    document.body.classList.remove("layout-dragging-active");
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    dragState = null;

    if (!target) return;
    if (panels.includes(target)) {
      if (target === panel) return;
      target.parentElement.insertBefore(panel, target);
    } else {
      target.appendChild(panel);
    }
    saveLayout();
  }

  function startDrag(panel, e) {
    e.preventDefault();
    dragState = { panel, lastTarget: null };
    panel.classList.add("layout-dragging");
    document.body.classList.add("layout-dragging-active");
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  panels.forEach((panel) => {
    watchResize(panel);
    panel.addEventListener("mousedown", (e) => {
      if (!editing) return;
      if (!e.target.closest(".layout-handle")) return;
      startDrag(panel, e);
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
