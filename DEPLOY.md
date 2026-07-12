# DEPLOY COMPLETO — Anexo Generator Backend
# Ejecutar desde la carpeta raíz del proyecto (anexo-app/)

# ── PREREQUISITOS ────────────────────────────────────────────────────────────
# Node.js 20+ instalado
# Cuenta de Google con proyecto Firebase "anexo-app" creado
# Plan Blaze activado en Firebase Console
# Storage y Firestore activados en Firebase Console

# ── PASO 1: Instalar Firebase CLI ────────────────────────────────────────────
npm install -g firebase-tools

# ── PASO 2: Login con tu cuenta Google ───────────────────────────────────────
firebase login

# ── PASO 3: Vincular con el proyecto ─────────────────────────────────────────
firebase use anexo-app

# ── PASO 4: Guardar el token del bot de Telegram como secreto ────────────────
# Cuando te pida el valor, pega el token: 8693326663:AAFxX5Oe...
firebase functions:secrets:set TELEGRAM_BOT_TOKEN

# ── PASO 5: Instalar dependencias de las Functions ───────────────────────────
cd functions
npm install
cd ..

# ── PASO 6: Deploy completo (Functions + Firestore rules + Storage rules) ────
firebase deploy --only functions,firestore,storage

# ── PASO 7: Registrar el webhook de Telegram (solo una vez) ──────────────────
# Abre este URL en el navegador después del deploy:
# https://us-central1-anexo-app.cloudfunctions.net/setWebhook
#
# Deberías ver: {"ok":true,"result":true,"description":"Webhook was set"}

# ── VERIFICAR QUE TODO FUNCIONA ───────────────────────────────────────────────
# 1. Abre Telegram y busca tu bot por el username que elegiste
# 2. Envía /start
# 3. El bot debería responder con instrucciones
# 4. Envía una foto
# 5. Abre la PWA → Paso 2 → "Desde Telegram"
# 6. Deberías ver tu sesión y la foto en tiempo real
