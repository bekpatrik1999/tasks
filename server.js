import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const client = new Anthropic();

app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/improve-title', async (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Улучши название задачи: сделай его грамотным, чётким и профессиональным. Исправь опечатки, орфографию, расставь заглавные буквы где нужно. Отвечай ТОЛЬКО улучшенным названием — без кавычек, пояснений и лишнего текста.

Название: ${title.trim()}`
      }]
    });

    const improved = response.content[0]?.text?.trim() || title;
    res.json({ improved });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: 'AI service unavailable' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Task Tracker running at http://localhost:${PORT}`);
});
