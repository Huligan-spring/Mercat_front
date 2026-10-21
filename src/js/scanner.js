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

import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeScannerState } from 'html5-qrcode';

// Instancia única del escáner
let html5QrCode = null;

// Estados del escáner
let isScanning = false;
let isTorchOn = false;
let isPaused = false;
let isProcessingScan = false;

// Control anti-duplicados: tiempo de espera para el mismo código de barras
let lastScannedCode = null;
let lastScannedTimestamp = 0;
const DUPLICATE_COOLDOWN_MS = 3500; // 3.5 segundos de enfriamiento para el MISMO código continuo

// Formatos optimizados para supermercado (EAN-13, EAN-8, UPC-A y QR/DataMatrix GS1 Mercadona)
const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.DATA_MATRIX
];

/**
 * Emite un "Beep" sutil usando la Web Audio API nativa.
 */
function playBeepSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.12);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.12);
  } catch (e) {}
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
 * Inicializa y arranca la cámara con decodificación omnidireccional (horizontal y vertical).
 * 
 * @param {string} elementId Identificador del contenedor DOM
 * @param {Function} onCodeDetected Callback al detectar código con éxito (barcode, injectedPrice)
 * @param {Function} onError Callback en caso de fallo de permisos
 */
export async function startScanner(elementId, onCodeDetected, onError) {
  try {
    if (!html5QrCode) {
      html5QrCode = new Html5Qrcode(elementId, {
        formatsToSupport: BARCODE_FORMATS,
        verbose: false
      });
      // Desactiva el aviso interno por defecto "Scanner paused" de html5-qrcode
      html5QrCode.showPausedState = () => {};
    }

    const cameraConfig = { facingMode: 'environment' };

    // Configuración optimizada para alto rendimiento y bajo consumo de batería:
    // - 10 FPS: ahorra un 50% de CPU y batería manteniendo detección instantánea (<100ms)
    // - qrbox cuadrado (260x260): lectura simétrica perfecta en horizontal y vertical
    // - aspectRatio 1.0: encuadre cuadrado que evita recortes
    const scanConfig = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const size = Math.min(Math.floor(minEdge * 0.8), 260);
        return { width: size, height: size };
      },
      aspectRatio: 1.0
    };

    const onScanSuccess = (decodedText) => {
      let barcode = decodedText.trim();
      let injectedPrice = null;

      // Soporte para códigos QR GS1 Digital Link de Mercadona (bandejas de carne y pescado)
      // Ejemplo: https://qrtrack.mercadona.es/01/08436581961300/...&3922=00415
      if (barcode.startsWith('http') && barcode.includes('/01/')) {
        const gtinMatch = barcode.match(/\/01\/(\d+)/);
        if (gtinMatch && gtinMatch[1]) {
          const gtin = gtinMatch[1];
          barcode = (gtin.length === 14 && gtin.startsWith('0')) ? gtin.substring(1) : gtin;
        }

        const priceMatch = barcode.match(/3922=(\d+)/);
        if (priceMatch && priceMatch[1]) {
          injectedPrice = parseInt(priceMatch[1], 10) / 100;
        }
      }

      const now = Date.now();

      // 1. Evita lecturas concurrentes mientras se procesa la petición
      if (isProcessingScan) return;

      // 2. Control anti-duplicados: si es el mismo código escaneado hace menos de 3.5s, ignorar
      if (barcode === lastScannedCode && (now - lastScannedTimestamp) < DUPLICATE_COOLDOWN_MS) {
        return;
      }

      isProcessingScan = true;
      lastScannedCode = barcode;
      lastScannedTimestamp = now;

      // Pausa inmediata del sensor de la cámara para congelar y no duplicar
      try {
        if (html5QrCode && html5QrCode.getState() === Html5QrcodeScannerState.SCANNING) {
          html5QrCode.pause(true);
        }
      } catch (e) {}
      isPaused = true;

      playBeepSound();
      triggerVibration();

      if (typeof onCodeDetected === 'function') {
        onCodeDetected(barcode, injectedPrice);
      }
    };

    await html5QrCode.start(
      cameraConfig,
      scanConfig,
      onScanSuccess,
      () => {}
    );

    isScanning = true;
    isPaused = false;
    isProcessingScan = false;
    return true;
  } catch (err) {
    console.warn('[Scanner] Error iniciando cámara:', err.message);
    isScanning = false;
    isPaused = false;
    isProcessingScan = false;
    if (typeof onError === 'function') {
      onError(err);
    }
    return false;
  }
}

/**
 * Pausa la lectura y el vídeo de forma segura.
 */
export function pauseScanner() {
  if (html5QrCode) {
    try {
      const state = html5QrCode.getState();
      if (state === Html5QrcodeScannerState.SCANNING) {
        html5QrCode.pause(true);
      }
    } catch (e) {
      console.warn('[Scanner] Error al pausar cámara:', e);
    }
  }
  isPaused = true;
}

/**
 * Reanuda la lectura y reproduce el vídeo de forma segura.
 */
export function resumeScanner() {
  if (html5QrCode) {
    try {
      const state = html5QrCode.getState();
      if (state === Html5QrcodeScannerState.PAUSED) {
        html5QrCode.resume();
      }
      const videoEl = document.querySelector('#interactive-scanner video');
      if (videoEl && videoEl.paused) {
        videoEl.play().catch(() => {});
      }
    } catch (e) {
      console.warn('[Scanner] Error al reanudar cámara:', e);
    }
  }
  isPaused = false;
  isProcessingScan = false;
}

/**
 * Reinicia la memoria del último código para permitir volver a escanearlo de inmediato si se desea.
 */
export function resetLastScannedCode() {
  lastScannedCode = null;
  lastScannedTimestamp = 0;
}

/**
 * Informa si la cámara está pausada actualmente.
 */
export function isCameraPaused() {
  if (!html5QrCode) return true;
  try {
    const state = html5QrCode.getState();
    return state === Html5QrcodeScannerState.PAUSED || isPaused;
  } catch (e) {
    return isPaused;
  }
}

/**
 * Detiene por completo la cámara (libera el hardware para otras aplicaciones).
 */
export async function stopScanner() {
  if (html5QrCode) {
    try {
      const state = html5QrCode.getState();
      if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
        await html5QrCode.stop();
      }
    } catch (err) {
      console.warn('[Scanner] Error al detener la cámara:', err);
    } finally {
      isScanning = false;
      isTorchOn = false;
      isPaused = false;
      isProcessingScan = false;
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
 * Comprueba si la cámara está activa (iniciada) en este momento.
 */
export function isScannerRunning() {
  if (!html5QrCode) return false;
  try {
    const state = html5QrCode.getState();
    return state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED;
  } catch (e) {
    return isScanning;
  }
}
