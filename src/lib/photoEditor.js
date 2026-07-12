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
 * Renderiza la foto con recorte (pan/zoom), texto estampado y la devuelve como Blob.
 * El ancho de salida es fijo (SLOT_W). La altura es proporcional al recorte elegido.
 *
 * @param {HTMLImageElement} img
 * @param {{ scale, dx, dy }} panZoom  - dx/dy en píxeles de pantalla del canvas
 * @param {{ datetime, name, extra }} overlay
 * @param {number} canvasW  - ancho del canvas de preview en px
 * @param {number} canvasH  - alto del canvas de preview en px
 * @param {number} outW     - ancho de salida en px (para el Word)
 */
export async function renderCrop(img, panZoom, overlay, canvasW, canvasH, outW = 544) {
  // Dibujar preview en canvas de pantalla
  const previewCanvas = document.createElement('canvas')
  previewCanvas.width  = canvasW
  previewCanvas.height = canvasH
  drawOnCanvas(previewCanvas.getContext('2d'), img, panZoom, canvasW, canvasH, overlay)

  // Dibujar salida a resolución Word (proporcional)
  const outH = Math.round(outW * canvasH / canvasW)
  const outCanvas = document.createElement('canvas')
  outCanvas.width  = outW
  outCanvas.height = outH
  const scaleRatio = outW / canvasW
  const scaledPan  = { scale: panZoom.scale * scaleRatio, dx: panZoom.dx * scaleRatio, dy: panZoom.dy * scaleRatio }
  drawOnCanvas(outCanvas.getContext('2d'), img, scaledPan, outW, outH, overlay)

  return {
    previewUrl: previewCanvas.toDataURL('image/jpeg', 0.85),
    blob: await new Promise(r => outCanvas.toBlob(r, 'image/jpeg', 0.92)),
    aspectRatio: canvasH / canvasW,
  }
}

function drawOnCanvas(ctx, img, { scale, dx, dy }, W, H, overlay) {
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, W, H)

  const photoW = img.naturalWidth  * scale
  const photoH = img.naturalHeight * scale
  const x = W / 2 - photoW / 2 + dx
  const y = H / 2 - photoH / 2 + dy
  ctx.drawImage(img, x, y, photoW, photoH)

  // Texto blanco con sombra, sin caja
  const lines = [overlay?.datetime, overlay?.name, overlay?.extra].filter(Boolean)
  if (lines.length) {
    const fs  = Math.max(11, Math.round(W * 0.030))
    ctx.font  = `bold ${fs}px monospace`
    ctx.textBaseline = 'bottom'
    const lh  = fs + 3
    const pad = Math.round(W * 0.02)
    ctx.shadowColor   = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur    = 5
    ctx.shadowOffsetX = 1
    ctx.shadowOffsetY = 1
    ctx.fillStyle = '#FFFFFF'
    lines.forEach((line, i) => {
      ctx.fillText(line, pad, H - pad - (lines.length - 1 - i) * lh)
    })
    ctx.shadowColor = 'transparent'
  }
}

/** Escala cover inicial */
export function coverScale(imgW, imgH, frameW, frameH) {
  return Math.max(frameW / imgW, frameH / imgH)
}
