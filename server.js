require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
if (!token || token === 'TOKEN_RAKO_PANO') {
  console.error("❌ ERROR: Isa Bot Token chairo mu .env file!");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const settings = new Map();

function parseTime(str) {
  if (!str) return null;
  const match = str.toString().trim().match(/^(\d+)(s|m|h|d)?$/i);
  if (!match) return null;
  const val = parseInt(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  if (unit === 's') return val * 1000;
  if (unit === 'm') return val * 60 * 1000;
  if (unit === 'h') return val * 60 * 60 * 1000;
  if (unit === 'd') return val * 24 * 60 * 60 * 1000;
  return null;
}

function autoDelete(chatId, messageId, delay) {
  setTimeout(async () => {
    try {
      await bot.deleteMessage(chatId, messageId);
      console.log(`[DELETED] Meseji #${messageId} yadzimwa mu ${chatId}`);
    } catch (err) {
      console.error(`[SKIP] Handina kukwanisa kudzima #${messageId}: ${err.message}`);
    }
  }, delay);
}

// Web API
app.get('/api/settings', (req, res) => {
  const data = {};
  settings.forEach((val, key) => { data[key] = val / 1000; });
  res.json({ success: true, settings: data });
});

app.post('/api/settings', (req, res) => {
  const { target, timer } = req.body;
  if (!target || !timer) return res.status(400).json({ error: "Missing data!" });

  if (timer.toLowerCase() === 'off') {
    settings.delete(target.toString().trim());
    return res.json({ success: true, message: `Auto-delete pa ${target} yadzimwa!` });
  }

  const ms = parseTime(timer);
  if (!ms || ms < 5000) return res.status(400).json({ error: "Nguva inofanira kudarika 5s!" });

  settings.set(target.toString().trim(), ms);
  res.json({ success: true, message: `Timer ye ${target} yaiswa pa ${timer}!` });
});

// Telegram Commands
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    `⚡ *AUTOBOT-DELETE PRO (TERMUX)*\n\n` +
    `*Commands:*\n` +
    `• \`/settimer 30s\` (Kudzima muGroup)\n` +
    `• \`/settimer @channel_username 1h\` (Kudzima muChannel)\n` +
    `• \`/settimer off\` (Kudzima autobot)\n` +
    `• \`/status\` (Kuona timer iripo)`,
    { parse_mode: 'Markdown' }
  );
});

bot.onText(/\/settimer(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1] ? match[1].trim().split(' ') : [];

  if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
    try {
      const member = await bot.getChatMember(chatId, msg.from.id);
      if (!['creator', 'administrator'].includes(member.status)) {
        return bot.sendMessage(chatId, "⚠️ Ma-Admin chete anobvumidzwa!");
      }
    } catch(e) {}
  }

  let targetChat = chatId;
  let timeValue = input[0];

  if (input.length >= 2 && input[0].startsWith('@')) {
    targetChat = input[0];
    timeValue = input[1];
  }

  if (!timeValue) return bot.sendMessage(chatId, "ℹ️ Nyora: `/settimer 30s` kana `/settimer @channel 1h`", { parse_mode: 'Markdown' });

  if (timeValue.toLowerCase() === 'off') {
    settings.delete(targetChat.toString());
    return bot.sendMessage(chatId, `🛑 Auto-delete yadzimwa pa ${targetChat}`);
  }

  const ms = parseTime(timeValue);
  if (!ms) return bot.sendMessage(chatId, "❌ Nguva yakanganisika! (e.g. 30s, 5m, 1h)");

  settings.set(targetChat.toString(), ms);
  bot.sendMessage(chatId, `✅ Timer pa *${targetChat}* yaiswa pa *${timeValue}*`, { parse_mode: 'Markdown' });
});

bot.onText(/\/status/, (msg) => {
  const ms = settings.get(msg.chat.id.toString()) || settings.get(`@${msg.chat.username}`);
  bot.sendMessage(msg.chat.id, ms ? `⏱️ Timer iripo: *${ms / 1000}s*` : `ℹ️ Auto-delete yakadzimwa.`);
});

// Group deletion
bot.on('message', (msg) => {
  if (msg.text && msg.text.startsWith('/')) return;
  const delay = settings.get(msg.chat.id.toString()) || (msg.chat.username && settings.get(`@${msg.chat.username}`));
  if (delay) autoDelete(msg.chat.id, msg.message_id, delay);
});

// Channel deletion
bot.on('channel_post', (msg) => {
  const delay = settings.get(msg.chat.id.toString()) || (msg.chat.username && settings.get(`@${msg.chat.username}`));
  if (delay) autoDelete(msg.chat.id, msg.message_id, delay);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Web Dashboard: http://localhost:${PORT}`);
  console.log(`🤖 Telegram Bot riri kushanda!`);
});
