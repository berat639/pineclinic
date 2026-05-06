import 'dotenv/config';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { GroqChat } from './groq.js';
import { OpenAITTS } from './openai-tts.js';
import * as db from './appointments.js';
import fs from 'fs';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HTTP_PORT = process.env.HTTP_PORT || 3001;
const tts = new OpenAITTS(process.env.OPENAI_API_KEY);

// ── HTTP Server ────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

app.get('/api/appointments', async (req, res) => {
  const all = await db.getAll();
  res.json(all);
});

app.patch('/api/appointments/:id/status', async (req, res) => {
  const updated = await db.updateStatus(req.params.id, req.body.durum);
  updated ? res.json(updated) : res.status(404).json({ error: 'Bulunamadı' });
});

app.delete('/api/appointments/:id', async (req, res) => {
  await db.remove(req.params.id);
  res.json({ ok: true });
});

app.get('/api/stats', (req, res) => {
  res.json({ activeSessions: sessions.size, uptime: Math.floor(process.uptime()) });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/admin.html'));
});

const server = app.listen(HTTP_PORT, () => {
  console.log(`🌐 http://localhost:${HTTP_PORT}`);
  console.log(`📋 Admin: http://localhost:${HTTP_PORT}/admin`);
});

// ── WebSocket Server ───────────────────────────────────────────
const wss = new WebSocketServer({ server });
const sessions = new Map();

wss.on('connection', (ws) => {
  const sessionId = crypto.randomUUID();
  const chat = new GroqChat();
  sessions.set(sessionId, chat);
  console.log(`[+] ${sessionId} | Aktif: ${sessions.size}`);

  // Mesajları işleyen fonksiyon
  const processUserText = async (text) => {
    console.log(`[Kullanıcı] ${text}`);
    // Tarayıcıya transcript'i geri gönder
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'transcript', text }));
    }

    let result;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await chat.sendMessage(text);
        break;
      } catch (err) {
        if (attempt < 2 && err.message?.includes('503')) {
          console.log(`[Retry] Groq meşgul, ${attempt + 1}. deneme...`);
          await new Promise(r => setTimeout(r, 1000));
        } else {
          throw err;
        }
      }
    }
    if (!result) result = { text: 'Bir saniye, tekrar deneyelim.' };
    console.log(`[Asistan] ${result.text}`);

    const audio = await tts.synthesize(result.text);

    if (audio && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'assistant_text', text: result.text }));
      ws.send(audio);
    }
  };

  ws.on('message', async (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'user_text') {
        await processUserText(msg.text);
      } else if (msg.type === 'greeting') {
        // İlk karşılama (retry ile)
        let result;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            result = await chat.sendMessage('[KULLANICI BAĞLANDI. Karşılama cümleni söyle.]');
            break;
          } catch (err) {
            if (attempt < 2) {
              console.log(`[Retry] Karşılama ${attempt + 1}. deneme...`);
              await new Promise(r => setTimeout(r, 1500));
            }
          }
        }
        if (!result) result = { text: 'Merhaba, ben Ata Hyundai oto bakım asistanı. Size nasıl yardımcı olabilirim?' };
        console.log(`[Karşılama] ${result.text}`);

        const audio = await tts.synthesize(result.text);
        if (audio && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'assistant_text', text: result.text }));
          ws.send(audio);
        }
      }
    } catch (err) {
      console.error('[WS Error]', err.message);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'assistant_text', text: 'Bir saniye, tekrar deneyelim...' }));
      }
    }
  });

  ws.on('close', () => {
    sessions.delete(sessionId);
    console.log(`[-] ${sessionId} | Aktif: ${sessions.size}`);
  });
});
