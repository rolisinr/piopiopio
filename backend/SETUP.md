# Setup del Backend — Render + Google Drive

## PASO 1: Google Drive — Crear carpeta

1. Abre Google Drive
2. Crea una carpeta llamada "Anexo Fotos"
3. Clic derecho → "Obtener enlace" → copia el ID de la URL
   (la parte después de /folders/ en la URL)
4. Guarda ese ID — es tu GOOGLE_DRIVE_FOLDER_ID

## PASO 2: Google Cloud — Cuenta de servicio

1. Ve a console.cloud.google.com
2. Selecciona o crea un proyecto
3. Menú → "APIs y servicios" → "Habilitar APIs"
4. Busca "Google Drive API" → Habilitar
5. Menú → "APIs y servicios" → "Credenciales"
6. "+ Crear credenciales" → "Cuenta de servicio"
7. Nombre: "anexo-drive-bot" → Crear
8. Clic en la cuenta creada → pestaña "Claves"
9. "Agregar clave" → "Crear clave nueva" → JSON → Descargar
10. Abre el JSON descargado y copia TODO el contenido

## PASO 3: Compartir la carpeta con la cuenta de servicio

1. Abre el JSON descargado
2. Copia el valor de "client_email" (algo como anexo-drive-bot@proyecto.iam.gserviceaccount.com)
3. Ve a tu carpeta "Anexo Fotos" en Google Drive
4. Clic derecho → "Compartir"
5. Pega el client_email → rol "Editor" → Compartir

## PASO 4: Deploy en Render

1. Ve a render.com → Sign up con tu cuenta de Google
2. "New +" → "Web Service"
3. Conecta tu repositorio GitHub (rolisinr/piopiopio)
4. Configuración:
   - Name: anexo-backend
   - Root Directory: backend
   - Build Command: npm install
   - Start Command: npm start
   - Plan: Free
5. "Advanced" → "Add Environment Variable":
   - TELEGRAM_BOT_TOKEN = (tu token del bot)
   - GOOGLE_DRIVE_FOLDER_ID = (ID de la carpeta del paso 1)
   - GOOGLE_SERVICE_ACCOUNT = (todo el contenido del JSON del paso 2, en una sola línea)
6. "Create Web Service"

## PASO 5: Registrar el webhook de Telegram

Cuando Render termine el deploy, copia la URL (algo como https://anexo-backend.onrender.com)
Luego abre en el navegador:
  https://anexo-backend.onrender.com/set-webhook

Deberías ver: {"ok":true,"result":true}

## PASO 6: Actualizar la PWA con la URL del backend

En el archivo src/lib/telegramApi.js cambia:
  const BASE = 'https://anexo-backend.onrender.com'

Luego haz git push y GitHub Actions redeployará la PWA.

## VERIFICAR QUE FUNCIONA

1. Abre Telegram → busca tu bot → envía /start
2. El bot debería responder con instrucciones
3. Envía una foto
4. Abre la PWA → Fotos → "Desde Telegram"
5. Deberías ver la sesión y la foto aparecer
