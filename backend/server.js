const express  = require('express')
const cors     = require('cors')
const fetch    = require('node-fetch')
const FormData = require('form-data')

const app  = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const PORT      = process.env.PORT || 3000

// ── Google Drive (completamente opcional) ─────────────────────────────────────
let drive         = null
let DRIVE_ENABLED = false
let DRIVE_FOLDER  = process.env.GOOGLE_DRIVE_FOLDER_ID || ''

try {
  const SA_RAW = process.env.GOOGLE_SERVICE_ACCOUNT || ''
  if (SA_RAW && DRIVE_FOLDER) {
    const { google } = require('googleapis')
    const creds = JSON.parse(SA_RAW)
    if (creds.client_email) {
      const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      })
      drive = google.drive({ version: 'v3', auth })
      DRIVE_ENABLED = true
      console.log('✅ Google Drive habilitado:', creds.client_email)
    } else {
      console.log('⚠️  GOOGLE_SERVICE_ACCOUNT no tiene client_email')
    }
  } else {
    console.log('⚠️  Drive no configurado — fotos guardadas en memoria + URL Telegram')
  }
} catch (e) {
  console.error('❌ Error al inicializar Drive:', e.message)
  console.log('   Continuando sin Drive...')
}

// ── Sesiones en memoria ───────────────────────────────────────────────────────
const sessions = {}

// ── Telegram ──────────────────────────────────────────────────────────────────
const TG = (method, body) =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json())

// ── Subir foto a Drive (solo si está habilitado) ──────────────────────────────
async function uploadToDrive(buffer, fileName, chatId, userName) {
  // Buscar o crear carpeta del usuario
  const listRes = await drive.files.list({
    q: `name='${chatId}' and '${DRIVE_FOLDER}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
  })

  let folderId
  if (listRes.data.files.length > 0) {
    folderId = listRes.data.files[0].id
  } else {
    const f = await drive.files.create({
      requestBody: {
        name: chatId,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [DRIVE_FOLDER],
        description: userName,
      },
      fields: 'id',
    })
    folderId = f.data.id
  }

  // Subir foto
  const { Readable } = require('stream')
  const stream = new Readable()
  stream.push(buffer)
  stream.push(null)

  const res = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType: 'image/jpeg', body: stream },
    fields: 'id',
  })

  // Hacer pública
  await drive.permissions.create({
    fileId: res.data.id,
    requestBody: { role: 'reader', type: 'anyone' },
  })

  return `https://drive.google.com/uc?export=view&id=${res.data.id}`
}

// ── WEBHOOK ───────────────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200) // Siempre responder 200 a Telegram

  try {
    const msg = req.body?.message || req.body?.channel_post
    if (!msg) return

    const chatId   = String(msg.chat.id)
    const userName = [msg.from?.first_name, msg.from?.last_name]
      .filter(Boolean).join(' ') || 'Usuario'

    // /start
    if (msg.text === '/start') {
      sessions[chatId] = {
        chatId, userName,
        photoCount: 0, photos: [],
        ready: false, processed: false,
        createdAt: Date.now(), lastActivity: Date.now(),
      }
      await TG('sendMessage', {
        chat_id: chatId,
        text: `👋 Hola ${userName}!\n\nEnvía tus fotos una por una.\nCuando termines envía /listo ✅`,
      })
      return
    }

    // /listo
    if (msg.text === '/listo') {
      if (!sessions[chatId]) {
        sessions[chatId] = { chatId, userName, photoCount: 0, photos: [], ready: false, processed: false, createdAt: Date.now(), lastActivity: Date.now() }
      }
      sessions[chatId].ready = true
      const count = sessions[chatId].photoCount
      await TG('sendMessage', {
        chat_id: chatId,
        text: `✅ Recibí ${count} foto(s).\nEn breve recibirás los documentos.`,
      })
      return
    }

    // Foto recibida
    if (msg.photo) {
      if (!sessions[chatId]) {
        sessions[chatId] = { chatId, userName, photoCount: 0, photos: [], ready: false, processed: false, createdAt: Date.now(), lastActivity: Date.now() }
      }

      // Obtener la foto en mayor resolución
      const photo  = msg.photo[msg.photo.length - 1]
      const info   = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${photo.file_id}`).then(r => r.json())
      if (!info.ok) return

      const filePath = info.result.file_path
      const fileName = `${Date.now()}_foto${sessions[chatId].photoCount + 1}.jpg`

      // Registrar foto en sesión ANTES de subir (así el contador siempre es correcto)
      sessions[chatId].photoCount++
      sessions[chatId].lastActivity = Date.now()
      const photoIndex = sessions[chatId].photos.length

      // URL temporal de Telegram (funciona durante la sesión)
      const telegramUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
      sessions[chatId].photos.push({ url: telegramUrl, fileName, receivedAt: Date.now(), inDrive: false })

      // Intentar subir a Drive en segundo plano (no bloquea la respuesta)
      if (DRIVE_ENABLED) {
        fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
          .then(r => r.buffer())
          .then(buffer => uploadToDrive(buffer, fileName, chatId, userName))
          .then(driveUrl => {
            if (sessions[chatId]?.photos[photoIndex]) {
              sessions[chatId].photos[photoIndex].url     = driveUrl
              sessions[chatId].photos[photoIndex].inDrive = true
            }
            console.log(`Drive: foto ${fileName} subida OK`)
          })
          .catch(e => console.error('Drive upload error:', e.message))
      }

      // Responder al usuario inmediatamente
      const count = sessions[chatId].photoCount
      await TG('sendMessage', {
        chat_id: chatId,
        text: `📸 Foto ${count} recibida ✅\n${count < 10 ? `Puedes enviar ${10 - count} más o /listo` : 'Envía /listo cuando termines'}`,
      })
      return
    }

    // Mensaje de texto no reconocido
    if (msg.text && !msg.text.startsWith('/')) {
      await TG('sendMessage', {
        chat_id: chatId,
        text: '📸 Envíame fotos, o /listo cuando termines.',
      })
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
  if (!chatId || !documents?.length)
    return res.status(400).json({ error: 'Faltan datos' })
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

// ── Registrar webhook ─────────────────────────────────────────────────────────
app.get('/set-webhook', async (req, res) => {
  const base   = `https://anexo-backend.onrender.com`
  const result = await TG('setWebhook', { url: `${base}/webhook` })
  res.json(result)
})

// ── Debug y ping ──────────────────────────────────────────────────────────────
app.get('/ping', (req, res) => res.json({
  ok: true,
  drive: DRIVE_ENABLED,
  sessions: Object.keys(sessions).length,
  uptime: Math.round(process.uptime()) + 's',
}))

app.get('/debug', (req, res) => res.json({
  drive_enabled: DRIVE_ENABLED,
  has_bot_token: !!BOT_TOKEN,
  has_drive_folder: !!DRIVE_FOLDER,
  has_service_account: !!process.env.GOOGLE_SERVICE_ACCOUNT,
  sessions: Object.keys(sessions).length,
}))

app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`)
  console.log(`   Drive: ${DRIVE_ENABLED ? '✅ habilitado' : '⚠️  deshabilitado'}`)
  console.log(`   Bot token: ${BOT_TOKEN ? '✅' : '❌ falta TELEGRAM_BOT_TOKEN'}`)
})

// ── Proxy de fotos (evita problema de autenticación con URLs de Telegram) ──
app.get('/photo', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).send('URL requerida')
  try {
    const response = await fetch(url)
    const buffer   = await response.buffer()
    res.set('Content-Type', 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(buffer)
  } catch (e) {
    res.status(500).send('Error al cargar foto')
  }
})
