import JSZip from 'jszip'

// Template embebido como base64
let _templateB64 = null
async function getTemplateB64() {
  if (_templateB64) return _templateB64
  const mod = await import('../assets/template_b64.txt?raw')
  _templateB64 = mod.default.replace(/\s/g, '')
  return _templateB64
}

function b64ToUint8(b64) {
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return arr
}

/**
 * Genera un .docx con las fotos insertadas en sus posiciones del Anexo.
 *
 * @param {Array} photos - Array de 10 elementos (índice 0..9 = ANEXO1-izq, ANEXO1-der, ..., ANEXO5-der)
 *                         Cada elemento: { blob: Blob } | null
 * @returns {Promise<Blob>} - El .docx resultante
 */
export async function generateWord(photos) {
  const templateB64 = await getTemplateB64()
  const templateBytes = b64ToUint8(templateB64)

  const zip = await JSZip.loadAsync(templateBytes)

  // Cargar document.xml
  let docXml = await zip.file('word/document.xml').async('string')

  // Cargar relationships
  let relsXml = await zip.file('word/_rels/document.xml.rels').async('string')

  // Cargar [Content_Types].xml
  let contentTypes = await zip.file('[Content_Types].xml').async('string')

  // Insertar cada foto
  const imageEntries = [] // { rId, fileName, blob }
  let rIdCounter = 100

  for (let i = 0; i < 10; i++) {
    const photo = photos[i]
    if (!photo?.blob) continue

    const rId = `rId${rIdCounter++}`
    const fileName = `image_anexo${i + 1}.jpg`
    imageEntries.push({ rId, fileName, blob: photo.blob, slotIndex: i })
  }

  // Agregar imágenes al ZIP
  for (const entry of imageEntries) {
    const arrayBuf = await entry.blob.arrayBuffer()
    zip.file(`word/media/${entry.fileName}`, arrayBuf)
  }

  // Agregar relationships de imágenes
  const newRels = imageEntries.map(e =>
    `<Relationship Id="${e.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${e.fileName}"/>`
  ).join('\n')
  relsXml = relsXml.replace('</Relationships>', `${newRels}\n</Relationships>`)

  // Agregar content types para JPEG si no existe
  if (!contentTypes.includes('image/jpeg')) {
    contentTypes = contentTypes.replace(
      '</Types>',
      '<Default Extension="jpg" ContentType="image/jpeg"/>\n</Types>'
    )
  }

  // Obtener dimensiones de cada foto para el XML
  const photoDimensions = {}
  for (const entry of imageEntries) {
    const dims = await getImageDimensions(entry.blob)
    photoDimensions[entry.slotIndex] = dims
  }

  // Construir XML de drawing para cada foto
  // Ancho fijo: 9.22 cm = 3629160 EMU (1 cm = 360000 EMU, 9.22 * 360000 = 3319200)
  // Usamos exactamente la mitad del ancho de tabla (10459 DXA / 2 = 5229 DXA)
  // 1 DXA = 914.4 EMU → 5229 * 914.4 ≈ 4781566 EMU para la tabla completa
  // Cada foto: mitad → ~2390783 EMU de ancho → ~9.13 cm
  // Usamos 3250000 EMU ≈ 9.03 cm para dejar algo de espacio
  const PHOTO_WIDTH_EMU  = 3320415
  const PHOTO_HEIGHT_EMU_FIXED = 4474845

  // Reemplazar las celdas vacías de cada tabla con las fotos
  // Cada tabla tiene: fila 1 = fotos, fila 2 = descripción
  // Las fotos van en pares: [0,1] → Tabla1, [2,3] → Tabla2, etc.

  docXml = insertPhotosIntoXml(docXml, imageEntries, photoDimensions, PHOTO_WIDTH_EMU)

  // Actualizar archivos en ZIP
  zip.file('word/document.xml', docXml)
  zip.file('word/_rels/document.xml.rels', relsXml)
  zip.file('[Content_Types].xml', contentTypes)

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
  return blob
}

function getImageDimensions(blob) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 1, height: 1 }) }
    img.src = url
  })
}

function makeDrawingXml(rId, widthEmu, heightEmu, name) {
  return `<w:drawing>
  <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
    <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
    <wp:effectExtent l="0" t="0" r="0" b="0"/>
    <wp:docPr id="${Math.floor(Math.random()*9000)+1000}" name="${name}"/>
    <wp:cNvGraphicFramePr>
      <a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/>
    </wp:cNvGraphicFramePr>
    <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
        <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:nvPicPr>
            <pic:cNvPr id="0" name="${name}"/>
            <pic:cNvPicPr/>
          </pic:nvPicPr>
          <pic:blipFill>
            <a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>
            <a:stretch><a:fillRect/></a:stretch>
          </pic:blipFill>
          <pic:spPr>
            <a:xfrm><a:off x="0" y="0"/><a:ext cx="${widthEmu}" cy="${heightEmu}"/></a:xfrm>
            <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
          </pic:spPr>
        </pic:pic>
      </a:graphicData>
    </a:graphic>
  </wp:inline>
</w:drawing>`
}

function insertPhotosIntoXml(docXml, imageEntries, photoDimensions, photoWidthEmu) {
  // Agrupar imágenes por par de Anexo (0-1, 2-3, 4-5, 6-7, 8-9)
  const pairs = []
  for (let a = 0; a < 5; a++) {
    const left = imageEntries.find(e => e.slotIndex === a * 2)
    const right = imageEntries.find(e => e.slotIndex === a * 2 + 1)
    pairs.push({ left, right, anexoIndex: a })
  }

  // Encontrar las celdas de fotos (fila 1 de cada tabla = celda vacía)
  // La estrategia: buscar cada <w:tc> con párrafos vacíos antes de DESCRIPCION
  // Reemplazamos el contenido de la primera celda de cada tabla

  let result = docXml
  let tableCount = 0

  // Reemplazar cada bloque de tabla: encontrar <w:tbl>...</w:tbl>
  result = result.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tableXml) => {
    if (tableCount >= 5) return tableXml
    const pair = pairs[tableCount]
    tableCount++

    if (!pair.left && !pair.right) return tableXml

    // Construir XMLs de foto
    // Altura fija del slot
    const PHOTO_HEIGHT_EMU = PHOTO_HEIGHT_EMU_FIXED // pair.left

    const leftXml = pair.left
      ? `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r>${makeDrawingXml(pair.left.rId, photoWidthEmu, PHOTO_HEIGHT_EMU, `foto_${pair.left.slotIndex + 1}`)}</w:r></w:p>`
      : '<w:p/>'

    const rightPhotoH = pair.right
      ? Math.round(photoWidthEmu * (photoDimensions[pair.right.slotIndex]?.height / photoDimensions[pair.right.slotIndex]?.width || 0.75))
      : PHOTO_HEIGHT_EMU

    const rightXml = pair.right
      ? `<w:p><w:pPr><w:jc w:val="left"/></w:pPr><w:r>${makeDrawingXml(pair.right.rId, photoWidthEmu, rightPhotoH, `foto_${pair.right.slotIndex + 1}`)}</w:r></w:p>`
      : '<w:p/>'

    // Reemplazar la primera fila (celda vacía) con una nested table 1×2 para las fotos
    const nestedTable = `<w:tbl>
  <w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr>
  <w:tr>
    <w:tc><w:tcPr><w:tcW w:w="5229" w:type="dxa"/></w:tcPr>${leftXml}</w:tc>
    <w:tc><w:tcPr><w:tcW w:w="5229" w:type="dxa"/></w:tcPr>${rightXml}</w:tc>
  </w:tr>
</w:tbl>`

    // Reemplazar el contenido de la primera fila
    return tableXml.replace(
      /(<w:tr\b[^>]*>)([\s\S]*?)(<\/w:tr>)([\s\S]*<w:tr\b)/,
      (_, trOpen, trContent, trClose, rest) => {
        const newFirstRow = `${trOpen}<w:tc><w:tcPr><w:tcW w:w="10458" w:type="dxa"/></w:tcPr>${nestedTable}</w:tc>${trClose}`
        return newFirstRow + rest
      }
    )
  })

  return result
}
