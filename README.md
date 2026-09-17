# Servidor de Revalúa

Este servidor recibe las peticiones de la app (fotos, mensajes de negociación, etc.), llama a la API de Claude usando tu clave privada, y devuelve el resultado. La clave nunca queda expuesta en la app — vive solo aquí, en el servidor.

## 1. Consigue tu clave de API de Anthropic

1. Entra a **console.anthropic.com** y crea una cuenta (si no tienes una).
2. Ve a **API Keys** → **Create Key**.
3. Copia la clave (empieza con `sk-ant-...`) — solo la verás una vez.
4. En **Billing**, agrega una forma de pago. Esto se cobra **por uso** (cada foto analizada cuesta una fracción de centavo a unos pocos centavos, dependiendo del tamaño). Es distinto de tu suscripción de Claude.ai — es un servicio separado, pensado para desarrolladores.

## 2. Prueba el servidor en tu computadora (opcional pero recomendado)

```bash
npm install
cp .env.example .env
# abre .env y pega tu clave real en ANTHROPIC_API_KEY
npm start
```

Deberías ver `Servidor de Revalúa corriendo en el puerto 3000`. Abre `http://localhost:3000` en el navegador — si dice "Revalúa API funcionando ✅", va bien.

## 3. Súbelo a internet (Railway — el más simple)

1. Crea una cuenta en **railway.app**.
2. Sube esta carpeta a un repositorio de GitHub (o usa "Deploy from local" si Railway te lo ofrece).
3. En Railway: **New Project → Deploy from GitHub repo**, elige el repositorio.
4. En la pestaña **Variables**, agrega:
   - `ANTHROPIC_API_KEY` = tu clave real
5. Railway te da una URL pública, algo como `https://revalua-server-production.up.railway.app`.
6. Prueba esa URL en el navegador — debe mostrar el mismo mensaje de "funcionando ✅".

(Render.com funciona igual de bien y también tiene plan gratis para empezar; los pasos son casi idénticos.)

## 4. Conecta la app a este servidor

Cuando tengas la URL pública, dile a Claude: *"ya tengo la URL de mi servidor, cámbiala en la app"* — y se actualizan las llamadas de la app para que usen tu servidor en vez de la que solo funciona dentro de Claude.

## Endpoints disponibles

| Ruta | Qué hace | Cuerpo que espera |
|---|---|---|
| `POST /api/analyze-item` | Tasar un artículo para vender | `{ imageBase64 }` |
| `POST /api/analyze-purchase` | Identificar y buscar dónde comprar | `{ imageBase64 }` |
| `POST /api/negotiate` | Sugerir respuesta a un comprador | `{ itemContext, buyerMessage }` |
| `POST /api/price-drop` | Sugerir bajar precio | `{ title, category, condition, currency, price }` |

## Seguridad — importante

- **Nunca** subas el archivo `.env` a GitHub (ya está pensado para eso: usa `.env.example` como plantilla y crea tu propio `.env` local, que no se comparte).
- Si tu clave se filtra alguna vez, revócala de inmediato en console.anthropic.com y crea una nueva.
