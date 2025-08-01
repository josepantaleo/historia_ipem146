// --- Configuración inicial del mapa ---
const POSICION_INICIAL = [-31.7397, -65.0067]; // Coordenadas aproximadas de Mina Clavero, Córdoba, Argentina
const ZOOM_INICIAL = 3;
const ZOOM_MIN = 3;
const ZOOM_MAX = 18; // Nivel de zoom máximo para desagrupar marcadores

// NUEVAS CONSTANTES PARA EL TOUR
const ZOOM_INICIAL_TOUR_LEJOS = 5; // Nivel de zoom inicial (alejado) para el tour
const ZOOM_FINAL_TOUR_CERCANO = 17; // Nivel de zoom final (cercano) para el tour

// Define las diferentes capas base para el control de capas
const osmLayer = L.tileLayer(
  "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  {
    attribution:
      '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }
);

const esriSatLayer = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    attribution:
      "Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
  }
);

const map = L.map("mapa", {
  minZoom: ZOOM_MIN,
  maxZoom: ZOOM_MAX,
  zoomControl: true,
  layers: [osmLayer], // Establece OpenStreetMap como capa inicial por defecto
}).setView(POSICION_INICIAL, ZOOM_INICIAL);

// Agrega el control de capas (permite al usuario cambiar entre mapas)
const baseLayers = {
  "Mapa Callejero": osmLayer,
  "Vista Satelital": esriSatLayer,
};
L.control.layers(baseLayers).addTo(map);

let eventos = [];
let marcadores = []; // Almacena todos los marcadores creados
let eventosMap = new Map(); // Para un acceso rápido a los eventos por ID

let popupAbierto = null; // Guarda la referencia al popup actualmente abierto

// Referencias a filtros y elementos UI (usando constantes para IDs)
const FILTRO_PERIODO_ID = "filtroPeriodo";
const BUSQUEDA_TITULO_ID = "busquedaTitulo";
const FILTRO_PAIS_ID = "filtroPais";
const LISTA_EVENTOS_ID = "lista-eventos";
const CONTADOR_EVENTOS_ID = "contador-eventos";
const MENSAJE_NO_EVENTOS_ID = "mensaje-no-eventos";
const CARGANDO_ID = "cargando";
const BOTON_LIMPIAR_FILTROS_ID = "limpiarFiltros";
const SELECTOR_VOCES_ID = "selectorVoces"; // Nuevo ID para el selector de voces

const filtros = {
  periodo: document.getElementById(FILTRO_PERIODO_ID),
  busqueda: document.getElementById(BUSQUEDA_TITULO_ID),
  pais: document.getElementById(FILTRO_PAIS_ID),
};

const listaEventos = document.getElementById(LISTA_EVENTOS_ID);
const contadorEventos = document.getElementById(CONTADOR_EVENTOS_ID);
const mensajeNoEventos = document.getElementById(MENSAJE_NO_EVENTOS_ID);
const cargandoElement = document.getElementById(CARGANDO_ID);
const botonLimpiarFiltros = document.getElementById(BOTON_LIMPIAR_FILTROS_ID);
const selectorVoces = document.getElementById(SELECTOR_VOCES_ID); // Referencia al nuevo selector

// Configuración de MarkerClusterGroup
const markerCluster = L.markerClusterGroup({
  chunkedLoading: true, // Carga los marcadores en bloques para mejor rendimiento
  showCoverageOnHover: false, // No muestra el área cubierta por el cluster al pasar el mouse
  spiderfyOnMaxZoom: true, // Separa los marcadores en un "spiderfy" al máximo zoom para verlos individualmente
});
map.addLayer(markerCluster); // Agrega el grupo de clusters al mapa

// Variable para almacenar la voz preferida del usuario
let vozSeleccionada = null;
let voicesLoaded = false; // Bandera para saber si las voces ya se cargaron

// Variable global para mantener la referencia a la síntesis de voz actual
let currentUtterance = null;
let isNarrating = false; // Flag para saber si hay una narración en curso

// --- NUEVO: FUNCIONALIDAD DE TOUR Y CONTROLES ADICIONALES ---
let tourEventosDisponibles = []; // Eventos que cumplen con los filtros actuales
let tourIsActive = false; // Bandera para saber si el tour está activo
let tourIsPaused = false; // Nueva bandera para controlar la pausa
let tourCurrentIndex = -1; // Índice del evento actual en el tour
let tourCurrentEventData = null; // Almacena los datos del evento actual para repetición/salto

// Referencias a los nuevos botones de control
let btnTourPlayPause, btnTourSkipNarracion, selectorVelocidadNarracion; // Quitamos btnTourPrev, btnTourNext

/**
 * Agrega un botón "Tour" al mapa para iniciar un recorrido aleatorio por los eventos.
 * Ahora crea un contenedor para todos los controles del tour.
 */
function agregarControlesTour() {
  const TourControls = L.Control.extend({
    onAdd: function (map) {
      const container = L.DomUtil.create("div", "tour-controls leaflet-bar leaflet-control");

      // Botón principal de Tour (Play/Pause)
      btnTourPlayPause = L.DomUtil.create("button", "boton-tour-play-pause", container);
      btnTourPlayPause.textContent = "▶️ Tour";
      btnTourPlayPause.title = "Iniciar/Pausar el tour";
      btnTourPlayPause.onclick = () => {
        if (tourIsActive) {
          pausarReanudarTour();
        } else {
          iniciarTour();
        }
      };

      // Botón Saltar Narración
      btnTourSkipNarracion = L.DomUtil.create("button", "boton-tour-skip-narracion", container);
      btnTourSkipNarracion.textContent = "⏩ Saltar Narración";
      btnTourSkipNarracion.title = "Saltar la narración actual y pasar al siguiente evento";
      btnTourSkipNarracion.disabled = true;
      btnTourSkipNarracion.onclick = () => {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          showToast("Narración actual saltada.");
          // No llamamos a ejecutarSiguientePasoTour() aquí directamente
          // La lógica en narrar.onend o catch se encargará de avanzar.
          // Es importante que el `await narrar(...)` termine o falle para que el `finally` se ejecute.
        } else {
          showToast("No hay narración activa para saltar.");
        }
      };

      // Selector de Velocidad de Narración
      selectorVelocidadNarracion = L.DomUtil.create("select", "selector-velocidad-narracion", container);
      selectorVelocidadNarracion.title = "Cambiar velocidad de narración";
      selectorVelocidadNarracion.innerHTML = `
        <option value="0.7">Lenta</option>
        <option value="1.0" selected>Normal</option>
        <option value="1.3">Rápida</option>
      `;
      selectorVelocidadNarracion.onchange = () => {
        localStorage.setItem("narracionVelocidad", selectorVelocidadNarracion.value);
        showToast(`Velocidad de narración: ${selectorVelocidadNarracion.options[selectorVelocidadNarracion.selectedIndex].text}`);
      };

      // Cargar velocidad de narración guardada
      const savedSpeed = localStorage.getItem("narracionVelocidad");
      if (savedSpeed) {
        selectorVelocidadNarracion.value = savedSpeed;
      }

      L.DomEvent.disableClickPropagation(container); // Evita que clicks en los controles muevan el mapa
      return container;
    },
    onRemove: function (map) {
      // Limpiar si es necesario
    },
  });
  new TourControls({ position: "bottomright" }).addTo(map);
}

/**
 * Inicia el tour de eventos aleatorios.
 */
function iniciarTour() {
  tourEventosDisponibles = eventos.filter(filtrarEvento); // Usa los eventos filtrados
  if (tourEventosDisponibles.length === 0) {
    showToast("No hay eventos disponibles para el tour con los filtros actuales.");
    btnTourPlayPause.textContent = "▶️ Tour";
    btnTourPlayPause.classList.remove("paused");
    return;
  }

  // Mezclar los eventos para un tour aleatorio
  for (let i = tourEventosDisponibles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tourEventosDisponibles[i], tourEventosDisponibles[j]] = [
      tourEventosDisponibles[j],
      tourEventosDisponibles[i],
    ];
  }

  tourCurrentIndex = -1; // Reinicia el índice para empezar desde el primero
  tourIsActive = true; // Activa el flag del tour
  tourIsPaused = false; // Asegura que no esté pausado al inicio
  actualizarEstadoBotonesTour();
  btnTourPlayPause.textContent = "⏸️ Tour";
  btnTourPlayPause.classList.add("paused");
  showToast("Tour iniciado. La narración controlará el avance.");
  ejecutarSiguientePasoTour(); // Ejecuta el primer paso inmediatamente
}

/**
 * Pausa o reanuda el tour.
 */
function pausarReanudarTour() {
  if (tourIsActive) {
    tourIsPaused = !tourIsPaused;
    if (tourIsPaused) {
      window.speechSynthesis.pause();
      btnTourPlayPause.textContent = "▶️ Reanudar";
      btnTourPlayPause.classList.remove("paused");
      showToast("Tour pausado.");
    } else {
      window.speechSynthesis.resume();
      btnTourPlayPause.textContent = "⏸️ Tour";
      btnTourPlayPause.classList.add("paused");
      showToast("Tour reanudado.");
      // Si reanudamos y no hay narración, forzamos el avance si no es el final
      if (!window.speechSynthesis.speaking && tourCurrentIndex < tourEventosDisponibles.length - 1) {
        ejecutarSiguientePasoTour();
      }
    }
    actualizarEstadoBotonesTour();
  }
}

/**
 * Actualiza el estado (habilitado/deshabilitado) de los botones de navegación del tour.
 */
function actualizarEstadoBotonesTour() {
  const tourRunning = tourIsActive && !tourIsPaused;
  // Quitamos la lógica para btnTourPrev y btnTourNext
  btnTourSkipNarracion.disabled = !tourRunning || !isNarrating; // Habilitado solo si está narrando
  selectorVelocidadNarracion.disabled = !tourRunning;
}


/**
 * Ejecuta el siguiente paso del tour: abre el popup del siguiente evento y reproduce su contenido.
 * Se llama recursivamente cuando la narración anterior ha terminado.
 */
async function ejecutarSiguientePasoTour() {
  if (!tourIsActive) {
    // Si el tour fue detenido manualmente, salir
    finalizarTourUI(); // Resetea la UI del tour
    return;
  }

  if (tourIsPaused) {
    // Si el tour está pausado, no avanzamos
    return;
  }

  tourCurrentIndex++;
  if (tourCurrentIndex >= tourEventosDisponibles.length) {
    // Fin del tour
    showToast("Tour finalizado. ¡Gracias por tu recorrido!");
    tourIsActive = false; // Desactiva el tour
    finalizarTourUI(); // Resetea la UI del tour
    return;
  }

  const evento = tourEventosDisponibles[tourCurrentIndex];
  tourCurrentEventData = evento; // Almacenar el evento actual

  if (!evento) {
    console.warn("Evento no encontrado en el tour en el índice:", tourCurrentIndex);
    ejecutarSiguientePasoTour(); // Intenta el siguiente evento si este falla
    return;
  }

  const marcador = marcadores.find((m) => m.eventoId === evento.id);
  if (!marcador) {
    console.warn("Marcador no encontrado para el evento en tour:", evento.id);
    ejecutarSiguientePasoTour(); // Intenta el siguiente evento si este falla
    return;
  }

  // Asegúrate de que cualquier narración anterior se ha cancelado si no fue ya manejado.
  // Y resetear el estado de narración.
  window.speechSynthesis.cancel();
  isNarrating = false;
  actualizarEstadoBotonesTour();

  if (popupAbierto && popupAbierto !== marcador) {
    popupAbierto.closePopup();
    popupAbierto = null;
  }

  // PASO 1: Usar zoomToShowLayer para abrir el clúster y volar a la ubicación del marcador
  markerCluster.zoomToShowLayer(marcador, () => {
    marcador.openPopup();
    popupAbierto = marcador;

    // Pequeño retraso para asegurar que el popup esté completamente renderizado antes de narrar
    setTimeout(async () => {
      const popupContentElement = marcador.getPopup().getContent();
      const verMasBtn = popupContentElement.querySelector(".boton-ver-mas");
      const sabiasQueTextDiv = popupContentElement.querySelector(".sabias-que-texto");

      // 1. Narrar título, fecha, período y país
      const textoBasico = `${evento.titulo}. Ocurrió el ${evento.fecha}, durante el periodo ${evento.periodo}, en ${evento.pais || 'un país desconocido'}.`;

      try {
        isNarrating = true;
        actualizarEstadoBotonesTour();
        await narrar(textoBasico); // Espera a que la narración básica termine

        // 2. Si hay un "Sabías que", narrarlo
        if (evento.sabiasQue && tourIsActive && !tourIsPaused) {
          // Mostrar el texto del sabías que en el popup
          if (sabiasQueTextDiv) {
            sabiasQueTextDiv.style.display = "block";
            sabiasQueTextDiv.classList.add("narrando");
          }

          await narrar(evento.sabiasQue); // Espera a que el "Sabías que" termine

          // Ocultar el texto del sabías que y remover clase de narración
          if (sabiasQueTextDiv) {
            sabiasQueTextDiv.classList.remove("narrando");
            sabiasQueTextDiv.style.display = "none";
          }

          // Animar el botón "Ver más"
          if (verMasBtn) {
            verMasBtn.classList.add("animate-pulse");
            setTimeout(() => {
              verMasBtn.classList.remove("animate-pulse");
            }, 2000);
          }
        }
      } catch (e) {
        console.error("Error o interrupción en la narración del tour:", e);
      } finally {
        isNarrating = false; // La narración de este evento ha terminado
        actualizarEstadoBotonesTour();
        // SIEMPRE AVANZAR SI EL TOUR ESTÁ ACTIVO Y NO PAUSADO
        // Esto es crucial: después de que un evento ha terminado de narrarse (o fue interrumpido
        // y el "catch" o "finally" se ejecutan), avanzamos al siguiente solo si el tour
        // no ha sido detenido o pausado *manualmente* durante la narración de este evento.
        if (tourIsActive && !tourIsPaused) {
          ejecutarSiguientePasoTour();
        }
      }
    }, 100); // Pequeño retraso para asegurar que el popup esté completamente renderizado
  });
}

/**
 * Resetea la UI de los botones del tour cuando este finaliza o se detiene.
 */
function finalizarTourUI() {
  tourIsActive = false;
  tourIsPaused = false;
  isNarrating = false;
  btnTourPlayPause.textContent = "▶️ Tour";
  btnTourPlayPause.classList.remove("paused");
  actualizarEstadoBotonesTour(); // Deshabilita los botones de navegación
  tourCurrentEventData = null; // Limpia el evento actual
}

// --- Funciones auxiliares ---

/**
 * Carga las voces disponibles para la síntesis de voz.
 * @returns {Promise<SpeechSynthesisVoice[]>} Una promesa que resuelve con un array de voces.
 */
function cargarVoces() {
  return new Promise((resolve) => {
    if (voicesLoaded) {
      // Si ya se cargaron, resolver inmediatamente
      resolve(window.speechSynthesis.getVoices());
      return;
    }

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        voicesLoaded = true;
        resolve(voices);
      }
    };

    // Si las voces no están cargadas inmediatamente, esperar el evento onvoiceschanged
    window.speechSynthesis.onvoiceschanged = () => {
      loadVoices(); // Intenta cargar de nuevo cuando las voces cambien
    };

    // Un intento inicial por si ya están disponibles
    loadVoices();
  });
}

/**
 * Narra un texto utilizando la API de SpeechSynthesis.
 * @param {string} texto - El texto a narrar.
 * @returns {Promise<void>} Una promesa que se resuelve cuando la narración ha terminado o se rechaza si hay un error.
 */
async function narrar(texto) {
  return new Promise(async (resolve, reject) => {
    if (!("speechSynthesis" in window)) {
      console.warn("SpeechSynthesis API no soportada en este navegador.");
      showToast("Tu navegador no soporta la narración de voz.", 4000);
      return reject(new Error("SpeechSynthesis API no soportada."));
    }

    const utterance = new SpeechSynthesisUtterance(texto);
    currentUtterance = utterance; // Actualiza la referencia a la locución actual

    if (vozSeleccionada) {
      utterance.voice = vozSeleccionada;
      utterance.lang = vozSeleccionada.lang;
    } else {
      const voices = await cargarVoces();
      const esArVoice = voices.find((voice) => voice.lang === "es-AR");
      const esEsVoice = voices.find((voice) => voice.lang === "es-ES");
      const esMxVoice = voices.find((voice) => voice.lang === "es-MX");
      const defaultEsVoice = voices.find((voice) =>
        voice.lang.startsWith("es")
      );

      if (esArVoice) {
        utterance.voice = esArVoice;
        utterance.lang = "es-AR";
      } else if (esEsVoice) {
        utterance.voice = esEsVoice;
        utterance.lang = "es-ES";
      } else if (esMxVoice) {
        utterance.voice = esMxVoice;
        utterance.lang = "es-MX";
      } else if (defaultEsVoice) {
        utterance.voice = defaultEsVoice;
        utterance.lang = defaultEsVoice.lang;
      } else {
        console.warn(
          "No se encontró una voz en español. Usando la voz predeterminada del sistema."
        );
        utterance.lang = "es";
      }
    }

    // Set narration speed
    const savedSpeed = localStorage.getItem("narracionVelocidad") || "1.0";
    utterance.rate = parseFloat(savedSpeed);


    utterance.onend = () => {
      resolve();
    };

    utterance.onerror = (event) => {
      console.error("Error en la narración:", event.error);
      showToast("Error en la narración de voz.", 4000);
      reject(new Error(`Error de narración: ${event.error}`));
    };

    window.speechSynthesis.speak(utterance);
  });
}

/**
 * Narra el título, descripción y "Sabías que" de un evento.
 * Útil para la función "Repetir Narración".
 * @param {object} evento - El objeto evento a narrar.
 */
async function narrarEventoCompleto(evento) {
  if (!evento) return;

  window.speechSynthesis.cancel();
  isNarrating = true;
  actualizarEstadoBotonesTour(); // Habilitar "Saltar narración"

  let fullText = `${evento.titulo}. ${evento.descripcion || ''}.`;
  if (evento.sabiasQue) {
    fullText += ` Dato curioso: ${evento.sabiasQue}.`;
  }

  try {
    await narrar(fullText);
  } catch (error) {
    console.error("Error al narrar evento completo:", error);
  } finally {
    isNarrating = false;
    actualizarEstadoBotonesTour(); // Deshabilitar "Saltar narración"
  }
}

/**
 * Muestra un mensaje de "toast" temporal en la interfaz.
 * @param {string} mensaje - El mensaje a mostrar.
 * @param {number} [duracion=4000] - Duración en milisegundos que el toast será visible.
 */
function showToast(mensaje, duracion = 4000) {
  const toast = document.createElement("div");
  toast.textContent = mensaje;
  toast.className = "toast";
  document.body.appendChild(toast);

  void toast.offsetWidth; // Forzar un reflow para asegurar que la transición se aplique
  toast.classList.add("visible");

  setTimeout(() => {
    toast.classList.remove("visible");
    toast.addEventListener("transitionend", () => toast.remove(), {
      once: true,
    });
  }, duracion);
}

// --- Controles Personalizados ---

/**
 * Agrega un botón "Inicio" al mapa para volver a la vista inicial.
 */
function agregarBotonInicio() {
  const boton = L.control({ position: "topright" });
  boton.onAdd = () => {
    const div = L.DomUtil.create(
      "div",
      "boton-inicio leaflet-bar leaflet-control"
    );
    div.innerHTML = "↺ Inicio";
    div.title = "Volver a la vista inicial del mapa";
    div.style.cursor = "pointer";
    div.onclick = () => {
      window.speechSynthesis.cancel();
      if (popupAbierto) {
        popupAbierto.closePopup();
        popupAbierto = null;
      }
      // Detener el tour si está activo
      if (tourIsActive) {
        finalizarTourUI();
      }
      map.flyTo(POSICION_INICIAL, ZOOM_INICIAL, { duration: 2.2 });
    };
    L.DomEvent.disableClickPropagation(div);
    return div;
  };
  boton.addTo(map);
}

/**
 * Agrega un botón de "Demostración" para mostrar el primer evento cargado.
 */
function agregarBotonDemostracion() {
  const CustomControl = L.Control.extend({
    onAdd: function (map) {
      const button = L.DomUtil.create(
        "button",
        "boton-demostracion leaflet-bar leaflet-control"
      );
      button.textContent = "Demostración";
      button.title = "Mostrar el primer evento cargado";
      button.onclick = () => {
        window.speechSynthesis.cancel();
        // Detener el tour si está activo
        if (tourIsActive) {
          finalizarTourUI();
        }
        if (eventos.length === 0) {
          showToast("No hay eventos cargados para la demostración.");
          return;
        }
        abrirEventoEnMapa(eventos[0].id);
      };
      L.DomEvent.disableClickPropagation(button);
      return button;
    },
    onRemove: function (map) {
      // Limpiar si es necesario (e.g., remover listeners)
    },
  });
  new CustomControl({ position: "bottomright" }).addTo(map);
}

// --- Carga y Preparación de Datos ---

/**
 * Carga los eventos desde un archivo JSON, prepara los filtros y crea los marcadores.
 */
async function cargarEventos() {
  try {
    if (cargandoElement) cargandoElement.style.setProperty("display", "block");

    const res = await fetch("eventos.json");
    if (!res.ok)
      throw new Error(`Error al cargar eventos.json: ${res.statusText}`);
    eventos = await res.json();
    eventosMap = new Map(eventos.map((e) => [e.id, e]));

    llenarFiltroPeriodos();
    llenarFiltroPaises();
    crearMarcadores();
    cargarEstadoMapa();
    cargarFiltros();
    actualizarEventos();

    // --- NUEVO: Agregar los controles de tour al cargar los eventos ---
    agregarControlesTour();
    // --- FIN NUEVO ---

    if (map.getZoom() < ZOOM_MIN || map.getZoom() > ZOOM_MAX) {
      map.setView(POSICION_INICIAL, ZOOM_INICIAL);
    }
  } catch (err) {
    console.error("Error en cargarEventos:", err);
    showToast("Error al cargar eventos. Por favor, recarga la página.", 6000);
  } finally {
    if (cargandoElement) cargandoElement.style.setProperty("display", "none");
  }
}

/**
 * Rellena el select de filtro de períodos con los períodos únicos de los eventos.
 */
function llenarFiltroPeriodos() {
  const periodos = [...new Set(eventos.map((e) => e.periodo))].sort();
  filtros.periodo.innerHTML =
    '<option value="todos">Todos</option>' +
    periodos.map((p) => `<option value="${p}">${p}</option>`).join("");
}

/**
 * Rellena el select de filtro de países con los países únicos de los eventos.
 */
function llenarFiltroPaises() {
  const paises = [
    ...new Set(eventos.map((e) => e.pais).filter(Boolean)),
  ].sort();
  filtros.pais.innerHTML =
    '<option value="todos">Todos</option>' +
    paises.map((p) => `<option value="${p}">${p}</option>`).join("");
}

/**
 * Rellena el selector de voces con las voces disponibles.
 */
async function popularSelectorVoces() {
  if (!selectorVoces) return;

  selectorVoces.innerHTML = '<option value="">Automática (Sistema)</option>'; // Opción por defecto

  if (!("speechSynthesis" in window)) {
    selectorVoces.disabled = true;
    selectorVoces.innerHTML =
      '<option value="">Narración no soportada</option>';
    return;
  }

  const voices = await cargarVoces();
  const spanishVoices = voices.filter((voice) => voice.lang.startsWith("es"));

  if (spanishVoices.length > 0) {
    spanishVoices.forEach((voice) => {
      const option = document.createElement("option");
      option.value = voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      selectorVoces.appendChild(option);
    });

    selectorVoces.addEventListener("change", () => {
      const selectedVoiceName = selectorVoces.value;
      if (selectedVoiceName === "") {
        vozSeleccionada = null; // Vuelve a la selección automática
      } else {
        vozSeleccionada = voices.find(
          (voice) => voice.name === selectedVoiceName
        );
      }
      localStorage.setItem("vozPreferida", selectedVoiceName); // Guarda la preferencia del usuario
      showToast(
        `Voz de narración cambiada a: ${selectedVoiceName || "Automática"}`
      );
    });

    // Cargar la preferencia de voz guardada
    const savedVoiceName = localStorage.getItem("vozPreferida");
    if (savedVoiceName) {
      selectorVoces.value = savedVoiceName;
      vozSeleccionada = voices.find((voice) => voice.name === savedVoiceName);
      if (!vozSeleccionada) {
        // Si la voz guardada no está disponible (ej. en otro navegador)
        selectorVoces.value = "";
        localStorage.removeItem("vozPreferida");
      }
    }
  } else {
    selectorVoces.disabled = true;
    selectorVoces.innerHTML =
      '<option value="">No hay voces en español disponibles</option>';
  }
}

// --- Marcadores ---

/**
 * Crea los marcadores de Leaflet para cada evento y los prepara para el clustering.
 */
function crearMarcadores() {
  marcadores = eventos
    .filter((e) => {
      const isValidLocation =
        Array.isArray(e.ubicacion) &&
        e.ubicacion.length === 2 &&
        typeof e.ubicacion[0] === "number" &&
        typeof e.ubicacion[1] === "number";
      if (!isValidLocation) {
        console.warn(
          `Evento "${e.titulo}" (ID: ${e.id}) omitido: Ubicación inválida.`,
          e.ubicacion
        );
      }
      return isValidLocation;
    })
    .map((evento) => {
      const marker = L.marker(evento.ubicacion);
      marker.eventoId = evento.id;

      // --- NUEVO: Añadir tooltip permanente con el título del evento ---
      marker.bindTooltip(`${evento.titulo} (${evento.fecha})`, {
        permanent: true,
        direction: 'right',
        className: 'titulo-marcador-tooltip'
      }).openTooltip();
      marker.bindPopup("", {
        minWidth: 320,
        maxWidth: 360,
        maxHeight: 450,
        autoPan: true, // Esta opción ya centra el mapa para que el popup sea visible
      });

      marker.on("popupopen", () => {
        if (popupAbierto && popupAbierto !== marker) {
          popupAbierto.closePopup();
          popupAbierto = null;
        }
        popupAbierto = marker;

        const popupContentElement = crearPopupContenido(evento);
        marker.getPopup().setContent(popupContentElement);

        if (typeof jQuery !== "undefined") {
          $(popupContentElement)
            .find(".mfp-image")
            .magnificPopup({
              type: "image",
              closeOnContentClick: true,
              mainClass: "mfp-img-mobile",
              image: {
                verticalFit: true,
              },
            });

          $(popupContentElement).find(".mfp-youtube").magnificPopup({
            type: "iframe",
            mainClass: "mfp-fade",
            removalDelay: 160,
            preloader: false,
            fixedContentPos: false,
          });
        } else {
          console.warn("jQuery no está cargado. Magnific Popup no funcionará.");
        }
      });

      marker.on("popupclose", () => {
        if (popupAbierto === marker) {
          popupAbierto = null;
        }
        if (!tourIsActive || tourIsPaused) {
          window.speechSynthesis.cancel();
          isNarrating = false;
          actualizarEstadoBotonesTour();
        }
      });

      // Se puede eliminar el evento mouseover si el tooltip permanente ya muestra el título
      // marker.on("mouseover", () => {
      //     if (!popupAbierto || popupAbierto === marker) {
      //         if (!marker.getPopup().isOpen()) {
      //             marker.openPopup();
      //             popupAbierto = marker;
      //         }
      //     }
      // });

      return marker;
    });

  markerCluster.clearLayers();
  markerCluster.addLayers(marcadores);
}

// --- Crear Contenido Popup ---

/**
 * Extrae el ID de un video de YouTube de una URL dada.
 * @param {string} url - La URL del video de YouTube.
 * @returns {string|null} El ID del video o null si no se encuentra.
 */
function getYoutubeVideoId(url) {
  const standardRegExp =
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  let match = url.match(standardRegExp);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

/**
 * Crea el contenido HTML dinámico para el popup de un evento.
 * @param {object} evento - El objeto evento con sus propiedades.
 * @returns {HTMLElement} Un elemento div que contiene el HTML del popup.
 */
function crearPopupContenido(evento) {
  const container = document.createElement("div");
  container.className = "popup-evento";

  container.innerHTML = `
        <h3>${evento.titulo}</h3>
        <p><strong>Fecha:</strong> ${evento.fecha}</p>
        <p><strong>Periodo:</strong> ${evento.periodo}</p>
        <p><strong>País:</strong> ${evento.pais || "Desconocido"}</p>
        <p>${evento.descripcion || ""}</p>
    `;

  const mediaButtonsContainer = document.createElement("div");
  mediaButtonsContainer.className = "popup-media-buttons";

  if (evento.media) {
    const imgButton = document.createElement("a");
    imgButton.href = `${evento.media}`;
    imgButton.className = "popup-button mfp-image";
    imgButton.title = `Imagen de ${evento.titulo}`;
    imgButton.innerHTML = `<i class="fas fa-image"></i> <span>Ver Imagen</span>`;
    mediaButtonsContainer.appendChild(imgButton);
  }

  if (evento.video) {
    const videoId = getYoutubeVideoId(evento.video);
    if (videoId) {
      const videoButton = document.createElement("a");
      // CORREGIDO: URL de YouTube directa para el video
      videoButton.href = `https://www.youtube.com/watch?v=${videoId}`;
      videoButton.className = "popup-button mfp-youtube";
      videoButton.title = `Video de ${evento.titulo}`;
      videoButton.innerHTML = `<i class="fas fa-play-circle"></i> <span>Ver Video</span>`;
      mediaButtonsContainer.appendChild(videoButton);
    }
  }

  // AHORA: Agrega el botón "Repetir Narración" aquí, dentro de mediaButtonsContainer
  const repeatNarrationBtn = document.createElement("button");
  repeatNarrationBtn.className = "popup-button boton-repetir-narracion";
  repeatNarrationBtn.innerHTML = "🔁 Repetir Narración";
  repeatNarrationBtn.title = "Repetir la descripción y el dato curioso del evento";
  repeatNarrationBtn.onclick = () => {
    window.speechSynthesis.cancel();
    if (tourCurrentEventData) {
      narrarEventoCompleto(tourCurrentEventData);
    } else {
      const currentMarker = popupAbierto;
      if (currentMarker && currentMarker.eventoId) {
        const currentEvent = eventosMap.get(currentMarker.eventoId);
        if (currentEvent) {
          narrarEventoCompleto(currentEvent);
        }
      }
    }
  };
  mediaButtonsContainer.appendChild(repeatNarrationBtn); // Añadido aquí

  if (mediaButtonsContainer.children.length > 0) {
    container.appendChild(mediaButtonsContainer);
  }

  const verMasBtn = document.createElement("a");
  verMasBtn.href = `evento${evento.id}.html`;
  verMasBtn.textContent = "🔎 Ver más";
  verMasBtn.target = "_blank";
  verMasBtn.rel = "noopener noreferrer";
  verMasBtn.className = "boton-ver-mas";

  if (evento.sabiasQue) {
    const sabiasQueTextDiv = document.createElement("div");
    sabiasQueTextDiv.className = "sabias-que-texto";
    sabiasQueTextDiv.innerHTML = `<p><strong>Dato curioso:</strong> ${evento.sabiasQue}</p>`;
    sabiasQueTextDiv.style.display = "none"; // Oculto por defecto
    container.appendChild(sabiasQueTextDiv);
  }

  // Enlace a Google Street View (URL corregida para Google Maps general)
  if (evento.ubicacion && evento.ubicacion.length === 2) {
    const linkMaps = document.createElement("a");
    // CORREGIDO: URL de Google Maps directa
    linkMaps.href = `https://www.google.com/maps?q=${evento.ubicacion[0]},${evento.ubicacion[1]}`;
    linkMaps.target = "_blank";
    linkMaps.rel = "noopener noreferrer";
    linkMaps.textContent = "📸 Ver en Google Maps";
    linkMaps.className = "popup-button street-view-button";
    container.appendChild(linkMaps);
  }

  container.appendChild(verMasBtn);

  return container;
}

// --- Filtros y Búsqueda ---

/**
 * Normaliza un texto (quita acentos, convierte a minúsculas) para facilitar la búsqueda.
 * @param {string} texto - El texto a normalizar.
 * @returns {string} El texto normalizado.
 */
function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Determina si un evento coincide con los criterios de filtrado actuales.
 * @param {object} evento - El objeto evento a verificar.
 * @returns {boolean} True si el evento debe mostrarse, false en caso contrario.
 */
function filtrarEvento(evento) {
  const periodoSeleccionado = filtros.periodo.value;
  const busquedaTexto = normalizarTexto(filtros.busqueda.value);
  const paisSeleccionado = filtros.pais.value;

  const coincidePeriodo =
    periodoSeleccionado === "todos" || evento.periodo === periodoSeleccionado;
  const coincidePais =
    paisSeleccionado === "todos" || evento.pais === paisSeleccionado;

  const coincideBusqueda =
    !busquedaTexto ||
    normalizarTexto(evento.titulo).includes(busquedaTexto) ||
    normalizarTexto(evento.descripcion).includes(busquedaTexto) ||
    (evento.sabiasQue && normalizarTexto(evento.sabiasQue).includes(busquedaTexto)) ||
    normalizarTexto(evento.fecha).includes(busquedaTexto) ||
    (evento.tags &&
      evento.tags.some((tag) => normalizarTexto(tag).includes(busquedaTexto)));

  return coincidePeriodo && coincideBusqueda && coincidePais;
}

/**
 * Actualiza la lista de eventos y los marcadores visibles en el mapa según los filtros.
 */
/**
 * Actualiza la lista de eventos en el panel lateral y los marcadores en el mapa
 * basándose en los filtros y la búsqueda actuales.
 */
function actualizarEventos() {
  window.speechSynthesis.cancel(); // Detener cualquier narración activa
  if (tourIsActive) { // Si el tour está activo, finalizarlo al cambiar filtros
    finalizarTourUI();
  }

  if (cargandoElement) cargandoElement.style.setProperty("display", "block");

  // Limpiar marcadores y lista antes de añadir los nuevos
  markerCluster.clearLayers();
  listaEventos.innerHTML = "";
  marcadores.forEach(m => m.closeTooltip()); // Cierra tooltips permanentes

  const eventosFiltrados = eventos.filter(filtrarEvento);
  tourEventosDisponibles = eventosFiltrados; // Actualiza los eventos disponibles para el tour

  if (eventosFiltrados.length === 0) {
    mensajeNoEventos.style.display = "block";
    contadorEventos.textContent = "0";
    if (cargandoElement) cargandoElement.style.setProperty("display", "none");
    return;
  } else {
    mensajeNoEventos.style.display = "none";
  }

  contadorEventos.textContent = eventosFiltrados.length;

  const marcadoresFiltrados = [];

  eventosFiltrados.forEach((evento) => {
    const li = document.createElement("li");
    li.className = "evento-item"; // Clase para estilizar
    li.dataset.eventId = evento.id; // Para identificar el evento

    // Contenido mejorado para el elemento de la lista
    li.innerHTML = `
            <div class="evento-header">
                <h4>${evento.titulo}</h4>
                <span class="evento-fecha">${evento.fecha}</span>
            </div>
            <div class="evento-details">
                <p class="evento-periodo"><strong>Periodo:</strong> ${evento.periodo}</p>
                <p class="evento-pais"><strong>País:</strong> ${evento.pais || 'Desconocido'}</p>
                ${evento.descripcion ? `<p class="evento-descripcion-corta">${evento.descripcion.substring(0, 100)}...</p>` : ''}
                ${evento.media ? `<img src="${evento.media}" alt="Imagen de ${evento.titulo}" class="evento-thumbnail">` : ''}
            </div>
            <button class="ver-en-mapa-btn" data-event-id="${evento.id}" title="Ver en el mapa">Ver en Mapa</button>
        `;

    li.querySelector(".ver-en-mapa-btn").addEventListener("click", (e) => {
      e.stopPropagation(); // Evita que el click se propague al li
      abrirEventoEnMapa(evento.id);
    });

    li.addEventListener("click", () => {
      abrirEventoEnMapa(evento.id);
    });

    listaEventos.appendChild(li);

    const marcador = marcadores.find((m) => m.eventoId === evento.id);
    if (marcador) {
      marcadoresFiltrados.push(marcador);
      // Asegúrate de que el tooltip se reabra si es un marcador filtrado
      marcador.openTooltip();
    }
  });

  markerCluster.addLayers(marcadoresFiltrados);

  if (cargandoElement) cargandoElement.style.setProperty("display", "none");
}

/**
 * Crea un elemento de lista HTML para un evento y lo añade a un contenedor.
 * @param {object} evento - El objeto evento para el que se creará el elemento.
 * @param {DocumentFragment} container - El DocumentFragment al que se añadirá el elemento.
 */
function crearElementoListaEvento(evento, container) {
  const li = document.createElement("li");
  li.className = "evento-item";
  li.innerHTML = `
        <div class="evento-info">
            <h4>${evento.titulo}</h4>
            <p>${evento.fecha} - ${evento.periodo} (${evento.pais || 'Desconocido'})</p>
        </div>
        <button class="ver-en-mapa-btn" data-id="${evento.id}" title="Ver en mapa">
            <i class="fas fa-map-marker-alt"></i>
        </button>
    `;
  li.querySelector(".ver-en-mapa-btn").addEventListener("click", () => {
    abrirEventoEnMapa(evento.id);
  });
  container.appendChild(li);
}

/**
 * Centra el mapa en un evento específico y abre su popup.
 * @param {string} eventoId - El ID del evento a mostrar.
 */
function abrirEventoEnMapa(eventoId) {
  const evento = eventosMap.get(eventoId);
  const marcador = marcadores.find((m) => m.eventoId === eventoId);

  if (evento && marcador) {
    window.speechSynthesis.cancel();
    // Detener el tour si está activo y se abre un evento manualmente
    if (tourIsActive) {
      finalizarTourUI();
      showToast("Tour detenido para ver el evento seleccionado.");
    }

    // Usamos zoomToShowLayer para manejar los clusters
    markerCluster.zoomToShowLayer(marcador, () => {
      map.flyTo(evento.ubicacion, Math.max(map.getZoom(), ZOOM_FINAL_TOUR_CERCANO - 2), {
        duration: 1.5,
      }); // Vuela a la ubicación y zoom apropiado
      marcador.openPopup();
      popupAbierto = marcador;
    });
  } else {
    showToast("Evento o marcador no encontrado.", 3000);
  }
}

// --- Persistencia de Estado (LocalStorage) ---

/**
 * Guarda el estado actual del mapa (centro y zoom) en el localStorage.
 */
function guardarEstadoMapa() {
  const centro = map.getCenter();
  const zoom = map.getZoom();
  localStorage.setItem(
    "mapaEstado",
    JSON.stringify({ lat: centro.lat, lng: centro.lng, zoom: zoom })
  );
}

/**
 * Carga el estado del mapa desde el localStorage si existe.
 */
function cargarEstadoMapa() {
  const estadoGuardado = localStorage.getItem("mapaEstado");
  if (estadoGuardado) {
    const estado = JSON.parse(estadoGuardado);
    map.setView([estado.lat, estado.lng], estado.zoom);
  }
}

/**
 * Guarda los valores actuales de los filtros en el localStorage.
 */
function guardarFiltros() {
  const estadoFiltros = {
    periodo: filtros.periodo.value,
    busqueda: filtros.busqueda.value,
    pais: filtros.pais.value,
  };
  localStorage.setItem("filtrosEstado", JSON.stringify(estadoFiltros));
}

/**
 * Carga los valores de los filtros desde el localStorage y los aplica.
 */
function cargarFiltros() {
  const estadoGuardado = localStorage.getItem("filtrosEstado");
  if (estadoGuardado) {
    const estado = JSON.parse(estadoGuardado);
    filtros.periodo.value = estado.periodo || "todos";
    filtros.busqueda.value = estado.busqueda || "";
    filtros.pais.value = estado.pais || "todos";
  }
}

/**
 * Limpia todos los filtros y actualiza los eventos.
 */
function limpiarFiltros() {
  filtros.periodo.value = "todos";
  filtros.busqueda.value = "";
  filtros.pais.value = "todos";
  actualizarEventos();
  showToast("Filtros limpiados.");
}

// --- Event Listeners ---
map.on("moveend", guardarEstadoMapa); // Guarda el estado del mapa cada vez que se mueve o hace zoom

// Escuchadores para los filtros
if (filtros.periodo) filtros.periodo.addEventListener("change", actualizarEventos);
if (filtros.busqueda) filtros.busqueda.addEventListener("input", actualizarEventos);
if (filtros.pais) filtros.pais.addEventListener("change", actualizarEventos);

// Botón limpiar filtros
if (botonLimpiarFiltros) botonLimpiarFiltros.addEventListener("click", limpiarFiltros);

// Cargar voces cuando estén disponibles
if (window.speechSynthesis) {
  popularSelectorVoces();
  window.speechSynthesis.onvoiceschanged = popularSelectorVoces; // Asegura que se carguen si cambian
} else {
  console.warn("SpeechSynthesis API no soportada en este navegador.");
  if (selectorVoces) {
    selectorVoces.disabled = true;
    selectorVoces.innerHTML = '<option value="">Narración no soportada</option>';
  }
}

// --- Inicialización ---
document.addEventListener("DOMContentLoaded", () => {
  cargarEventos(); // Carga eventos, crea marcadores y configura la UI
  agregarBotonInicio();
  agregarBotonDemostracion(); // Asegúrate de que se agrega después de cargar eventos
});