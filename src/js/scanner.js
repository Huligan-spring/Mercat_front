/**
 * =========================================================================
 * Módulo de Escáner de Códigos de Barras: Cámara y Decodificación
 * =========================================================================
 * 
 * Este módulo gestiona:
 * 1. El acceso a la cámara trasera del teléfono mediante 'Html5Qrcode'.
 * 2. La lectura en tiempo real de códigos de barras (EAN-13, EAN-8, UPC, Code 128).
 * 3. El control de la linterna (Torch) para zonas con poca iluminación en el supermercado.
 * 4. El feedback sensorial (sonido beep sintético y vibración háptica).
 */

import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

// Instancia única del escáner
let html5QrCode = null;

// Estados del escáner
let isScanning = false;
let isTorchOn = false;
let lastScannedCode = null;
let lastScannedTimestamp = 0;

// Configuración de formatos reconocidos en supermercados (principalmente EAN-13 y EAN-8)
const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128
];

/**
 * Emite un "Beep" sutil usando la Web Audio API nativa.
 * De esta manera no necesitamos descargar archivos MP3 externos.
 */
function playBeepSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, audioCtx.currentTime); // Frecuencia de 1.8kHz (beep limpio de caja registradora)
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (e) {
    // Los navegadores restringen audio si no hay interacción previa del usuario
  }
}

/**
 * Hace vibrar el teléfono durante 90ms si el hardware lo permite.
 */
function triggerVibration() {
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate(90);
    } catch (e) {}
  }
}

/**
 * Inicializa y arranca la cámara dentro del elemento contenedor especificado.
 * 
 * @param {string} elementId Identificador del contenedor DOM (ej: 'camera-viewport')
 * @param {Function} onCodeDetected Callback que se ejecuta al leer un código con éxito
 * @param {Function} onError Callback en caso de fallo de permisos
 */
export async function startScanner(elementId, onCodeDetected, onError) {
  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode(elementId, {
        formatsToSupport: BARCODE_FORMATS,
        verbose: false
      });
    }

    // Configuración de la cámara: preferir la cámara trasera ("environment")
    const cameraConfig = { facingMode: 'environment' };

    // Configuración del área de análisis
    const scanConfig = {
      fps: 15, // 15 fotogramas por segundo es óptimo para rendimiento de batería
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        // Área rectangular alargada optimizada para códigos de barras EAN-13
        const width = Math.min(viewfinderWidth * 0.85, 320);
        const height = Math.min(viewfinderHeight * 0.55, 160);
        return { width: Math.floor(width), height: Math.floor(height) };
      },
      aspectRatio: 16 / 10
    };

    // Callback interno cuando la librería detecta texto decodificado
    const onScanSuccess = (decodedText) => {
      const now = Date.now();
      
      // Control de rebote (Debounce): Evita que el mismo código se añada 10 veces en 2 segundos
      if (decodedText === lastScannedCode && (now - lastScannedTimestamp) < 2200) {
        return;
      }

      lastScannedCode = decodedText;
      lastScannedTimestamp = now;

      // Feedback al usuario (sonido y vibración)
      playBeepSound();
      triggerVibration();

      // Enviamos el código limpio a la lógica de la aplicación
      if (typeof onCodeDetected === 'function') {
        onCodeDetected(decodedText.trim());
      }
    };

    await html5QrCode.start(
      cameraConfig,
      scanConfig,
      onScanSuccess,
      () => {
        // Callback de frame no decodificado (normal cuando la cámara aún busca enfocar)
      }
    );

    isScanning = true;
    return true;
  } catch (err) {
    console.warn('[Scanner] No se pudo iniciar el escáner real de la cámara:', err.message);
    isScanning = false;
    if (typeof onError === 'function') {
      onError(err);
    }
    return false;
  }
}

/**
 * Pausa o reanuda la lectura sin desconectar la cámara.
 */
export function pauseScanner() {
  if (html5QrCode && isScanning) {
    try {
      html5QrCode.pause(true);
    } catch (e) {}
  }
}

export function resumeScanner() {
  if (html5QrCode && isScanning) {
    try {
      html5QrCode.resume();
    } catch (e) {}
  }
}

/**
 * Detiene por completo la cámara (libera el hardware).
 */
export async function stopScanner() {
  if (html5QrCode && isScanning) {
    try {
      await html5QrCode.stop();
      isScanning = false;
      isTorchOn = false;
    } catch (err) {
      console.error('[Scanner] Error al detener la cámara:', err);
    }
  }
}

/**
 * Alterna el estado de la linterna (Torch) si la cámara del teléfono lo admite.
 * 
 * @returns {Promise<boolean>} Estado resultante (true = encendida, false = apagada)
 */
export async function toggleTorch() {
  if (!html5QrCode || !isScanning) {
    return false;
  }

  try {
    const track = html5QrCode.getRunningTrackCameraCapabilities();
    if (track && track.torchFeature().isSupported()) {
      isTorchOn = !isTorchOn;
      await track.torchFeature().apply(isTorchOn);
      return isTorchOn;
    } else {
      console.info('[Scanner] La linterna (torch) no está disponible en este dispositivo/navegador.');
      return false;
    }
  } catch (error) {
    console.warn('[Scanner] No se pudo cambiar el estado de la linterna:', error);
    return false;
  }
}

/**
 * Comprueba si la cámara está activa en este momento.
 */
export function isScannerRunning() {
  return isScanning;
}
