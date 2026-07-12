export const SLOT_W = 544   // 9.22 cm a 150 DPI
export const SLOT_H = 733   // 12.43 cm a 150 DPI

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

/**
 * Fase 1 — Crop: recorta la foto según el estado de pan/zoom en el frame de recorte.
 * Devuelve un Blob JPEG con solo la parte visible.
 */
export async function cropPhoto(img, cropState, cropW, cropH) {
  const { scale = 1, offsetX = 0, offsetY = 0 } = cropState
  const canvas = document.createElement('canvas')
  canvas.width  = cropW
  canvas.height = cropH
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, cropW, cropH)
  const photoW = img.naturalWidth  * scale
  const photoH = img.naturalHeight * scale
  const x = (cropW - photoW) / 2 + offsetX
  const y = (cropH - photoH) / 2 + offsetY
  ctx.drawImage(img, x, y, photoW, photoH)
  return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.95))
}

/**
 * Fase 2 — Stamp: estampa texto en la esquina inferior izquierda de la foto.
 * Texto blanco con sombra sutil, sin caja de fondo.
 */
export async function stampPhoto(blob, overlay) {
  const lines = [overlay.datetime, overlay.name, overlay.extra].filter(Boolean)
  if (!lines.length) return blob

  const img = await loadImage(blob)
  const canvas = document.createElement('canvas')
  canvas.width  = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)

  const fontSize = Math.max(12, Math.round(img.naturalWidth * 0.032))
  ctx.font = `bold ${fontSize}px monospace`
  ctx.textBaseline = 'bottom'
  const lineH  = fontSize + 3
  const pad    = Math.round(img.naturalWidth * 0.015)

  lines.forEach((line, i) => {
    const y = img.naturalHeight - pad - (lines.length - 1 - i) * lineH
    // Sombra para legibilidad sin caja
    ctx.shadowColor   = 'rgba(0,0,0,0.85)'
    ctx.shadowBlur    = 4
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(line, pad, y)
  })
  ctx.shadowColor = 'transparent'

  return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92))
}

/**
 * Fase 3 — Slot: posiciona la foto estampada en el slot fijo del Word.
 * Devuelve un Blob JPEG de exactamente SLOT_W × SLOT_H px.
 */
export async function placeInSlot(blob, slotState) {
  const img = await loadImage(blob)
  const canvas = document.createElement('canvas')
  canvas.width  = SLOT_W
  canvas.height = SLOT_H
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, SLOT_W, SLOT_H)
  const { scale = 1, offsetX = 0, offsetY = 0 } = slotState
  const photoW = img.naturalWidth  * scale
  const photoH = img.naturalHeight * scale
  const x = (SLOT_W - photoW) / 2 + offsetX
  const y = (SLOT_H - photoH) / 2 + offsetY
  ctx.drawImage(img, x, y, photoW, photoH)
  return new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.92))
}

/** Escala de cobertura inicial (cover fit) */
export function coverScale(imgW, imgH, frameW, frameH) {
  return Math.max(frameW / imgW, frameH / imgH)
}
