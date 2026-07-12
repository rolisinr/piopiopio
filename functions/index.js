const { onRequest } = require('firebase-functions/v2/https')
const { setGlobalOptions } = require('firebase-functions/v2')
const admin = require('firebase-admin')
const fetch = require('node-fetch')
const FormData = require('form-data')

admin.initializeApp()
setGlobalOptions({ region: 'us-central1' })

const db      = admin.firestore()
const storage = admin.storage()
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

// ── Helpers de Telegram ──────────────────────────────────────────────────────

const TG = (method, body) =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json())

const TGFile = (fileId) =>
  fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`)
    .then(r => r.json())

const downloadFile = (path) =>
  fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${path}`)
    .then(r => r.buffer())

// ── Webhook de Telegram ──────────────────────────────────────────────────────

exports.telegramWebhook = onRequest(
  { cors: false, secrets: ['TELEGRAM_BOT_TOKEN'] },
  async (req, res) => {
    res.sendStatus(200) // Responder rápido a Telegram

    try {
      const update = req.body
      const msg    = update.message || update.channel_post
      if (!msg) return

      const chatId   = String(msg.chat.id)
      const userName = msg.from?.first_name || msg.chat?.title || 'Usuario'

      // ── /start ──────────────────────────────────────────────────────────
      if (msg.text === '/start') {
        await db.collection('sessions').doc(chatId).set({
          chatId,
          userName,
          active: true,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          photoCount: 0,
        }, { merge: true })

        await TG('sendMessage', {
          chat_id: chatId,
          text: `👋 Hola ${userName}!\n\nEnvía tus fotos una por una.\nCuando termines envía /listo\n\nYo te confirmaré cada foto recibida ✅`,
        })
        return
      }

      // ── /listo ──────────────────────────────────────────────────────────
      if (msg.text === '/listo') {
        const snap = await db.collection('sessions').doc(chatId).get()
        const count = snap.data()?.photoCount || 0
        await db.collection('sessions').doc(chatId).update({ ready: true })
        await TG('sendMessage', {
          chat_id: chatId,
          text: `✅ Listo! Recibí ${count} foto(s).\n\nEn breve recibirás los documentos generados.`,
        })
        return
      }

      // ── Foto recibida ───────────────────────────────────────────────────
      if (msg.photo) {
        // Tomar la foto en mayor resolución
        const photo  = msg.photo[msg.photo.length - 1]
        const fileId = photo.file_id

        // Obtener URL de descarga
        const fileInfo = await TGFile(fileId)
        if (!fileInfo.ok) return

        // Descargar la foto
        const buffer   = await downloadFile(fileInfo.result.file_path)
        const fileName = `${Date.now()}_${fileId.slice(-8)}.jpg`
        const filePath = `photos/${chatId}/${fileName}`

        // Subir a Firebase Storage
        const bucket = storage.bucket()
        const file   = bucket.file(filePath)
        await file.save(buffer, { contentType: 'image/jpeg', public: true })

        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`

        // Guardar metadato en Firestore
        const sessionRef = db.collection('sessions').doc(chatId)
        await sessionRef.set({
          chatId,
          userName,
          active: true,
          lastActivity: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })

        await sessionRef.collection('photos').add({
          url: publicUrl,
          fileName,
          fileId,
          receivedAt: admin.firestore.FieldValue.serverTimestamp(),
          processed: false,
        })

        // Actualizar contador
        await sessionRef.update({
          photoCount: admin.firestore.FieldValue.increment(1),
        })

        // Obtener conteo actualizado
        const snap  = await sessionRef.get()
        const count = snap.data()?.photoCount || 1

        await TG('sendMessage', {
          chat_id: chatId,
          text: `📸 Foto ${count} recibida ✅\n${count < 10 ? `Puedes enviar ${10 - count} más o envía /listo` : 'Envía /listo cuando termines'}`,
        })
        return
      }

      // ── Texto no reconocido ─────────────────────────────────────────────
      if (msg.text && !msg.text.startsWith('/')) {
        await TG('sendMessage', {
          chat_id: chatId,
          text: '📸 Envíame tus fotos directamente o usa /listo cuando termines.',
        })
      }

    } catch (err) {
      console.error('Webhook error:', err)
    }
  }
)

// ── Registrar webhook en Telegram ────────────────────────────────────────────
// Llamar una sola vez: GET /setWebhook?url=https://...

exports.setWebhook = onRequest(
  { cors: true, secrets: ['TELEGRAM_BOT_TOKEN'] },
  async (req, res) => {
    const webhookUrl = `https://us-central1-anexo-app.cloudfunctions.net/telegramWebhook`
    const result = await TG('setWebhook', { url: webhookUrl })
    res.json(result)
  }
)

// ── API: listar sesiones activas para la PWA ─────────────────────────────────

exports.getSessions = onRequest(
  { cors: true },
  async (req, res) => {
    const snap = await db.collection('sessions')
      .where('active', '==', true)
      .orderBy('lastActivity', 'desc')
      .limit(30)
      .get()

    const sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    res.json(sessions)
  }
)

// ── API: listar fotos de una sesión ─────────────────────────────────────────

exports.getSessionPhotos = onRequest(
  { cors: true },
  async (req, res) => {
    const chatId = req.query.chatId
    if (!chatId) return res.status(400).json({ error: 'chatId requerido' })

    const snap = await db.collection('sessions').doc(chatId)
      .collection('photos')
      .orderBy('receivedAt', 'asc')
      .get()

    const photos = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    res.json(photos)
  }
)

// ── API: enviar documentos al chat de Telegram ───────────────────────────────

exports.sendDocuments = onRequest(
  { cors: true, secrets: ['TELEGRAM_BOT_TOKEN'] },
  async (req, res) => {
    if (req.method !== 'POST') return res.status(405).end()

    const { chatId, documents } = req.body
    // documents: [{ name, base64, type: 'word'|'pdf' }]

    if (!chatId || !documents?.length)
      return res.status(400).json({ error: 'chatId y documents requeridos' })

    try {
      await TG('sendMessage', {
        chat_id: chatId,
        text: '📄 Tus documentos están listos:',
      })

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

        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
          method: 'POST',
          body: form,
        })
      }

      // Marcar sesión como procesada
      await db.collection('sessions').doc(chatId).update({
        processed: true,
        processedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      res.json({ ok: true })
    } catch (err) {
      console.error('sendDocuments error:', err)
      res.status(500).json({ error: err.message })
    }
  }
)
