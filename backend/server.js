const express    = require('express')
const cors       = require('cors')
const fetch      = require('node-fetch')
const FormData   = require('form-data')
const cloudinary = require('cloudinary').v2

const app  = express()
app.use(cors())
app.use(express.json({ limit: '50mb' }))

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const PORT      = process.env.PORT || 3000

// ── Cloudinary ────────────────────────────────────────────────────────────────
const CLOUD_ENABLED = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
)

if (CLOUD_ENABLED) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  console.log('✅ Cloudinary habilitado')
} else {
  console.log('⚠️  Cloudinary no configurado — usando URLs de Telegram')
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

// ── Subir foto a Cloudinary ───────────────────────────────────────────────────
async function uploadToCloudinary(buffer, folder, fileName) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: `anexo-fotos/${folder}`,
        public_id: fileName.replace('.jpg', ''),
        resource_type: 'image',
        format: 'jpg',
      },
      (error, result) => {
        if (error) reject(error)
        else resolve(result.secure_url)
      }
    )
    stream.end(buffer)
  })
}

// ── WEBHOOK ───────────────────────────────────────────────────────────────────
app.post('/webhook', async (req, res) => {
  res.sendStatus(200)
  try {
    const msg = req.body?.message || req.body?.channel_post
    if (!msg) return

    const chatId   = String(msg.chat.id)
    const userName = [msg.from?.first_name, msg.from?.last_name]
      .filter(Boolean).join(' ') || 'Usuario'

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

    if (msg.text === '/listo') {
      if (!sessions[chatId]) sessions[chatId] = { chatId, userName, photoCount: 0, photos: [], ready: false, processed: false, createdAt: Date.now(), lastActivity: Date.now() }
      sessions[chatId].ready = true
      await TG('sendMessage', {
        chat_id: chatId,
        text: `✅ Recibí ${sessions[chatId].photoCount} foto(s).\nEn breve recibirás los documentos.`,
      })
      return
    }

    if (msg.photo) {
      if (!sessions[chatId]) sessions[chatId] = { chatId, userName, photoCount: 0, photos: [], ready: false, processed: false, createdAt: Date.now(), lastActivity: Date.now() }

      const photo  = msg.photo[msg.photo.length - 1]
      const info   = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${photo.file_id}`).then(r => r.json())
      if (!info.ok) return

      const filePath = info.result.file_path
      const fileName = `${Date.now()}_foto${sessions[chatId].photoCount + 1}`

      // Registrar inmediatamente con URL temporal
      sessions[chatId].photoCount++
      sessions[chatId].lastActivity = Date.now()
      const idx = sessions[chatId].photos.length
      const telegramUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`
      sessions[chatId].photos.push({ url: telegramUrl, fileName: fileName + '.jpg', receivedAt: Date.now(), inCloud: false })

      // Responder al usuario de inmediato
      const count = sessions[chatId].photoCount
      await TG('sendMessage', {
        chat_id: chatId,
        text: `📸 Foto ${count} recibida ✅\n${count < 10 ? `Puedes enviar ${10 - count} más o /listo` : 'Envía /listo cuando termines'}`,
      })

      // Subir a Cloudinary en segundo plano
      if (CLOUD_ENABLED) {
        fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`)
          .then(r => r.buffer())
          .then(buf => uploadToCloudinary(buf, chatId, fileName))
          .then(cloudUrl => {
            if (sessions[chatId]?.photos[idx]) {
              sessions[chatId].photos[idx].url     = cloudUrl
              sessions[chatId].photos[idx].inCloud = true
              console.log(`☁️  Cloudinary: ${fileName} subida OK`)
            }
          })
          .catch(e => console.error('Cloudinary error:', e.message))
      }
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

// ── Proxy de fotos (para URLs de Telegram que requieren autenticación) ────────
app.get('/photo', async (req, res) => {
  const { url } = req.query
  if (!url) return res.status(400).send('URL requerida')
  try {
    const r = await fetch(url)
    const b = await r.buffer()
    res.set('Content-Type', 'image/jpeg')
    res.set('Cache-Control', 'public, max-age=86400')
    res.send(b)
  } catch (e) {
    res.status(500).send('Error')
  }
})

app.get('/set-webhook', async (req, res) => {
  const result = await TG('setWebhook', { url: 'https://anexo-backend.onrender.com/webhook' })
  res.json(result)
})

app.get('/ping', (req, res) => res.json({
  ok: true,
  cloudinary: CLOUD_ENABLED,
  sessions: Object.keys(sessions).length,
  uptime: Math.round(process.uptime()) + 's',
}))

app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`)
  console.log(`   Cloudinary: ${CLOUD_ENABLED ? '✅' : '⚠️  deshabilitado'}`)
  console.log(`   Bot token:  ${BOT_TOKEN ? '✅' : '❌ falta'}`)
})
