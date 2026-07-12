import exifr from 'exifr'

/**
 * Lee la fecha/hora de una foto desde sus metadatos EXIF.
 * Devuelve un objeto { date, time, formatted } o null si no hay EXIF.
 */
export async function readExifDateTime(file) {
  try {
    const exif = await exifr.parse(file, { pick: ['DateTimeOriginal', 'DateTime'] })
    if (!exif) return null

    const raw = exif.DateTimeOriginal || exif.DateTime
    if (!raw) return null

    const d = raw instanceof Date ? raw : new Date(raw)
    if (isNaN(d.getTime())) return null

    const pad = n => String(n).padStart(2, '0')
    const date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    const hour = d.getHours()
    const period = hour < 12 ? 'a.m.' : 'p.m.'

    return {
      date,
      time,
      period,
      formatted: `${d.getDate()} ${getMonthShort(d.getMonth())} ${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${period}`,
    }
  } catch {
    return null
  }
}

function getMonthShort(m) {
  return ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][m]
}
