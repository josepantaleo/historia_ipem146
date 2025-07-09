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
let triviaActiva = null;

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

// Función narrar mejorada
function narrar(texto) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel(); // Detener narración previa siempre

  const utterance = new SpeechSynthesisUtterance(texto);
  utterance.lang = 'es-AR';
  window.speechSynthesis.speak(utterance);
}

// Función abrir evento con cancelación de narración previa
function abrirEventoEnMapa(id) {
  const evento = eventosMap.get(id);
  if (!evento) return;
  const marker = marcadores.find(m => m.eventoId === id);
  if (marker) {
    // Detener narración antes de abrir otro popup
    window.speechSynthesis.cancel();

    map.flyTo(evento.ubicacion, 8, { duration: 1.5 });
    if (popupAbierto && popupAbierto !== marker) popupAbierto.closePopup();
    marker.openPopup();
    popupAbierto = marker;
  }
}


function mezclarArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
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
      map.flyTo(POSICION_INICIAL, ZOOM_INICIAL, { duration: 1.2 });
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

    // ** Aquí forzamos la vista a la posición inicial al terminar de cargar eventos **
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
      autoPan: true
    });

    marker.on("popupopen", () => {
      if (popupAbierto && popupAbierto !== marker) popupAbierto.closePopup();
      popupAbierto = marker;
      marker.getPopup().setContent(crearPopupContenido(evento));
    });

    marker.on("popupclose", () => {
      if (popupAbierto === marker) popupAbierto = null;
      if (triviaActiva) {
        triviaActiva.style.display = "none";
        triviaActiva = null;
      }
    });

    marker.on("mouseover", () => {
      if (popupAbierto && popupAbierto !== marker) popupAbierto.closePopup();
      marker.openPopup();
      popupAbierto = marker;
    });

    markerCluster.addLayer(marker);
    return marker;
  });
}

// --- Creación contenido Popup con Trivia ---

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
    const utterance = new SpeechSynthesisUtterance(evento.sabiasQue);
    utterance.lang = 'es-AR';

    utterance.onend = () => {
      const quiereVerMas = confirm("¿Querés ver más información sobre este evento?");
      if (quiereVerMas) {
        window.open(`evento${evento.id}.html`, "_blank", "noopener");
      }
    };

    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  if (evento.media) {
    const img = document.createElement("img");
    img.src = evento.media;
    img.alt = evento.titulo;
    img.className = "imagen-popup";
    Object.assign(img.style, {
      width: "100%",
      height: "auto",
      borderRadius: "8px",
      marginTop: "10px",
    });
    container.appendChild(img);
  }

  // --- Trivia ---
  if (evento.trivias?.length) {
    crearTrivia(container, evento);
  }

  // Link a Google Maps
  const linkMaps = document.createElement("a");
  linkMaps.href = `https://www.google.com/maps?q=${evento.ubicacion[0]},${evento.ubicacion[1]}`;
  linkMaps.target = "_blank";
  linkMaps.rel = "noopener noreferrer";
  linkMaps.textContent = "📍 Ver en Google Maps";
  linkMaps.style.display = "block";
  linkMaps.style.marginTop = "8px";
  container.appendChild(linkMaps);

  // Botón Ver más info
  const verMasBtn = document.createElement("a");
  verMasBtn.href = `evento${evento.id}.html`;
  verMasBtn.textContent = "🔎 Ver más";
  verMasBtn.target = "_blank";
  verMasBtn.rel = "noopener noreferrer";
  verMasBtn.className = "boton-ver-mas";
  container.appendChild(verMasBtn);

  return container;
}

function crearTrivia(container, evento) {
  const triviaDiv = document.createElement("div");
  triviaDiv.className = "trivia-container";
  triviaDiv.style.display = "none";

  const preguntaP = document.createElement("p");
  preguntaP.className = "trivia-pregunta";
  triviaDiv.appendChild(preguntaP);

  const opcionesDiv = document.createElement("div");
  opcionesDiv.className = "trivia-opciones";
  triviaDiv.appendChild(opcionesDiv);

  const btnSiguiente = document.createElement("button");
  btnSiguiente.textContent = "Siguiente pregunta";
  btnSiguiente.className = "boton-siguiente";
  btnSiguiente.style.marginTop = "8px";
  btnSiguiente.disabled = true;
  triviaDiv.appendChild(btnSiguiente);

  const btnResultado = document.createElement("button");
  btnResultado.textContent = "Resultado trivia";
  btnResultado.className = "boton-resultado";
  btnResultado.style.marginTop = "8px";
  btnResultado.style.marginLeft = "10px";
  btnResultado.style.display = "none";
  triviaDiv.appendChild(btnResultado);

  let idx = 0;
  let puntaje = 0;
  let preguntas = evento.trivias.map(t => ({
    pregunta: t.pregunta,
    opciones: [...t.opciones],
    correcta: t.correcta
  }));

  const btnResponder = document.createElement("button");
  btnResponder.textContent = "Responder trivia";
  btnResponder.className = "boton-responder";
  btnResponder.style.marginTop = "12px";

  btnResponder.onclick = () => {
    if (triviaActiva && triviaActiva !== triviaDiv) {
      triviaActiva.style.display = "none";
      triviaActiva.parentElement.querySelector(".boton-responder").style.display = "inline-block";
      triviaActiva.parentElement.querySelector(".boton-resultado").style.display = "none";
    }
    triviaActiva = triviaDiv;

    idx = 0;
    puntaje = 0;
    triviaDiv.style.display = "block";
    btnResponder.style.display = "none";
    btnResultado.style.display = "inline-block";
    mostrarPregunta();
    btnSiguiente.focus();

    // Ajusta la vista para la trivia
    setTimeout(() => {
      if (popupAbierto) {
        const latlng = popupAbierto.getLatLng();
        const desplazado = L.latLng(latlng.lat + 0.25, latlng.lng);
        map.panTo(desplazado, { animate: true });
      }
    }, 100);
  };
  container.appendChild(btnResponder);
  container.appendChild(triviaDiv);

  function mostrarPregunta() {
    if (idx >= preguntas.length) {
      const mensajeFinal = `Trivia finalizada. Obtuviste ${puntaje} de ${preguntas.length} respuestas correctas.`;
      showToast(mensajeFinal);
      narrar(mensajeFinal);
      triviaDiv.style.display = "none";
      btnResponder.style.display = "inline-block";
      btnResultado.style.display = "none";
      return;
    }

    const actual = preguntas[idx];
    preguntaP.textContent = `Pregunta ${idx + 1}: ${actual.pregunta}`;
    narrar(actual.pregunta);
    opcionesDiv.innerHTML = "";
    btnSiguiente.disabled = true;

    actual.opciones.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.textContent = opt;
      btn.className = "trivia-opcion";
      btn.type = "button";
      btn.onclick = () => {
        if (!btnSiguiente.disabled) return; // evita doble clic

        const correcta = actual.opciones[actual.correcta];
        const esCorrecta = opt === correcta;

        if (esCorrecta) puntaje++;

        // Deshabilitar botones y colorear respuestas
        Array.from(opcionesDiv.children).forEach(b => {
          b.disabled = true;
          b.classList.remove("seleccionada");
          if (b.textContent === correcta) b.style.borderColor = "#22c55e";  // verde
          if (b === btn && !esCorrecta) b.style.borderColor = "#dc2626";    // rojo
        });
        btn.classList.add("seleccionada");

        const mensaje = esCorrecta
          ? `¡Muy bien! La respuesta es "${opt}".`
          : `¡Lo siento! La respuesta correcta es "${correcta}".`;
        showToast(mensaje);
        narrar(mensaje);

        btnSiguiente.disabled = false;
        btnSiguiente.focus();
      };
      opcionesDiv.appendChild(btn);
    });

    // Ajusta la vista para la trivia cada vez que aparece pregunta
    setTimeout(() => {
      if (popupAbierto) {
        const latlng = popupAbierto.getLatLng();
        const desplazado = L.latLng(latlng.lat + 0.25, latlng.lng);
        map.panTo(desplazado, { animate: true });
      }
    }, 100);
  }

  btnSiguiente.onclick = () => {
    idx++;
    mostrarPregunta();
  };

  btnResultado.onclick = () => {
    const mensaje = `Llevas ${puntaje} respuestas correctas de ${preguntas.length} preguntas.`;
    showToast(mensaje);
    narrar(mensaje);
  };
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

  // Si NO hay filtros activos (todos en periodo y país, y búsqueda vacía) => resetear vista
  const sinFiltroPeriodo = filtros.periodo.value === "todos";
  const sinFiltroPais = filtros.pais.value === "todos";
  const sinFiltroBusqueda = filtros.busqueda.value.trim() === "";

  if (sinFiltroPeriodo && sinFiltroPais && sinFiltroBusqueda) {
    map.flyTo(POSICION_INICIAL, ZOOM_INICIAL, { duration: 1.2 });
  } else if (filtrados.length > 0) {
    // Hacer foco automático en el primer evento filtrado
    const primerEvento = filtrados[0];
    abrirEventoEnMapa(primerEvento.id);
  }
  if (sinFiltroPeriodo && sinFiltroPais && sinFiltroBusqueda) {
  window.speechSynthesis.cancel();  // Cancela narración activa
  map.flyTo(POSICION_INICIAL, ZOOM_INICIAL, { duration: 1.2 });
} else if (filtrados.length > 0) {
  abrirEventoEnMapa(filtrados[0].id);
}

}

// Filtros (período, país, búsqueda)
Object.values(filtros).forEach(input => {
  input.addEventListener("input", () => {
    guardarFiltros();
    actualizarEventos();
  });
});


function abrirEventoEnMapa(id) {
  const evento = eventosMap.get(id);
  if (!evento) return;
  const marker = marcadores.find(m => m.eventoId === id);
  if (marker) {
    map.flyTo(evento.ubicacion, 8, { duration: 1.5 });
    if (popupAbierto && popupAbierto !== marker) popupAbierto.closePopup();
    marker.openPopup();
    popupAbierto = marker;
  }
}

// --- Guardado y carga estado mapa y filtros ---

function guardarEstadoMapa() {
  const centro = map.getCenter();
  localStorage.setItem("mapa_lat", centro.lat);
  localStorage.setItem("mapa_lng", centro.lng);
  localStorage.setItem("mapa_zoom", map.getZoom());
}

function cargarEstadoMapa() {
  const lat = parseFloat(localStorage.getItem("mapa_lat"));
  const lng = parseFloat(localStorage.getItem("mapa_lng"));
  const zoom = parseInt(localStorage.getItem("mapa_zoom"), 10);
  if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
    map.setView([lat, lng], zoom);
  }
}

function configurarEventosMapa() {
  let debounce;
  map.on("moveend zoomend", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      guardarEstadoMapa();
    }, 500);
  });

  map.on("zoomend", () => {
    if (map.getZoom() >= 8) {
      const visibles = marcadores.filter(m => markerCluster.hasLayer(m));
      if (visibles.length > 0) {
        const primerVisible = visibles[0];
        if (popupAbierto && popupAbierto !== primerVisible) popupAbierto.closePopup();
        primerVisible.openPopup();
        popupAbierto = primerVisible;
      }
    }
  });
}

function guardarFiltros() {
  localStorage.setItem("filtro_periodo", filtros.periodo.value);
  localStorage.setItem("filtro_busqueda", filtros.busqueda.value);
  localStorage.setItem("filtro_pais", filtros.pais.value);
}

function cargarFiltros() {
  const periodo = localStorage.getItem("filtro_periodo");
  const busqueda = localStorage.getItem("filtro_busqueda");
  const pais = localStorage.getItem("filtro_pais");

  if (periodo) filtros.periodo.value = periodo;
  if (busqueda) filtros.busqueda.value = busqueda;
  if (pais) filtros.pais.value = pais;
}

// --- Eventos de filtros ---

Object.values(filtros).forEach(input => {
  input.addEventListener("input", () => {
    guardarFiltros();
    actualizarEventos();
  });
});

// --- Inicialización ---

agregarBotonInicio();
agregarBotonDemostracion();
cargarEventos();
configurarEventosMapa();
