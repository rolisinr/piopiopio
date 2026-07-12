/**
 * Renderiza una foto en el tamaño fijo del slot, aplicando
 * la posición/zoom elegidos por el usuario y el texto estampado.
 *
 * @param {HTMLImageElement} img
 * @param {{ scale, offsetX, offsetY }} state  - pan/zoom del usuario
 * @param {{ datetime, name, extra }} overlay
 * @param {number} slotW  - ancho de salida en px (544)
 * @param {number} slotH  - alto de salida en px  (733)
 * @returns {Promise<Blob>}
 */
export async function renderPhotoFixed(img, state, overlay = {}, slotW = 544, slotH = 733) {
  const canvas = document.createElement('canvas')
  canvas.width  = slotW
  canvas.height = slotH
  const ctx = canvas.getContext('2d')

  // Fondo negro por si la foto no cubre todo
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, slotW, slotH)

  const { scale = 1, offsetX = 0, offsetY = 0 } = state
  const photoW = img.naturalWidth  * scale
  const photoH = img.naturalHeight * scale
  const x = (slotW - photoW) / 2 + offsetX
  const y = (slotH - photoH) / 2 + offsetY

  ctx.drawImage(img, x, y, photoW, photoH)

  // Texto estampado
  const lines = [overlay.datetime, overlay.name, overlay.extra].filter(Boolean)
  if (lines.length > 0) {
    const fontSize = Math.max(14, Math.round(slotW * 0.028))
    ctx.font = `bold ${fontSize}px monospace`
    ctx.textBaseline = 'bottom'
    const lineH   = fontSize + 4
    const padding = 8
    const totalH  = lines.length * lineH + padding

    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, slotH - totalH, slotW, totalH)

    ctx.fillStyle = '#FFA500'
    lines.forEach((line, i) => {
      ctx.fillText(line, padding, slotH - padding - (lines.length - 1 - i) * lineH)
    })
  }

  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
}

/** Carga un File/Blob en un HTMLImageElement */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}
