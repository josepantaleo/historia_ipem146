const comenzarBtn = document.getElementById("comenzar");
const triviaContainer = document.getElementById("trivia-container");
const preguntaElem = document.getElementById("pregunta");
const opcionesElem = document.getElementById("opciones");
const respuestaElem = document.getElementById("respuesta");
const siguienteBtn = document.getElementById("siguiente");
const progresoElem = document.getElementById("progreso");

let preguntas = [];
let indice = 0;
let puntaje = 0;

async function cargarPreguntas() {
  try {
    const response = await fetch("preguntas.json");
    const data = await response.json();

    // Leer atributo data-evento del body para saber qué preguntas cargar
    const evento = document.body.getAttribute("data-evento");

    if (data[evento]) {
      preguntas = data[evento];
    } else {
      preguntas = [];
      alert("No se encontraron preguntas para este evento.");
    }
  } catch (error) {
    alert("Error al cargar preguntas: " + error);
  }
}

comenzarBtn.addEventListener("click", async () => {
  comenzarBtn.style.display = "none";
  await cargarPreguntas();
  if (preguntas.length === 0) {
    comenzarBtn.style.display = "inline-block";
    return;
  }
  triviaContainer.style.display = "block";
  indice = 0;
  puntaje = 0;
  mostrarPregunta();
  respuestaElem.textContent = "";
  siguienteBtn.style.display = "none";
});

function mostrarPregunta() {
  respuestaElem.textContent = "";
  siguienteBtn.style.display = "none";

  const actual = preguntas[indice];
  preguntaElem.textContent = actual.pregunta;

  opcionesElem.innerHTML = "";
  actual.opciones.forEach((opcion) => {
    const button = document.createElement("button");
    button.textContent = opcion;
    button.classList.add("opcion-btn");
    button.style.margin = "5px 0";
    button.addEventListener("click", () => seleccionarRespuesta(opcion));
    opcionesElem.appendChild(button);
  });

  progresoElem.textContent = `Pregunta ${indice + 1} de ${preguntas.length}`;

  window.speechSynthesis.cancel();
  let textoParaLeer = actual.pregunta + ". ";
  actual.opciones.forEach((opcion, i) => {
    textoParaLeer += `Opción ${i + 1}: ${opcion}. `;
  });
  const utterance = new SpeechSynthesisUtterance(textoParaLeer);
  utterance.lang = "es-AR";
  window.speechSynthesis.speak(utterance);
}

function seleccionarRespuesta(opcionSeleccionada) {
  const actual = preguntas[indice];
  if (opcionSeleccionada === actual.respuesta) {
    puntaje++;
    respuestaElem.textContent = "¡Correcto!";
    respuestaElem.style.color = "green";
  } else {
    respuestaElem.textContent = `Incorrecto. La respuesta correcta es: ${actual.respuesta}`;
    respuestaElem.style.color = "red";
  }

  [...opcionesElem.children].forEach((btn) => {
    btn.disabled = true;
    if (btn.textContent === actual.respuesta) {
      btn.style.backgroundColor = "lightgreen";
    } else if (btn.textContent === opcionSeleccionada) {
      btn.style.backgroundColor = "salmon";
    }
  });

  window.speechSynthesis.cancel();
  const textoRespuesta =
    opcionSeleccionada === actual.respuesta
      ? "Respuesta correcta."
      : `Respuesta incorrecta. La respuesta correcta es ${actual.respuesta}.`;
  const utteranceRespuesta = new SpeechSynthesisUtterance(textoRespuesta);
  utteranceRespuesta.lang = "es-AR";
  window.speechSynthesis.speak(utteranceRespuesta);

  siguienteBtn.style.display = "inline-block";
}

siguienteBtn.addEventListener("click", () => {
  indice++;
  if (indice < preguntas.length) {
    mostrarPregunta();
  } else {
    mostrarResultado();
  }
});

function mostrarResultado() {
  const textoFinal = `Terminaste la trivia! Tu puntaje es ${puntaje} de ${preguntas.length}.`;
  preguntaElem.textContent = textoFinal;
  opcionesElem.innerHTML = "";
  respuestaElem.textContent = "";
  siguienteBtn.style.display = "none";
  comenzarBtn.style.display = "inline-block";
  comenzarBtn.textContent = "Reintentar";

  window.speechSynthesis.cancel();
  const utteranceFinal = new SpeechSynthesisUtterance(textoFinal);
  utteranceFinal.lang = "es-AR";
  window.speechSynthesis.speak(utteranceFinal);
}
