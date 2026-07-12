/**
 * Aplica recorte, escala y texto estampado a una foto usando Canvas.
 * Devuelve un Blob (JPEG) listo para insertar en el Word o mostrar en preview.
 *
 * @param {HTMLImageElement} img     - Imagen fuente ya cargada
 * @param {Object} crop              - { x, y, width, height } en píxeles sobre la imagen original
 * @param {number} heightScale       - Factor de escala vertical (1.0 = proporcional, >1 = estirado)
 * @param {Object} overlay           - { datetime, name, extra } textos a estampar
 * @param {number} outputWidthPx     - Ancho final en píxeles (corresponde a 9.22 cm a 150 dpi ≈ 544 px)
 * @returns {Promise<Blob>}
 */
export async function renderPhoto(img, crop, heightScale = 1.0, overlay = {}, outputWidthPx = 544) {
  const cropW = crop.width
  const cropH = crop.height

  // Alto proporcional × factor de escala
  const aspectRatio = cropH / cropW
  const outW = outputWidthPx
  const outH = Math.round(outW * aspectRatio * heightScale)

  const canvas = document.createElement('canvas')
  canvas.width = outW
  canvas.height = outH
  const ctx = canvas.getContext('2d')

  // Dibujar imagen recortada y escalada
  ctx.drawImage(
    img,
    crop.x, crop.y, cropW, cropH,  // fuente: área recortada
    0, 0, outW, outH               // destino: canvas completo
  )

  // Estampar texto si hay overlay
  const lines = buildOverlayLines(overlay)
  if (lines.length > 0) {
    const fontSize = Math.max(12, Math.round(outW * 0.030))
    ctx.font = `bold ${fontSize}px monospace`
    ctx.textBaseline = 'bottom'

    const lineH = fontSize + 4
    const padding = 8
    const totalH = lines.length * lineH + padding

    // Fondo semitransparente
    ctx.fillStyle = 'rgba(0,0,0,0.45)'
    ctx.fillRect(0, outH - totalH, outW, totalH)

    // Texto en naranja/amarillo estilo cámara
    ctx.fillStyle = '#FFA500'
    lines.forEach((line, i) => {
      const y = outH - padding - (lines.length - 1 - i) * lineH
      ctx.fillText(line, padding, y)
    })
  }

  return new Promise(resolve => {
    canvas.toBlob(resolve, 'image/jpeg', 0.92)
  })
}

function buildOverlayLines({ datetime, name, extra }) {
  const lines = []
  if (datetime) lines.push(datetime)
  if (name) lines.push(name)
  if (extra) lines.push(extra)
  return lines
}

/**
 * Carga un File/Blob en un HTMLImageElement.
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = reject
    img.src = url
  })
}

/**
 * Convierte un Blob a ArrayBuffer.
 */
export function blobToArrayBuffer(blob) {
  return blob.arrayBuffer()
}

/**
 * Convierte un Blob a base64 string (sin prefijo data:).
 */
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
