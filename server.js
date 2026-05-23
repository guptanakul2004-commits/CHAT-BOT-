const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');
const mongoose = require('mongoose');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');
const path    = require('path');
require('dotenv').config({ path: 'env.txt' });

const app  = express();
const PORT = process.env.PORT || 3000;

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || '';
if (MONGODB_URI) {
  mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }).then(() => {
    console.log('✅ Connected to MongoDB');
  }).catch((err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });
} else {
  console.log('⚠ No MONGODB_URI configured. MongoDB is disabled.');
}

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
app.options('*', cors());

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'openrouter/free';

if (!OPENROUTER_API_KEY || OPENROUTER_API_KEY === 'your_openrouter_api_key_here') {
  console.error('\n❌ ERROR: No OpenRouter API key found!');
  console.error('👉 Open the env.txt file and paste your API key.');
  console.error('   Get a free key at: https://openrouter.ai/keys\n');
  process.exit(1);
}

const authRoutes = require('./routes/authRoutes');
const stockRoutes =
  require('./routes/stockRoutes');

const upload = multer({ dest: 'uploads/' });

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function parseJsonSafe(res) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (err) {
    return { __rawText: text };
  }
}

const SYSTEM_PROMPT = `You are Axon, a brilliant and helpful AI assistant built for a student major project.
You specialize in coding, science, mathematics, writing, and creative problem solving.
Always format code in markdown code blocks with the language name (e.g. \`\`\`python).
Use **bold** for key terms and *italics* for emphasis.
Be clear, thorough, and friendly.`;

app.use('/api/auth', authRoutes);
app.use(
  '/api/stocks',
  stockRoutes
);

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let extractedText = '';
    const mime = file.mimetype;

    if (mime === 'application/pdf') {
      const buffer = fs.readFileSync(file.path);
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text;
    } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const result = await mammoth.extractRawText({ path: file.path });
      extractedText = result.value || '';
    } else if (mime.startsWith('text/') || file.originalname.endsWith('.csv')) {
      extractedText = fs.readFileSync(file.path, 'utf8');
    }

    res.json({
      success: true,
      filename: file.originalname,
      text: extractedText,
      mimetype: mime,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const { history } = req.body;

  if (!history || !Array.isArray(history) || history.length === 0) {
    return res.status(400).json({ error: 'Invalid request: history array is required.' });
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.map(m => ({
      role:    m.role === 'model' ? 'assistant' : m.role,
      content: m.parts?.[0]?.text ?? m.content ?? ''
    }))
  ];

  try {
    const orResponse = await fetch(OPENROUTER_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'HTTP-Referer':  'http://localhost:3000',
        'X-Title':       'Axon AI Chatbot'
      },
      body: JSON.stringify({
        model:       OPENROUTER_MODEL,
        messages:    messages,
        max_tokens:  2048,
        temperature: 0.7
      })
    });

    if (!orResponse.ok) {
      let message = 'OpenRouter API error';
      const errData = await parseJsonSafe(orResponse);
      if (errData?.error?.message) {
        message = errData.error.message;
      } else if (errData?.__rawText) {
        message = errData.__rawText;
      } else {
        message = `OpenRouter API error (${orResponse.status}): ${orResponse.statusText}`;
      }
      console.error('OpenRouter error:', message);
      return res.status(orResponse.status).json({ error: message });
    }

    const data = await parseJsonSafe(orResponse);
    const reply = data?.choices?.[0]?.message?.content || '(No response)';

    res.json({ reply });

  } catch (err) {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Internal server error: ' + err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status:  'online',
    message: 'AXON AI Server is running!',
    model:   `OpenRouter (${OPENROUTER_MODEL})`,
    time:    new Date().toISOString()
  });
});

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║        AXON AI SERVER STARTED          ║');
  console.log('╠════════════════════════════════════════╣');
  console.log(`║  Local:   http://localhost:${PORT}         ║`);
  console.log(`║  Health:  http://localhost:${PORT}/health  ║`);
  console.log('║  API Key: ✅ Secured in env.txt         ║');
  console.log('╚════════════════════════════════════════╝\n');
});
