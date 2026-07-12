import { PDFDocument } from 'pdf-lib'

/**
 * Une dos PDFs de SUNAT en un solo PDF.
 * @param {File} pdf1 - Recibo por honorarios
 * @param {File} pdf2 - Recibo de validez
 * @returns {Promise<Blob>}
 */
export async function mergeSunatPdfs(pdf1, pdf2) {
  const [bytes1, bytes2] = await Promise.all([
    pdf1.arrayBuffer(),
    pdf2.arrayBuffer(),
  ])

  const merged = await PDFDocument.create()

  const doc1 = await PDFDocument.load(bytes1)
  const doc2 = await PDFDocument.load(bytes2)

  const pages1 = await merged.copyPages(doc1, doc1.getPageIndices())
  const pages2 = await merged.copyPages(doc2, doc2.getPageIndices())

  pages1.forEach(p => merged.addPage(p))
  pages2.forEach(p => merged.addPage(p))

  const pdfBytes = await merged.save()
  return new Blob([pdfBytes], { type: 'application/pdf' })
}
