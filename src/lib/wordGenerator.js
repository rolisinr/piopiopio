import JSZip from 'jszip'

// Ancho fijo por foto: 5229 DXA × 635 EMU/DXA = 3,320,415 EMU ≈ 9.22 cm
const SLOT_W_EMU = 5229 * 635

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

function getImgDims(blob) {
  return new Promise(res => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload  = () => { URL.revokeObjectURL(url); res({ w: img.naturalWidth, h: img.naturalHeight }) }
    img.onerror = () => { URL.revokeObjectURL(url); res({ w: 4, h: 3 }) }
    img.src = url
  })
}

function drawingXml(rId, wEmu, hEmu, name) {
  const id = Math.floor(Math.random() * 9000) + 1000
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${wEmu}" cy="${hEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${wEmu}" cy="${hEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`
}

export async function generateWord(photos) {
  const zip = await JSZip.loadAsync(b64ToUint8(await getTemplateB64()))
  let docXml       = await zip.file('word/document.xml').async('string')
  let relsXml      = await zip.file('word/_rels/document.xml.rels').async('string')
  let contentTypes = await zip.file('[Content_Types].xml').async('string')

  if (!contentTypes.includes('image/jpeg'))
    contentTypes = contentTypes.replace('</Types>', '<Default Extension="jpg" ContentType="image/jpeg"/>\n</Types>')

  let rId = 100
  const entries = []
  for (let i = 0; i < 10; i++) {
    const p = photos[i]
    if (!p?.blob) continue
    const fname = `img_slot${i}.jpg`
    const dims  = await getImgDims(p.blob)
    // Altura proporcional al ancho fijo
    const hEmu  = Math.round(SLOT_W_EMU * dims.h / dims.w)
    entries.push({ rId: `rId${rId++}`, fname, blob: p.blob, slot: i, wEmu: SLOT_W_EMU, hEmu })
    zip.file(`word/media/${fname}`, await p.blob.arrayBuffer())
  }

  relsXml = relsXml.replace('</Relationships>',
    entries.map(e => `<Relationship Id="${e.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${e.fname}"/>`).join('\n')
    + '\n</Relationships>')

  // Insertar fotos en las tablas
  let tbl = 0
  docXml = docXml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, xml => {
    if (tbl >= 5) return xml
    const a = tbl++
    const L = entries.find(e => e.slot === a * 2)
    const R = entries.find(e => e.slot === a * 2 + 1)
    if (!L && !R) return xml

    const cell = (e) => e
      ? `<w:tc><w:tcPr><w:tcW w:w="5229" w:type="dxa"/></w:tcPr><w:p><w:r>${drawingXml(e.rId, e.wEmu, e.hEmu, `foto${e.slot}`)}</w:r></w:p></w:tc>`
      : `<w:tc><w:tcPr><w:tcW w:w="5229" w:type="dxa"/></w:tcPr><w:p/></w:tc>`

    const nested = `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr><w:tr>${cell(L)}${cell(R)}</w:tr></w:tbl>`

    return xml.replace(
      /(<w:tr\b[^>]*>)([\s\S]*?)(<\/w:tr>)([\s\S]*<w:tr\b)/,
      (_, o, _c, cl, rest) => `${o}<w:tc><w:tcPr><w:tcW w:w="10458" w:type="dxa"/></w:tcPr>${nested}</w:tc>${cl}${rest}`
    )
  })

  zip.file('word/document.xml', docXml)
  zip.file('word/_rels/document.xml.rels', relsXml)
  zip.file('[Content_Types].xml', contentTypes)

  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
}
