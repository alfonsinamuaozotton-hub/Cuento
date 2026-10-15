// Ruta del worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

// Selección de elementos del DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const pageIndicator = document.getElementById('page-indicator');
const btnTts = document.getElementById('btn-tts');
const btnStopTts = document.getElementById('btn-stop-tts');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const accessibleText = document.getElementById('accessible-text');
const srAnnouncer = document.getElementById('sr-announcer');

let pageFlip = null;
let pagesText = []; // Guarda el texto extraído de cada página para TTS y accesibilidad
let currentFontSize = 22; // Tamaño inicial de fuente en píxeles
let totalPagesCount = 0;
let synth = window.speechSynthesis;
let currentUtterance = null;

// Inicialización automática consumiendo 'cuento.pdf' del repositorio
document.addEventListener('DOMContentLoaded', () => {
    loadPDFFromRepo('cuento.pdf');
    setupEventListeners();
});

// Configuración de eventos de los controles
function setupEventListeners() {
    // Botones de navegación
    btnPrev.addEventListener('click', () => {
        if (pageFlip) pageFlip.flipPrev();
    });

    btnNext.addEventListener('click', () => {
        if (pageFlip) pageFlip.flipNext();
    });

    // Botones para agrandar y achicar la letra del texto
    btnZoomIn.addEventListener('click', () => {
        if (currentFontSize < 50) {
            currentFontSize += 4;
            accessibleText.style.fontSize = `${currentFontSize}px`;
            announceToScreenReader(`Tamaño de letra aumentado a ${currentFontSize} píxeles`);
        }
    });

    btnZoomOut.addEventListener('click', () => {
        if (currentFontSize > 14) {
            currentFontSize -= 4;
            accessibleText.style.fontSize = `${currentFontSize}px`;
            announceToScreenReader(`Tamaño de letra reducido a ${currentFontSize} píxeles`);
        }
    });

    // Controles de Lectura en Voz Alta
    btnTts.addEventListener('click', () => {
        speakCurrentPageText();
    });

    btnStopTts.addEventListener('click', () => {
        stopSpeech();
    });
}

// Carga directa del PDF 'cuento.pdf' alojado en el repositorio
async function loadPDFFromRepo(pdfUrl) {
    loading.style.display = 'block';
    bookContainer.style.display = 'none';
    bookContainer.innerHTML = '';
    pagesText = [];

    if (pageFlip) {
        pageFlip.destroy();
        pageFlip = null;
    }

    try {
        const loadingTask = pdfjsLib.getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        totalPagesCount = pdf.numPages;

        const firstPage = await pdf.getPage(1);
        const viewportInfo = firstPage.getViewport({ scale: 1.5 });
        const pageWidth = viewportInfo.width;
        const pageHeight = viewportInfo.height;

        // Bucle para procesar páginas y extraer texto
        for (let pageNum = 1; pageNum <= totalPagesCount; pageNum++) {
            const page = await pdf.getPage(pageNum);
            
            // Extraer contenido de texto para la lectura adaptada y TTS
            const textContent = await page.getTextContent();
            const textItems = textContent.items.map(item => item.str).join(' ');
            pagesText.push(textItems.trim() || `Página ${pageNum} sin texto detectado.`);

            // Renderizado en Canvas
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            bookContainer.appendChild(pageDiv);
        }

        bookContainer.style.display = 'block';

        // Inicialización de la animación de volteo de hojas
        pageFlip = new St.PageFlip(bookContainer, {
            width: pageWidth,
            height: pageHeight,
            size: "stretch",
            minWidth: 300,
            maxWidth: pageWidth,
            minHeight: 400,
            maxHeight: pageHeight,
            showCover: true,
            maxShadowOpacity: 0.6,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Evento cuando se pasa de página
        pageFlip.on('flip', (e) => {
            playPageFlipSound(); // Genera efecto sonoro de hoja
            updatePageDisplay(e.data); // Actualiza indicadores y texto
        });

        loading.style.display = 'none';
        
        // Estado inicial
        updatePageDisplay(0);
        announceToScreenReader(`El cuento cuento.pdf ha sido cargado. Contiene ${totalPagesCount} páginas.`);

    } catch (error) {
        console.error('Error al cargar cuento.pdf:', error);
        loading.innerText = 'Error: No se pudo encontrar o cargar el archivo "cuento.pdf" en la raíz del repositorio.';
    }
}

// Actualización de indicadores, panel de texto y estado de navegación
function updatePageDisplay(pageIndex) {
    const currentPageNum = pageIndex + 1;
    pageIndicator.innerText = `Página ${currentPageNum} de ${totalPagesCount}`;

    // Estado de los botones de navegación
    btnPrev.disabled = pageIndex === 0;
    btnNext.disabled = currentPageNum >= totalPagesCount;

    // Actualizar texto adaptado para alumnos con baja visión
    const pageText = pagesText[pageIndex] || 'Sin texto legible en esta página.';
    accessibleText.innerText = pageText;

    // Notificación al lector de pantalla
    announceToScreenReader(`Página ${currentPageNum} de ${totalPagesCount}. ${pageText}`);

    // Si la voz alta estaba activa, se detiene al cambiar de página
    if (synth && synth.speaking) {
        stopSpeech();
    }
}

// Efecto especial sonoro sintetizado con Web Audio API (Sin archivos de audio externos)
function playPageFlipSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const bufferSize = audioCtx.sampleRate * 0.12;
        const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1; // Ruido blanco
        }

        const noise = audioCtx.createBufferSource();
        noise.buffer = buffer;

        const filter = audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, audioCtx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.12);

        const gain = audioCtx.createGain();
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);

        noise.start();
    } catch (e) {
        console.log('Error al reproducir el sonido de la página:', e);
    }
}

// Síntesis de voz alta en español (Text-to-Speech)
function speakCurrentPageText() {
    if (!synth) {
        alert('Tu navegador no soporta la lectura en voz alta.');
        return;
    }

    stopSpeech();

    const currentPageIndex = pageFlip ? pageFlip.getCurrentPageIndex() : 0;
    const textToRead = pagesText[currentPageIndex];

    if (!textToRead) {
        announceToScreenReader('No hay texto para leer en esta página.');
        return;
    }

    currentUtterance = new SpeechSynthesisUtterance(textToRead);
    currentUtterance.lang = 'es-ES'; // Configurado en idioma español
    currentUtterance.rate = 0.9; // Velocidad de lectura óptima para niños/alumnos

    const voices = synth.getVoices();
    const spanishVoice = voices.find(v => v.lang.startsWith('es'));
    if (spanishVoice) {
        currentUtterance.voice = spanishVoice;
    }

    currentUtterance.onstart = () => {
        btnTts.disabled = true;
        btnStopTts.disabled = false;
        btnTts.innerText = '🔊 Leyendo...';
    };

    currentUtterance.onend = () => {
        resetTtsButtons();
    };

    currentUtterance.onerror = () => {
        resetTtsButtons();
    };

    synth.speak(currentUtterance);
}

function stopSpeech() {
    if (synth) {
        synth.cancel();
        resetTtsButtons();
    }
}

function resetTtsButtons() {
    btnTts.disabled = false;
    btnStopTts.disabled = true;
    btnTts.innerText = '🔊 Leer en voz alta';
}

// Anunciador dinámico para lectores de pantalla (NVDA, JAWS, VoiceOver)
function announceToScreenReader(message) {
    if (srAnnouncer) {
        srAnnouncer.innerText = message;
    }
}