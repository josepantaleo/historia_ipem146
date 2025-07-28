// --- Configuración inicial del mapa ---
const POSICION_INICIAL = [-31.7397, -65.0067]; // Coordenadas aproximadas de Mina Clavero, Córdoba, Argentina
const ZOOM_INICIAL = 3;
const ZOOM_MIN = 3;
const ZOOM_MAX = 18; // Nivel de zoom máximo para desagrupar marcadores

// Define las diferentes capas base para el control de capas
const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
});

const esriSatLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

const map = L.map("mapa", {
    minZoom: ZOOM_MIN,
    maxZoom: ZOOM_MAX,
    zoomControl: true,
    layers: [osmLayer] // Establece OpenStreetMap como capa inicial por defecto
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
const MAP_ID = "mapa";
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

// --- Funciones auxiliares ---

/**
 * Carga las voces disponibles para la síntesis de voz.
 * @returns {Promise<SpeechSynthesisVoice[]>} Una promesa que resuelve con un array de voces.
 */
function cargarVoces() {
    return new Promise(resolve => {
        if (voicesLoaded) { // Si ya se cargaron, resolver inmediatamente
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
        if (!('speechSynthesis' in window)) {
            console.warn("SpeechSynthesis API no soportada en este navegador.");
            showToast("Tu navegador no soporta la narración de voz.", 4000);
            return reject(new Error("SpeechSynthesis API no soportada."));
        }

      

        const textoCompleto = texto + " te sugiero pulsar ver mas"; // Agrega la frase al final
        const utterance = new SpeechSynthesisUtterance(textoCompleto);
  window.speechSynthesis.cancel(); // Detiene cualquier narración en curso
        currentUtterance = null; // Limpia la referencia a la locución anterior
        if (vozSeleccionada) {
            utterance.voice = vozSeleccionada;
            utterance.lang = vozSeleccionada.lang;
        } else {
            const voices = await cargarVoces();
            const esArVoice = voices.find(voice => voice.lang === 'es-AR');
            const esEsVoice = voices.find(voice => voice.lang === 'es-ES');
            const esMxVoice = voices.find(voice => voice.lang === 'es-MX');
            const defaultEsVoice = voices.find(voice => voice.lang.startsWith('es'));

            if (esArVoice) {
                utterance.voice = esArVoice;
                utterance.lang = 'es-AR';
            } else if (esEsVoice) {
                utterance.voice = esEsVoice;
                utterance.lang = 'es-ES';
            } else if (esMxVoice) {
                utterance.voice = esMxVoice;
                utterance.lang = 'es-MX';
            } else if (defaultEsVoice) {
                utterance.voice = defaultEsVoice;
                utterance.lang = defaultEsVoice.lang;
            } else {
                console.warn("No se encontró una voz en español. Usando la voz predeterminada del sistema.");
                utterance.lang = 'es';
            }
        }

        utterance.onend = () => {
            currentUtterance = null; // Limpia la referencia cuando termina
            resolve();
        };

        utterance.onerror = (event) => {
            console.error("Error en la narración:", event.error);
            showToast("Error en la narración de voz.", 4000);
            currentUtterance = null; // Limpia la referencia en caso de error
            reject(new Error(`Error de narración: ${event.error}`));
        };

        // Asigna la locución a la variable global para evitar que sea recolectada por el garbage collector
        currentUtterance = utterance;

        window.speechSynthesis.speak(utterance);
    });
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
        toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, duracion);
}

// --- Controles Personalizados ---

/**
 * Agrega un botón "Inicio" al mapa para volver a la vista inicial.
 */
function agregarBotonInicio() {
    const boton = L.control({ position: "topright" });
    boton.onAdd = () => {
        const div = L.DomUtil.create("div", "boton-inicio leaflet-bar leaflet-control");
        div.innerHTML = "↺ Inicio";
        div.title = "Volver a la vista inicial del mapa";
        div.style.cursor = "pointer";
        div.onclick = () => {
            window.speechSynthesis.cancel();
            if (popupAbierto) {
                popupAbierto.closePopup();
                popupAbierto = null;
            }
            map.flyTo(POSICION_INICIAL, ZOOM_INICIAL, { duration: 1.2 });
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
        onAdd: function(map) {
            const button = L.DomUtil.create("button", "boton-demostracion leaflet-bar leaflet-control");
            button.textContent = "Demostración";
            button.title = "Mostrar el primer evento cargado";
            button.onclick = () => {
                window.speechSynthesis.cancel();
                if (eventos.length === 0) {
                    showToast("No hay eventos cargados para la demostración.");
                    return;
                }
                abrirEventoEnMapa(eventos[0].id);
            };
            L.DomEvent.disableClickPropagation(button);
            return button;
        },
        onRemove: function(map) {
            // Limpiar si es necesario (e.g., remover listeners)
        }
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
        if (!res.ok) throw new Error(`Error al cargar eventos.json: ${res.statusText}`);
        eventos = await res.json();
        eventosMap = new Map(eventos.map(e => [e.id, e]));

        llenarFiltroPeriodos();
        llenarFiltroPaises();
        crearMarcadores();
        cargarEstadoMapa();
        cargarFiltros();
        actualizarEventos();

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
    const periodos = [...new Set(eventos.map(e => e.periodo))].sort();
    filtros.periodo.innerHTML = '<option value="todos">Todos</option>' +
        periodos.map(p => `<option value="${p}">${p}</option>`).join('');
}

/**
 * Rellena el select de filtro de países con los países únicos de los eventos.
 */
function llenarFiltroPaises() {
    const paises = [...new Set(eventos.map(e => e.pais).filter(Boolean))].sort();
    filtros.pais.innerHTML = '<option value="todos">Todos</option>' +
        paises.map(p => `<option value="${p}">${p}</option>`).join('');
}

/**
 * Rellena el selector de voces con las voces disponibles.
 */
async function popularSelectorVoces() {
    if (!selectorVoces) return;

    selectorVoces.innerHTML = '<option value="">Automática (Sistema)</option>'; // Opción por defecto

    if (!('speechSynthesis' in window)) {
        selectorVoces.disabled = true;
        selectorVoces.innerHTML = '<option value="">Narración no soportada</option>';
        return;
    }

    const voices = await cargarVoces();
    const spanishVoices = voices.filter(voice => voice.lang.startsWith('es'));

    if (spanishVoices.length > 0) {
        spanishVoices.forEach(voice => {
            const option = document.createElement('option');
            option.value = voice.name;
            option.textContent = `${voice.name} (${voice.lang})`;
            selectorVoces.appendChild(option);
        });

        selectorVoces.addEventListener('change', () => {
            const selectedVoiceName = selectorVoces.value;
            if (selectedVoiceName === "") {
                vozSeleccionada = null; // Vuelve a la selección automática
            } else {
                vozSeleccionada = voices.find(voice => voice.name === selectedVoiceName);
            }
            localStorage.setItem('vozPreferida', selectedVoiceName); // Guarda la preferencia del usuario
            showToast(`Voz de narración cambiada a: ${selectedVoiceName || "Automática"}`);
        });

        // Cargar la preferencia de voz guardada
        const savedVoiceName = localStorage.getItem('vozPreferida');
        if (savedVoiceName) {
            selectorVoces.value = savedVoiceName;
            vozSeleccionada = voices.find(voice => voice.name === savedVoiceName);
            if (!vozSeleccionada) { // Si la voz guardada no está disponible (ej. en otro navegador)
                selectorVoces.value = "";
                localStorage.removeItem('vozPreferida');
            }
        }
    } else {
        selectorVoces.disabled = true;
        selectorVoces.innerHTML = '<option value="">No hay voces en español disponibles</option>';
    }
}


// --- Marcadores ---

/**
 * Crea los marcadores de Leaflet para cada evento y los prepara para el clustering.
 */
function crearMarcadores() {
    marcadores = eventos.filter(e => {
        const isValidLocation = Array.isArray(e.ubicacion) && e.ubicacion.length === 2 && typeof e.ubicacion[0] === 'number' && typeof e.ubicacion[1] === 'number';
        if (!isValidLocation) {
            console.warn(`Evento "${e.titulo}" (ID: ${e.id}) omitido: Ubicación inválida.`, e.ubicacion);
        }
        return isValidLocation;
    }).map(evento => {
        const marker = L.marker(evento.ubicacion);
        marker.eventoId = evento.id;

        marker.bindPopup('', {
            minWidth: 320,
            maxWidth: 360,
            maxHeight: 450,
            autoPan: true,
        });

        marker.on("popupopen", () => {
            if (popupAbierto && popupAbierto !== marker) {
                popupAbierto.closePopup();
            }
            popupAbierto = marker;

            const popupContentElement = crearPopupContenido(evento);
            marker.getPopup().setContent(popupContentElement);

            if (typeof jQuery !== 'undefined') {
                $(popupContentElement).find('.mfp-image').magnificPopup({
                    type: 'image',
                    closeOnContentClick: true,
                    mainClass: 'mfp-img-mobile',
                    image: {
                        verticalFit: true
                    }
                });

                $(popupContentElement).find('.mfp-youtube').magnificPopup({
                    type: 'iframe',
                    mainClass: 'mfp-fade',
                    removalDelay: 160,
                    preloader: false,
                    fixedContentPos: false
                });
            } else {
                console.warn("jQuery no está cargado. Magnific Popup no funcionará.");
            }
        });

        marker.on("popupclose", () => {
            if (popupAbierto === marker) {
                popupAbierto = null;
            }
            window.speechSynthesis.cancel();
        });

        // Abre el popup al pasar el mouse sobre el marcador
        marker.on("mouseover", () => {
            if (!popupAbierto || popupAbierto === marker) {
                if (!marker.getPopup().isOpen()) {
                    marker.openPopup();
                    popupAbierto = marker;
                }
            }
        });

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
    const standardRegExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    let match = url.match(standardRegExp);
    if (match && match[1]) {
        return match[1];
    }
    const customRegExp = /http:\/\/googleusercontent\.com\/youtube\.com\/(\d+)/;
    match = url.match(customRegExp);
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
        imgButton.href = `img/${evento.media}`;
        imgButton.className = "popup-button mfp-image";
        imgButton.title = `Imagen de ${evento.titulo}`;
        imgButton.innerHTML = `<i class="fas fa-image"></i> <span>Ver Imagen</span>`;
        mediaButtonsContainer.appendChild(imgButton);
    }

    if (evento.video) {
        const videoId = getYoutubeVideoId(evento.video);
        if (videoId) {
            const videoButton = document.createElement("a");
            // Corrected YouTube embed URL for Magnific Popup
            videoButton.href = `https://www.youtube.com/watch?v=${videoId}`;
            videoButton.className = "popup-button mfp-youtube";
            videoButton.title = `Video de ${evento.titulo}`;
            videoButton.innerHTML = `<i class="fas fa-play-circle"></i> <span>Ver Video</span>`;
            mediaButtonsContainer.appendChild(videoButton);
        }
    }

    if (mediaButtonsContainer.children.length > 0) {
        container.appendChild(mediaButtonsContainer);
    }

    const verMasBtn = document.createElement("a");
    verMasBtn.href = `evento${evento.id}.html`;
    verMasBtn.textContent = "🔎 Ver más";
    verMasBtn.target = "_blank";
    verMasBtn.rel = "noopener noreferrer";
    verMasBtn.className = "boton-ver-mas"; // Keep this class for general styling

    if (evento.sabiasQue) {
        const btnSabiasQue = document.createElement("button");
        btnSabiasQue.textContent = "▶️ Escuchar dato curioso";
        btnSabiasQue.className = "boton-sabias-que";
        btnSabiasQue.style.marginTop = "8px";

        const sabiasQueTextDiv = document.createElement("div");
        sabiasQueTextDiv.className = "sabias-que-texto";
        sabiasQueTextDiv.innerHTML = `<p><strong>Dato curioso:</strong> ${evento.sabiasQue}</p>`;
        sabiasQueTextDiv.style.display = "none";

        btnSabiasQue.onclick = async () => {
            // If the same "Dato curioso" is already speaking, stop it
            if (window.speechSynthesis.speaking && currentUtterance && currentUtterance.text.includes(evento.sabiasQue)) {
                window.speechSynthesis.cancel();
                btnSabiasQue.textContent = "▶️ Escuchar dato curioso";
                sabiasQueTextDiv.classList.remove("narrando");
                sabiasQueTextDiv.style.display = "none";
                currentUtterance = null;
                verMasBtn.classList.remove('animate-pulse'); // Remove animation if stopped early
                return;
            }

            window.speechSynthesis.cancel(); // Stop any other ongoing narration

            btnSabiasQue.textContent = "🔊 Reproduciendo...";
            btnSabiasQue.disabled = true;

            sabiasQueTextDiv.style.display = "block";
            sabiasQueTextDiv.classList.add("narrando");

            const utterance = new SpeechSynthesisUtterance(evento.sabiasQue);
            if (vozSeleccionada) {
                utterance.voice = vozSeleccionada;
                utterance.lang = vozSeleccionada.lang;
            } else {
                const voices = await cargarVoces();
                const esArVoice = voices.find(voice => voice.lang === 'es-AR');
                const esEsVoice = voices.find(voice => voice.lang === 'es-ES');
                const esMxVoice = voices.find(voice => voice.lang === 'es-MX');
                const defaultEsVoice = voices.find(voice => voice.lang.startsWith('es'));

                if (esArVoice) {
                    utterance.voice = esArVoice;
                    utterance.lang = 'es-AR';
                } else if (esEsVoice) {
                    utterance.voice = esEsVoice;
                    utterance.lang = 'es-ES';
                } else if (esMxVoice) {
                    utterance.voice = esMxVoice;
                    utterance.lang = 'es-MX';
                } else if (defaultEsVoice) {
                    utterance.voice = defaultEsVoice;
                    utterance.lang = defaultEsVoice.lang;
                } else {
                    utterance.lang = 'es';
                }
            }

            utterance.onend = () => {
                btnSabiasQue.textContent = "▶️ Escuchar dato curioso";
                btnSabiasQue.disabled = false;
                sabiasQueTextDiv.classList.remove("narrando");
                sabiasQueTextDiv.style.display = "none";
                currentUtterance = null;

                // --- NEW: Animate "Ver más" button when narration finishes ---
                verMasBtn.classList.add('animate-pulse'); // Add a class for animation
                setTimeout(() => {
                    verMasBtn.classList.remove('animate-pulse'); // Remove after animation duration
                }, 2000); // Adjust duration to match your CSS animation
                // --- END NEW ---
            };

            utterance.onerror = (event) => {
                console.error("Error narrando dato curioso:", event.error);
                btnSabiasQue.textContent = "▶️ Escuchar dato curioso";
                btnSabiasQue.disabled = false;
                sabiasQueTextDiv.classList.remove("narrando");
                sabiasQueTextDiv.style.display = "none";
                currentUtterance = null;
                verMasBtn.classList.remove('animate-pulse'); // Ensure class is removed on error
            };

            currentUtterance = utterance; // Keep reference to prevent garbage collection
            window.speechSynthesis.speak(utterance);
        };
        container.appendChild(btnSabiasQue);
        container.appendChild(sabiasQueTextDiv);
    }

    // Enlace a Google Street View (URL corregida para Google Maps general)
    if (evento.ubicacion && evento.ubicacion.length === 2) {
        const linkMaps = document.createElement("a");
        // Corrected Google Maps URL for direct location search
        linkMaps.href = `https://www.google.com/maps/search/?api=1&query=${evento.ubicacion[0]},${evento.ubicacion[1]}`;
        linkMaps.target = "_blank";
        linkMaps.rel = "noopener noreferrer";
        linkMaps.textContent = "📸 Ver en Google Maps";
        linkMaps.className = "popup-button street-view-button";
        container.appendChild(linkMaps);
    }

    container.appendChild(verMasBtn); // Append the "Ver más" button at the end

    return container;
}

// --- Filtros y Búsqueda ---

/**
 * Normaliza un texto (quita acentos, convierte a minúsculas) para facilitar la búsqueda.
 * @param {string} texto - El texto a normalizar.
 * @returns {string} El texto normalizado.
 */
function normalizarTexto(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Determina si un evento coincide con los criterios de filtro y búsqueda.
 * @param {object} evento - El objeto evento a filtrar.
 * @returns {boolean} True si el evento coincide, False en caso contrario.
 */
function filtrarEvento({ titulo, descripcion = "", pais = "", periodo }) {
    const textoBusquedaNormalizado = normalizarTexto(filtros.busqueda.value.trim());
    const palabrasBusqueda = textoBusquedaNormalizado.split(/\s+/).filter(Boolean);

    const camposEventoNormalizados = [titulo, descripcion, pais, periodo].map(c => normalizarTexto(c || "")).join(" ");
    const coincideTexto = palabrasBusqueda.every(palabra => camposEventoNormalizados.includes(palabra));

    const valorPeriodo = filtros.periodo.value;
    const coincidePeriodo = valorPeriodo === "todos" || normalizarTexto(periodo) === normalizarTexto(valorPeriodo);

    const valorPais = filtros.pais.value;
    const coincidePais = valorPais === "todos" || normalizarTexto(pais) === normalizarTexto(valorPais);

    return coincidePeriodo && coincideTexto && coincidePais;
}

/**
 * Actualiza los marcadores en el mapa y la lista de eventos en el panel lateral
 * basándose en los filtros aplicados.
 */
function actualizarEventos() {
    markerCluster.clearLayers();
    listaEventos.innerHTML = "";

    const filtrados = eventos.filter(filtrarEvento);
    filtrados.sort((a, b) => {
        const fechaA = a.fecha.split('/').reverse().join('-');
        const fechaB = b.fecha.split('/').reverse().join('-');
        return new Date(fechaB) - new Date(fechaA);
    });

    mensajeNoEventos.hidden = filtrados.length > 0;
    contadorEventos.textContent = `${filtrados.length} evento(s) encontrado(s). Clic para abrir en el mapa.`;

    const idsVisibles = new Set(filtrados.map(e => e.id));
    const visibles = marcadores.filter(m => idsVisibles.has(m.eventoId));
    markerCluster.addLayers(visibles);

    filtrados.forEach(ev => {
        const div = document.createElement("div");
        div.className = "item-lista-evento";
        div.tabIndex = 0;
        div.setAttribute("role", "button");

        // Contenedor para el texto del evento
        const textSpan = document.createElement("span");
        textSpan.textContent = `${ev.titulo} (${ev.fecha})`;
        div.appendChild(textSpan);

        // Botón de narración para la lista lateral
        const narrarBtn = document.createElement("button");
        narrarBtn.className = "boton-narrar-lista";
        narrarBtn.innerHTML = '▶️'; // Icono de reproducción
        narrarBtn.title = `Escuchar "${ev.titulo}"`;
        narrarBtn.onclick = async (e) => {
            e.stopPropagation(); // Evita que se dispare el onclick del div padre

            // Si ya está hablando este mismo evento, lo cancela
            if (window.speechSynthesis.speaking && currentUtterance && currentUtterance.text.includes(ev.titulo)) {
                window.speechSynthesis.cancel();
                narrarBtn.innerHTML = '▶️';
                narrarBtn.disabled = false;
                currentUtterance = null;
                return;
            }

            window.speechSynthesis.cancel(); // Detiene cualquier otra narración

            narrarBtn.innerHTML = '🔊'; // Cambia el icono a "reproduciendo"
            narrarBtn.disabled = true; // Deshabilita el botón mientras se reproduce

            const textoANarrar = `${ev.titulo}. Ocurrido el ${ev.fecha}.`;
            try {
                await narrar(textoANarrar); // Espera a que la narración termine
                narrarBtn.innerHTML = '▶️'; // Vuelve al icono original
                narrarBtn.disabled = false; // Habilita el botón
            } catch (error) {
                console.error("La narración del elemento de la lista falló:", error);
                narrarBtn.innerHTML = '▶️';
                narrarBtn.disabled = false;
            }
        };
        div.appendChild(narrarBtn);

        div.onclick = () => abrirEventoEnMapa(ev.id);
        div.onkeypress = (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                abrirEventoEnMapa(ev.id);
            }
        };
        listaEventos.appendChild(div);
    });

    const sinFiltroPeriodo = filtros.periodo.value === "todos";
    const sinFiltroPais = filtros.pais.value === "todos";
    const sinFiltroBusqueda = filtros.busqueda.value.trim() === "";

    if (sinFiltroPeriodo && sinFiltroPais && sinFiltroBusqueda) {
        window.speechSynthesis.cancel();
        map.flyTo(POSICION_INICIAL, ZOOM_INICIAL, { duration: 1.2 });
        if (popupAbierto) {
            popupAbierto.closePopup();
            popupAbierto = null;
        }
    } else if (filtrados.length > 0) {
        map.flyTo(filtrados[0].ubicacion, Math.max(map.getZoom(), 9), { duration: 1.2 });
    } else {
        if (popupAbierto) {
            popupAbierto.closePopup();
            popupAbierto = null;
        }
    }
}

/**
 * Centra el mapa en la ubicación de un evento y abre su popup.
 * @param {string} id - El ID del evento a mostrar.
 */
function abrirEventoEnMapa(id) {
    const evento = eventosMap.get(id);
    if (!evento) {
        showToast("Evento no encontrado.");
        return;
    }
    const marcador = marcadores.find(m => m.eventoId === id);
    if (marcador) {
        window.speechSynthesis.cancel(); // Asegura detener cualquier narración activa

        if (popupAbierto && popupAbierto !== marcador) {
            popupAbierto.closePopup();
            popupAbierto = null;
        }

        map.flyTo(evento.ubicacion, Math.max(map.getZoom(), 14), { duration: 1.2 });

        map.once('moveend', () => {
            if (!map.getBounds().contains(marcador.getLatLng())) {
                map.panTo(marcador.getLatLng());
            }
            marcador.openPopup();
            popupAbierto = marcador;
        });

    } else {
        showToast("Marcador no encontrado para este evento. Puede que la ubicación no sea válida.");
        console.error(`Marcador para evento ID ${id} no encontrado.`);
    }
}

// --- Guardado y Carga de Estado (localStorage) ---

/**
 * Guarda el centro y el zoom actual del mapa en el localStorage.
 */
function guardarEstadoMapa() {
    const estado = {
        centro: map.getCenter(),
        zoom: map.getZoom(),
    };
    try {
        localStorage.setItem("mapaEstado", JSON.stringify(estado));
    } catch (e) {
        console.warn("Error al guardar el estado del mapa en localStorage:", e);
    }
}

/**
 * Carga el centro y el zoom del mapa desde el localStorage, si están disponibles.
 */
function cargarEstadoMapa() {
    const estadoStr = localStorage.getItem("mapaEstado");
    if (!estadoStr) return;
    try {
        const estado = JSON.parse(estadoStr);
        if (
            typeof estado.centro === 'object' &&
            typeof estado.centro.lat === 'number' &&
            typeof estado.centro.lng === 'number' &&
            typeof estado.zoom === 'number' &&
            estado.zoom >= ZOOM_MIN && estado.zoom <= ZOOM_MAX
        ) {
            map.setView([estado.centro.lat, estado.centro.lng], estado.zoom);
        } else {
            console.warn("Estado del mapa guardado inválido o fuera de límites. Se usará la posición inicial.");
            localStorage.removeItem("mapaEstado");
        }
    } catch (err) {
        console.error("Error al parsear el estado del mapa desde localStorage:", err);
        localStorage.removeItem("mapaEstado");
    }
}

/**
 * Guarda el estado actual de los filtros en el localStorage.
 */
function guardarFiltros() {
    const filtrosObj = {
        periodo: filtros.periodo.value,
        busqueda: filtros.busqueda.value,
        pais: filtros.pais.value,
    };
    try {
        localStorage.setItem("filtrosEvento", JSON.stringify(filtrosObj));
    } catch (e) {
        console.warn("Error al guardar los filtros en localStorage:", e);
    }
}

/**
 * Carga el estado de los filtros desde el localStorage y los aplica a la UI.
 */
function cargarFiltros() {
    const filtroStr = localStorage.getItem("filtrosEvento");
    if (!filtroStr) return;
    try {
        const f = JSON.parse(filtroStr);
        if (f.periodo !== undefined && filtros.periodo.querySelector(`option[value="${f.periodo}"]`)) {
            filtros.periodo.value = f.periodo;
        } else {
            filtros.periodo.value = "todos";
        }
        if (f.busqueda !== undefined) {
            filtros.busqueda.value = f.busqueda;
        }
        if (f.pais !== undefined && filtros.pais.querySelector(`option[value="${f.pais}"]`)) {
            filtros.pais.value = f.pais;
        } else {
            filtros.pais.value = "todos";
        }
    } catch (err) {
        console.error("Error al parsear los filtros desde localStorage:", err);
        localStorage.removeItem("filtrosEvento");
    }
}

// --- Manejo de Eventos UI ---

// Uso de addEventListener para mayor flexibilidad
filtros.periodo.addEventListener("change", () => {
    guardarFiltros();
    actualizarEventos();
});

filtros.pais.addEventListener("change", () => {
    guardarFiltros();
    actualizarEventos();
});

// Debounce para la búsqueda de texto
let searchTimeout;
filtros.busqueda.addEventListener("input", () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        guardarFiltros();
        actualizarEventos();
    }, 300); // Espera 300ms después de la última pulsación
});

if (botonLimpiarFiltros) {
    botonLimpiarFiltros.addEventListener("click", () => {
        filtros.periodo.value = "todos";
        filtros.pais.value = "todos";
        filtros.busqueda.value = "";
        guardarFiltros();
        actualizarEventos();
        showToast("Filtros limpiados.");
    });
}

// --- Zoom y Popups ---

map.on("zoomend", () => {
    if (map.getZoom() < 7 && popupAbierto) {
        popupAbierto.closePopup();
        popupAbierto = null;
    }
    guardarEstadoMapa();
});

map.on("moveend", () => {
    guardarEstadoMapa();
});

window.addEventListener('beforeunload', () => {
    window.speechSynthesis.cancel();
});

// --- Inicio de la Aplicación ---
document.addEventListener('DOMContentLoaded', async () => {
    agregarBotonInicio();
    agregarBotonDemostracion();
    await cargarEventos(); // Espera a que los eventos se carguen antes de popular voces
    await popularSelectorVoces(); // Carga y popula el selector de voces
});