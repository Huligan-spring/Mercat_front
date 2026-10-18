/**
 * =========================================================================
 * Módulo de Control de Presupuesto (Límites y Alertas Visuales)
 * =========================================================================
 * 
 * Este módulo gestiona:
 * 1. El límite de gasto fijado por el usuario (ej: 90 €).
 * 2. El cálculo del porcentaje consumido respecto al total de la cesta.
 * 3. Los semáforos de color didácticos:
 *    - Verde (< 85%): Dentro del objetivo de gasto.
 *    - Ámbar (85% - 100%): Advertencia, nos acercamos al límite.
 *    - Rojo (> 100%): Hemos superado el presupuesto previsto.
 */

const BUDGET_STORAGE_KEY = 'mercat_user_budget_limit';
const DEFAULT_BUDGET = 90; // Valor por defecto amigable

/**
 * Obtiene el presupuesto configurado en el dispositivo.
 */
export function getStoredBudget() {
  try {
    const val = localStorage.getItem(BUDGET_STORAGE_KEY);
    if (val !== null && val !== undefined && val !== '') {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 200) {
        return parsed;
      }
    }
  } catch (e) {}
  return DEFAULT_BUDGET;
}

/**
 * Guarda un nuevo límite de presupuesto fijado por el usuario.
 * 
 * @param {number} newBudget Importe en euros (entre 1 y 200)
 */
export function saveBudget(newBudget) {
  let val = parseFloat(newBudget);
  if (isNaN(val) || val <= 0) val = DEFAULT_BUDGET;
  val = Math.max(1, Math.min(200, val)); // Límite de 1 € a 200 €
  val = Math.round(val * 100) / 100; // Conservar hasta 2 decimales (céntimos)

  try {
    localStorage.setItem(BUDGET_STORAGE_KEY, val.toString());
  } catch (e) {}
  return val;
}

/**
 * Calcula el estado del presupuesto para actualizar la interfaz.
 * 
 * @param {number} currentTotal Importe total actual de la cesta
 * @param {number} budgetLimit Límite fijado
 * @returns {Object} Datos estructurados para pintar la barra de progreso
 */
export function evaluateBudget(currentTotal, budgetLimit) {
  const safeTotal = Math.max(0, currentTotal || 0);
  const safeLimit = Math.max(1, budgetLimit || DEFAULT_BUDGET);

  // Porcentaje exacto (puede superar el 100% si nos pasamos)
  const percent = (safeTotal / safeLimit) * 100;
  
  // Ancho de la barra en el DOM (máximo 100% visual para no desbordar el contenedor)
  const barWidth = Math.min(100, Math.max(0, percent));

  if (percent > 100) {
    return {
      percent: Math.round(percent),
      barWidth: 100,
      state: 'danger',
      barColorClass: 'bg-error',
      textColorClass: 'text-error',
      iconName: 'warning',
      message: '¡Presupuesto superado!'
    };
  } else if (percent >= 85) {
    return {
      percent: Math.round(percent),
      barWidth: barWidth,
      state: 'warning',
      barColorClass: 'bg-amber-500',
      textColorClass: 'text-amber-600',
      iconName: 'info',
      message: 'Cerca del límite'
    };
  } else {
    return {
      percent: Math.round(percent),
      barWidth: barWidth,
      state: 'ok',
      barColorClass: 'bg-primary',
      textColorClass: 'text-primary',
      iconName: 'savings',
      message: 'Presupuesto'
    };
  }
}
