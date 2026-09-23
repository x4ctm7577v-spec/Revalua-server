import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '15mb' })); // las fotos en base64 pueden pesar varios MB

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.6-flash';

if (!GEMINI_API_KEY) {
  console.warn('⚠️  Falta GEMINI_API_KEY en las variables de entorno. El servidor no podrá llamar a la IA.');
}

// ---------- Utilidad central: llamar a Gemini ----------
async function callGemini({ systemInstruction, parts, withSearch = true, maxOutputTokens = 1000 }) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens },
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }
  if (withSearch) {
    body.tools = [{ googleSearch: {} }];
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error de la API de Gemini (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const candidate = data.candidates && data.candidates[0];
  const textParts = (candidate && candidate.content && candidate.content.parts) || [];
  return textParts
    .filter((p) => p.text)
    .map((p) => p.text)
    .join('\n');
}

function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No se pudo interpretar la respuesta del modelo.');
  return JSON.parse(match[0]);
}

// ---------- 1) Tasar un artículo (vender) ----------
app.post('/api/analyze-item', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Falta imageBase64 en el cuerpo de la petición.' });

    const systemPrompt = [
      'Eres un tasador experto en artículos de segunda mano (electrónica, ropa, relojes, cámaras, muebles, etc.).',
      'Identifica el artículo en la imagen y evalúa su estado visual.',
      'Usa la búsqueda web para encontrar precios reales de artículos similares de segunda mano (eBay, Facebook Marketplace, OfferUp, Mercado Libre).',
      'Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown ni backticks, con exactamente estas claves:',
      'item_name (string), category (string), condition (string, ej. "Como nuevo", "Buen estado", "Uso visible"),',
      'estimated_value_low (number), estimated_value_high (number), suggested_price (number), currency (string, código de 3 letras, ej. USD),',
      'title (string, título de anuncio atractivo, máximo 70 caracteres), description (string, 3 a 4 frases persuasivas para el anuncio),',
      'market_notes (string, una frase breve sobre cómo se llegó al precio). Da todos los valores en dólares estadounidenses (USD). Todo el texto en español.',
    ].join(' ');

    const text = await callGemini({
      systemInstruction: systemPrompt,
      withSearch: true,
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        { text: 'Evalúa este artículo y genera el anuncio de venta.' },
      ],
    });

    const result = extractJson(text);
    result.currency = 'USD';
    res.json(result);
  } catch (e) {
    console.error('analyze-item:', e);
    res.status(500).json({ error: e.message || 'Error interno del servidor.' });
  }
});

// ---------- 2) Identificar y comprar ----------
app.post('/api/analyze-purchase', async (req, res) => {
  try {
    const { imageBase64 } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'Falta imageBase64 en el cuerpo de la petición.' });

    const systemPrompt = [
      'Identifica el artículo o pieza en la imagen con la mayor precisión posible (marca, modelo, número de parte si es visible).',
      'Usa la búsqueda web para encontrar anuncios REALES y actualmente disponibles para comprar esa pieza o una equivalente, en sitios como eBay, Facebook Marketplace, OfferUp o Mercado Libre.',
      'Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin markdown ni backticks, con estas claves:',
      'item_name (string), description (string, una frase breve describiendo el artículo identificado),',
      'results (array de hasta 5 objetos, cada uno con: title, price (number o null), currency, source, url).',
      'Solo incluye en "results" anuncios con una URL real que hayas obtenido de la búsqueda web; si no encuentras ninguno, deja "results" como un array vacío. No inventes URLs ni precios. Todo el texto en español.',
    ].join(' ');

    const text = await callGemini({
      systemInstruction: systemPrompt,
      withSearch: true,
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        { text: 'Identifica esta pieza o artículo y busca dónde comprarla.' },
      ],
    });

    res.json(extractJson(text));
  } catch (e) {
    console.error('analyze-purchase:', e);
    res.status(500).json({ error: e.message || 'Error interno del servidor.' });
  }
});

// ---------- 3) Asistente de negociación ----------
app.post('/api/negotiate', async (req, res) => {
  try {
    const { itemContext, buyerMessage } = req.body;
    if (!buyerMessage) return res.status(400).json({ error: 'Falta buyerMessage en el cuerpo de la petición.' });

    const text = await callGemini({
      systemInstruction: 'Eres un asistente de ventas que ayuda a un vendedor particular a responder compradores que negocian el precio en Facebook Marketplace u OfferUp. Responde en español, tono amable pero firme, protegiendo el margen del vendedor. Da ÚNICAMENTE la respuesta sugerida lista para copiar y pegar, en 2 a 4 frases, sin explicaciones adicionales ni comillas.',
      withSearch: false,
      maxOutputTokens: 300,
      parts: [{ text: `Artículo: ${itemContext || 'sin especificar'}\nMensaje del comprador: "${buyerMessage}"\n\nSugiere una respuesta.` }],
    });

    res.json({ reply: text.trim() });
  } catch (e) {
    console.error('negotiate:', e);
    res.status(500).json({ error: e.message || 'Error interno del servidor.' });
  }
});

// ---------- 4) Sugerir bajar precio ----------
app.post('/api/price-drop', async (req, res) => {
  try {
    const { title, category, condition, currency, price } = req.body;
    if (!title || price == null) return res.status(400).json({ error: 'Faltan datos del artículo (title, price).' });

    const text = await callGemini({
      systemInstruction: 'Eres un asesor de precios para ventas de artículos de segunda mano. Usa la búsqueda web para revisar precios actuales de artículos similares y sugiere, en una sola frase breve en español, si conviene bajar el precio y a cuánto.',
      withSearch: true,
      maxOutputTokens: 200,
      parts: [{ text: `Artículo: ${title}. Categoría: ${category || 'sin especificar'}. Estado: ${condition || 'sin especificar'}. Precio actual: ${currency || 'USD'} ${price}. Lleva más de una semana publicado sin venderse.` }],
    });

    res.json({ suggestion: text.trim() });
  } catch (e) {
    console.error('price-drop:', e);
    res.status(500).json({ error: e.message || 'Error interno del servidor.' });
  }
});

app.get('/', (req, res) => {
  res.send('Revalúa API funcionando ✅ (usando Gemini)');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor de Revalúa corriendo en el puerto ${PORT}`);
});
