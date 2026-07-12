import JSZip from 'jszip'

// Dimensiones fijas del slot en EMU (English Metric Units)
// 1 DXA = 635 EMU  |  ancho=5229 DXA  |  alto=7047 DXA
const SLOT_W_EMU = 5229 * 635   // 3,320,415 EMU ≈ 9.22 cm
const SLOT_H_EMU = 7047 * 635   // 4,474,845 EMU ≈ 12.43 cm

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
 * Genera el .docx insertando las fotos en las celdas del template.
 * @param {Array} photos  - 10 slots: { blob } | null  (índice 0..9)
 */
export async function generateWord(photos) {
  const zip = await JSZip.loadAsync(b64ToUint8(await getTemplateB64()))

  let docXml       = await zip.file('word/document.xml').async('string')
  let relsXml      = await zip.file('word/_rels/document.xml.rels').async('string')
  let contentTypes = await zip.file('[Content_Types].xml').async('string')

  // Registrar imágenes
  let rIdCounter = 100
  const entries = []
  for (let i = 0; i < 10; i++) {
    const photo = photos[i]
    if (!photo?.blob) continue
    const rId      = `rId${rIdCounter++}`
    const fileName = `image_slot${i}.jpg`
    entries.push({ rId, fileName, blob: photo.blob, slotIndex: i })
    zip.file(`word/media/${fileName}`, await photo.blob.arrayBuffer())
  }

  // Relationships
  const newRels = entries.map(e =>
    `<Relationship Id="${e.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${e.fileName}"/>`
  ).join('\n')
  relsXml = relsXml.replace('</Relationships>', `${newRels}\n</Relationships>`)

  // Content types
  if (!contentTypes.includes('image/jpeg'))
    contentTypes = contentTypes.replace('</Types>', '<Default Extension="jpg" ContentType="image/jpeg"/>\n</Types>')

  // Insertar en XML
  docXml = insertPhotos(docXml, entries)

  zip.file('word/document.xml', docXml)
  zip.file('word/_rels/document.xml.rels', relsXml)
  zip.file('[Content_Types].xml', contentTypes)

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })
}

function drawingXml(rId, name) {
  const id = Math.floor(Math.random() * 9000) + 1000
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${SLOT_W_EMU}" cy="${SLOT_H_EMU}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${SLOT_W_EMU}" cy="${SLOT_H_EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`
}

function photoXml(entry) {
  return `<w:p><w:r>${drawingXml(entry.rId, `foto_${entry.slotIndex + 1}`)}</w:r></w:p>`
}

function insertPhotos(docXml, entries) {
  let tableCount = 0
  return docXml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, tableXml => {
    if (tableCount >= 5) return tableXml
    const a     = tableCount++
    const left  = entries.find(e => e.slotIndex === a * 2)
    const right = entries.find(e => e.slotIndex === a * 2 + 1)
    if (!left && !right) return tableXml

    const nestedTable = `<w:tbl>
<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr>
<w:tr>
  <w:tc><w:tcPr><w:tcW w:w="5229" w:type="dxa"/></w:tcPr>${left ? photoXml(left) : '<w:p/>'}</w:tc>
  <w:tc><w:tcPr><w:tcW w:w="5229" w:type="dxa"/></w:tcPr>${right ? photoXml(right) : '<w:p/>'}</w:tc>
</w:tr>
</w:tbl>`

    return tableXml.replace(
      /(<w:tr\b[^>]*>)([\s\S]*?)(<\/w:tr>)([\s\S]*<w:tr\b)/,
      (_, open, _content, close, rest) =>
        `${open}<w:tc><w:tcPr><w:tcW w:w="10458" w:type="dxa"/></w:tcPr>${nestedTable}</w:tc>${close}${rest}`
    )
  })
}
