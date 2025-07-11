// --- Configuración inicial del mapa ---
const POSICION_INICIAL = [0, 0];
const ZOOM_INICIAL = 3;
const ZOOM_MIN = 3;
const ZOOM_MAX = 18;

const map = L.map("mapa", {
  minZoom: ZOOM_MIN,
  maxZoom: ZOOM_MAX,
  zoomControl: true,
}).setView(POSICION_INICIAL, ZOOM_INICIAL);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

let eventos = [];
let marcadores = [];
let eventosMap = new Map();

let popupAbierto = null;
let evitarAperturaPopup = false;

// Referencias a filtros y elementos UI
const filtros = {
  periodo: document.getElementById("filtroPeriodo"),
  busqueda: document.getElementById("busquedaTitulo"),
  pais: document.getElementById("filtroPais"),
};

const listaEventos = document.getElementById("lista-eventos");
const contadorEventos = document.getElementById("contador-eventos");
const mensajeNoEventos = document.getElementById("mensaje-no-eventos");

const markerCluster = L.markerClusterGroup({
  chunkedLoading: true,
  showCoverageOnHover: false,
  spiderfyOnMaxZoom: true,
});
map.addLayer(markerCluster);

// --- Funciones auxiliares ---

function narrar(texto) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang = 'es-AR';
  window.speechSynthesis.speak(utterance);
}

function showToast(mensaje, duracion = 4000) {
  const toast = document.createElement("div");
  toast.textContent = mensaje;
  toast.className = "toast visible";
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener("transitionend", () => toast.remove());
  }, duracion);
}

// --- Controles personalizados ---

function agregarBotonInicio() {
  const boton = L.control({ position: "topright" });
  boton.onAdd = () => {
    const div = L.DomUtil.create("div", "boton-inicio leaflet-bar leaflet-control");
    div.innerHTML = "↺ Inicio";
    div.title = "Volver a la vista inicial";
    div.style.cursor = "pointer";
    div.onclick = () => {
      window.speechSynthesis.cancel();
      if (popupAbierto) {
        popupAbierto.closePopup();
        popupAbierto = null;
      }
      evitarAperturaPopup = true; // bloquea apertura popup tras inicio
      map.flyTo(POSICION_INICIAL, ZOOM_INICIAL, { duration: 1.2 });
      setTimeout(() => {
        evitarAperturaPopup = false;
      }, 1500);
    };
    return div;
  };
  boton.addTo(map);
}

function agregarBotonDemostracion() {
  const boton = document.createElement("button");
  boton.textContent = "Demostración";
  boton.className = "boton-demostracion";
  Object.assign(boton.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: 1000,
    padding: "10px 16px",
    backgroundColor: "#1976d2",
    color: "white",
    border: "none",
    borderRadius: "5px",
    cursor: "pointer",
    boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
  });
  boton.onclick = () => {
    window.speechSynthesis.cancel();
    if (eventos.length === 0) {
      alert("No hay eventos cargados aún.");
      return;
    }
    const primerEvento = eventos[0];
    const marcador = marcadores.find(m => m.eventoId === primerEvento.id);
    if (marcador) {
      map.flyTo(primerEvento.ubicacion, 8, { duration: 1.5 });
      if (popupAbierto && popupAbierto !== marcador) popupAbierto.closePopup();
      marcador.openPopup();
      popupAbierto = marcador;
    }
  };
  document.body.appendChild(boton);
}

// --- Carga y preparación de datos ---

async function cargarEventos() {
  try {
    document.getElementById("cargando")?.style?.setProperty("display", "block");
    const res = await fetch("eventos.json");
    if (!res.ok) throw new Error("No se pudo cargar eventos.json");
    eventos = await res.json();
    eventosMap = new Map(eventos.map(e => [e.id, e]));
    llenarFiltroPeriodos();
    llenarFiltroPaises();
    crearMarcadores();
    cargarEstadoMapa();
    cargarFiltros();
    actualizarEventos();
    map.setView(POSICION_INICIAL, ZOOM_INICIAL);
    document.getElementById("cargando")?.style?.setProperty("display", "none");
  } catch (err) {
    console.error(err);
    alert("Error al cargar eventos.");
  }
}

function llenarFiltroPeriodos() {
  const periodos = [...new Set(eventos.map(e => e.periodo))].sort();
  filtros.periodo.innerHTML = '<option value="todos">Todos</option>' +
    periodos.map(p => `<option value="${p}">${p}</option>`).join('');
}

function llenarFiltroPaises() {
  const paises = [...new Set(eventos.map(e => e.pais).filter(Boolean))].sort();
  filtros.pais.innerHTML = '<option value="todos">Todos</option>' +
    paises.map(p => `<option value="${p}">${p}</option>`).join('');
}

// --- Marcadores ---

function crearMarcadores() {
  marcadores = eventos.filter(e => Array.isArray(e.ubicacion) && e.ubicacion.length === 2).map(evento => {
    const marker = L.marker(evento.ubicacion);
    marker.eventoId = evento.id;

    marker.bindPopup('', {
      minWidth: 320,
      maxWidth: 360,
      maxHeight: 450,
      autoPan: true,
    });

    marker.on("popupopen", () => {
      if (popupAbierto && popupAbierto !== marker) popupAbierto.closePopup();
      popupAbierto = marker;
      marker.getPopup().setContent(crearPopupContenido(evento));
    });

    marker.on("popupclose", () => {
      if (popupAbierto === marker) popupAbierto = null;
      window.speechSynthesis.cancel();
    });

    marker.on("mouseover", () => {
      if (popupAbierto && popupAbierto !== marker) popupAbierto.closePopup();
      marker.openPopup();
      popupAbierto = marker;
    });

    return marker;
  });

// Eliminar todos los marcadores del mapa para refrescar
marcadores.forEach(m => {
  if (map.hasLayer(m)) {
    map.removeLayer(m);
  }
});

// Agregar todos los marcadores directamente al mapa sin clustering
marcadores.forEach(m => {
  m.addTo(map);
});

}

// --- Crear contenido popup sin imagen ---

function crearPopupContenido(evento) {
  const container = document.createElement("div");
  container.className = "popup-evento";

  container.innerHTML += `
    <h3>${evento.titulo}</h3>
    <p><strong>Fecha:</strong> ${evento.fecha}</p>
    <p><strong>Periodo:</strong> ${evento.periodo}</p>
    <p><strong>País:</strong> ${evento.pais || "Desconocido"}</p>
    <p>${evento.descripcion || ""}</p>
  `;

  if (evento.sabiasQue) {
    const btnSabiasQue = document.createElement("button");
    btnSabiasQue.textContent = "▶️ Escuchar dato curioso";
    btnSabiasQue.className = "boton-sabias-que";
    btnSabiasQue.style.marginTop = "8px";

    btnSabiasQue.onclick = () => {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(evento.sabiasQue);
      utterance.lang = 'es-AR';
      utterance.onend = () => {
        const quiereVerMas = confirm("¿Querés ver más información sobre este evento?");
        if (quiereVerMas) {
          window.open(`evento${evento.id}.html`, "_blank", "noopener");
        }
      };
      window.speechSynthesis.speak(utterance);
    };

    container.appendChild(btnSabiasQue);
  }

  const linkMaps = document.createElement("a");
  linkMaps.href = `https://www.google.com/maps?q=${evento.ubicacion[0]},${evento.ubicacion[1]}`;
  linkMaps.target = "_blank";
  linkMaps.rel = "noopener noreferrer";
  linkMaps.textContent = "📍 Ver en Google Maps";
  linkMaps.style.display = "block";
  linkMaps.style.marginTop = "8px";
  container.appendChild(linkMaps);

  const verMasBtn = document.createElement("a");
  verMasBtn.href = `evento${evento.id}.html`;
  verMasBtn.textContent = "🔎 Ver más";
  verMasBtn.target = "_blank";
  verMasBtn.rel = "noopener noreferrer";
  verMasBtn.className = "boton-ver-mas";
  container.appendChild(verMasBtn);

  return container;
}

// --- Filtros y búsqueda ---

function normalizarTexto(texto) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function filtrarEvento({ titulo, descripcion = "", pais = "", periodo }) {
  const texto = normalizarTexto(filtros.busqueda.value.trim());
  const palabras = texto.split(/\s+/).filter(Boolean);
  const campos = [titulo, descripcion, pais, periodo].map(c => normalizarTexto(c || "")).join(" ");
  const coincideTexto = palabras.every(palabra => campos.includes(palabra));

  const valorPeriodo = filtros.periodo.value;
  const coincidePeriodo = valorPeriodo === "todos" || periodo === valorPeriodo || normalizarTexto(periodo) === normalizarTexto(valorPeriodo);

  const valorPais = filtros.pais.value;
  const coincidePais = valorPais === "todos" || pais === valorPais || normalizarTexto(pais) === normalizarTexto(valorPais);

  return coincidePeriodo && coincideTexto && coincidePais;
}

function actualizarEventos() {
  markerCluster.clearLayers();
  listaEventos.innerHTML = "";

  const filtrados = eventos.filter(filtrarEvento);
  filtrados.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  mensajeNoEventos.hidden = filtrados.length > 0;
  contadorEventos.textContent = `${filtrados.length} evento(s) encontrados. Clic para abrir`;

  const idsVisibles = new Set(filtrados.map(e => e.id));
  const visibles = marcadores.filter(m => idsVisibles.has(m.eventoId));
  visibles.forEach(m => markerCluster.addLayer(m));

  filtrados.forEach(ev => {
    const div = document.createElement("div");
    div.className = "item-lista-evento";
    div.textContent = `${ev.titulo} (${ev.fecha})`;
    div.tabIndex = 0;
    div.setAttribute("role", "button");
    div.onclick = () => abrirEventoEnMapa(ev.id);
    div.onkeypress = (e) => {
      if (e.key === "Enter" || e.key === " ") abrirEventoEnMapa(ev.id);
    };
    listaEventos.appendChild(div);
  });

  const sinFiltroPeriodo = filtros.periodo.value === "todos";
  const sinFiltroPais = filtros.pais.value === "todos";
  const sinFiltroBusqueda = filtros.busqueda.value.trim() === "";

  if (sinFiltroPeriodo && sinFiltroPais && sinFiltroBusqueda) {
    window.speechSynthesis.cancel();
    map.flyTo(POSICION_INICIAL, ZOOM_INICIAL, { duration: 1.2 });
  } else if (filtrados.length > 0) {
    abrirEventoEnMapa(filtrados[0].id);
  }
}

function abrirEventoEnMapa(id) {
  const evento = eventosMap.get(id);
  if (!evento) return;
  const marker = marcadores.find(m => m.eventoId === id);
  if (marker) {
    window.speechSynthesis.cancel();
    map.flyTo(evento.ubicacion, 8, { duration: 1.2 });
    if (popupAbierto && popupAbierto !== marker) popupAbierto.closePopup();
    marker.openPopup();
    popupAbierto = marker;
  }
}

// --- Guardado y carga de estado localStorage ---

function guardarEstadoMapa() {
  const estado = {
    centro: map.getCenter(),
    zoom: map.getZoom(),
  };
  localStorage.setItem("mapaEstado", JSON.stringify(estado));
}

function cargarEstadoMapa() {
  const estadoStr = localStorage.getItem("mapaEstado");
  if (!estadoStr) return;
  try {
    const estado = JSON.parse(estadoStr);
    map.setView([estado.centro.lat, estado.centro.lng], estado.zoom);
  } catch {
    // ignorar
  }
}

function guardarFiltros() {
  const filtrosObj = {
    periodo: filtros.periodo.value,
    busqueda: filtros.busqueda.value,
    pais: filtros.pais.value,
  };
  localStorage.setItem("filtrosEvento", JSON.stringify(filtrosObj));
}

function cargarFiltros() {
  const filtroStr = localStorage.getItem("filtrosEvento");
  if (!filtroStr) return;
  try {
    const f = JSON.parse(filtroStr);
    if (f.periodo && filtros.periodo.querySelector(`option[value="${f.periodo}"]`)) filtros.periodo.value = f.periodo;
    if (f.busqueda !== undefined) filtros.busqueda.value = f.busqueda;
    if (f.pais && filtros.pais.querySelector(`option[value="${f.pais}"]`)) filtros.pais.value = f.pais;
  } catch {
    // ignorar
  }
}

// --- Manejo eventos UI ---

filtros.periodo.onchange = () => {
  guardarFiltros();
  actualizarEventos();
};

filtros.pais.onchange = () => {
  guardarFiltros();
  actualizarEventos();
};

filtros.busqueda.oninput = () => {
  guardarFiltros();
  actualizarEventos();
};

// --- Zoom y popups ---

map.on("zoomend", () => {
  if (map.getZoom() < 7 && popupAbierto) {
    popupAbierto.closePopup();
    popupAbierto = null;
  }
  guardarEstadoMapa();
});

map.on("moveend", guardarEstadoMapa);

// --- Prevención apertura popup tras vuelo inicial ---
map.on("moveend", () => {
  if (evitarAperturaPopup) {
    // impedir abrir popup por zoom o clusters justo después del vuelo inicial
    popupAbierto = null;
  }
});

// --- Inicio ---

agregarBotonInicio();
agregarBotonDemostracion();
cargarEventos();
