const express  = require('express')
const cors     = require('cors')
const fetch    = require('node-fetch')
const FormData = require('form-data')
const { google } = require('googleapis')

const app = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

// ── Variables de entorno ──────────────────────────────────────────────────────
const BOT_TOKEN       = process.env.TELEGRAM_BOT_TOKEN
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID
const SA_RAW          = process.env.GOOGLE_SERVICE_ACCOUNT
const SA_CREDENTIALS  = SA_RAW ? JSON.parse(SA_RAW) : null
const PORT            = process.env.PORT || 3000

// ── Google Drive (opcional) ───────────────────────────────────────────────────
const DRIVE_ENABLED = !!(SA_CREDENTIALS?.client_email && DRIVE_FOLDER_ID)
let drive = null
if (DRIVE_ENABLED) {
  const auth = new google.auth.GoogleAuth({
    credentials: SA_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  })
  drive = google.drive({ version: 'v3', auth })
  console.log('✅ Google Drive habilitado')
} else {
  console.log('⚠️  Google Drive no configurado — usando URLs de Telegram')
}

// ── Sesiones en memoria ───────────────────────────────────────────────────────
const sessions = {}

// ── Telegram helpers ──────────────────────────────────────────────────────────
const TG = (method, body) =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json())

const TGgetFile = (fileId) =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)
    .then(r => r.json())

const TGdownload = (filePath) =>
  fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
    .then(r => r.buffer())

// ── Subir foto (Drive si está configurado, Telegram URL como fallback) ────────
async function storePhoto(buffer, fileName, filePath, chatId, userName) {
  if (DRIVE_ENABLED) {
    // Subir a Google Drive
    const folderRes = await drive.files.list({
      q: `name='${chatId}' and '${DRIVE_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id)',
    })
    let folderId
    if (folderRes.data.files.length > 0) {
      folderId = folderRes.data.files[0].id
    } else {
      const f = await drive.files.create({
        requestBody: { name: chatId, mimeType: 'application/vnd.google-apps.folder', parents: [DRIVE_FOLDER_ID], description: userName },
        fields: 'id',
      })
      folderId = f.data.id
    }
    const { Readable } = require('stream')
    const stream = new Readable()
    stream.push(buffer)
    stream.push(null)
    const res = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: 'image/jpeg', body: stream },
      fields: 'id',
    })
    await drive.permissions.create({
      fileId: res.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    })
    return `https://drive.google.com/uc?export=view&id=${res.data.id}`
  } else {
    // Usar URL directa de Telegram (funciona mientras el servidor esté activo)
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
  }
}

// ── WEBHOOK ───────────────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200)
  try {
    const msg = req.body.message || req.body.channel_post
    if (!msg) return

    const chatId   = String(msg.chat.id)
    const userName = [msg.from?.first_name, msg.from?.last_name]
      .filter(Boolean).join(' ') || msg.chat?.title || 'Usuario'

    if (msg.text === '/start') {
      sessions[chatId] = { chatId, userName, photoCount: 0, photos: [], ready: false, processed: false, createdAt: Date.now(), lastActivity: Date.now() }
      await TG('sendMessage', {
        chat_id: chatId,
        text: `👋 Hola ${userName}!\n\nEnvía tus fotos una por una.\nCuando termines envía /listo\n\nConfirmaré cada foto recibida ✅`,
      })
      return
    }

    if (msg.text === '/listo') {
      if (!sessions[chatId]) sessions[chatId] = { chatId, userName, photoCount: 0, photos: [], ready: false, processed: false, createdAt: Date.now(), lastActivity: Date.now() }
      sessions[chatId].ready = true
      await TG('sendMessage', {
        chat_id: chatId,
        text: `✅ Listo! Recibí ${sessions[chatId].photoCount} foto(s).\nEn breve recibirás los documentos.`,
      })
      return
    }

    if (msg.photo) {
      if (!sessions[chatId]) sessions[chatId] = { chatId, userName, photoCount: 0, photos: [], ready: false, processed: false, createdAt: Date.now(), lastActivity: Date.now() }

      const photo    = msg.photo[msg.photo.length - 1]
      const info     = await TGgetFile(photo.file_id)
      if (!info.ok) return

      const filePath = info.result.file_path
      const buffer   = await TGdownload(filePath)
      const fileName = `${Date.now()}_foto${sessions[chatId].photoCount + 1}.jpg`
      const url      = await storePhoto(buffer, fileName, filePath, chatId, userName)

      sessions[chatId].photoCount++
      sessions[chatId].lastActivity = Date.now()
      sessions[chatId].photos.push({ url, fileName, receivedAt: Date.now() })

      const count = sessions[chatId].photoCount
      await TG('sendMessage', {
        chat_id: chatId,
        text: `📸 Foto ${count} recibida ✅\n${count < 10 ? `Puedes enviar ${10 - count} más o /listo` : 'Envía /listo cuando termines'}`,
      })
      return
    }

    if (msg.text && !msg.text.startsWith('/')) {
      await TG('sendMessage', { chat_id: chatId, text: '📸 Envíame fotos, o /listo cuando termines.' })
    }

  } catch (err) {
    console.error('Webhook error:', err.message)
  }
})

// ── API para la PWA ───────────────────────────────────────────────────────────
app.get('/sessions', (req, res) => {
  const list = Object.values(sessions)
    .filter(s => !s.processed)
    .sort((a, b) => b.lastActivity - a.lastActivity)
  res.json(list)
})

app.get('/session/:chatId/photos', (req, res) => {
  const s = sessions[req.params.chatId]
  res.json(s ? s.photos : [])
})

app.post('/send-documents', async (req, res) => {
  const { chatId, documents } = req.body
  if (!chatId || !documents?.length) return res.status(400).json({ error: 'Faltan datos' })
  try {
    await TG('sendMessage', { chat_id: chatId, text: '📄 Tus documentos están listos:' })
    for (const doc of documents) {
      const buffer = Buffer.from(doc.base64, 'base64')
      const form   = new FormData()
      form.append('chat_id', chatId)
      form.append('document', buffer, {
        filename: doc.name,
        contentType: doc.type === 'word'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/pdf',
      })
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { method: 'POST', body: form })
    }
    if (sessions[chatId]) sessions[chatId].processed = true
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/set-webhook', async (req, res) => {
  const base = process.env.RENDER_EXTERNAL_URL || `https://anexo-backend.onrender.com`
  const result = await TG('setWebhook', { url: `${base}/webhook` })
  res.json(result)
})

app.get('/ping', (req, res) => res.json({ ok: true, drive: DRIVE_ENABLED, sessions: Object.keys(sessions).length }))

app.listen(PORT, () => console.log(`Servidor en puerto ${PORT} | Drive: ${DRIVE_ENABLED}`))
