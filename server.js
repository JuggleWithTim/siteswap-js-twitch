require('dotenv').config();
const express = require('express');
const path = require('path');
const tmi = require('tmi.js');
const { Server } = require('socket.io');
const http = require('http');
const axios = require('axios');

// Load client-side classes for server-side validation
const fs = require('fs');
const vm = require('vm');

// Load Throw and Hands classes
const throwCode = fs.readFileSync(path.join(__dirname, 'public/src/Throw.js'), 'utf8');
const handsCode = fs.readFileSync(path.join(__dirname, 'public/src/Hands.js'), 'utf8');

// Create a context for running the client-side code
const context = vm.createContext({
  console,
  Math,
  Array,
  Object,
  String,
  Number,
  Boolean,
  RegExp,
  Error,
  TypeError,
  RangeError,
  ReferenceError,
  SyntaxError,
  EvalError,
  URIError,
  global: {},
  window: {},
  document: { write: () => {} },
  propImage: { src: '' }
});

// Execute the code in the context
vm.runInContext(throwCode, context);
vm.runInContext(handsCode, context);

// Extract the classes
const Throw = context.Throw;
const Hands = context.Hands;

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3030;

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Main frontend route (serve the main HTML)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'twitch.html'));
});

// Twitch client options
const opts = {
  identity: {
    username: process.env.TWITCH_USERNAME,
    password: process.env.TWITCH_PASSWORD
  },
  channels: ['jugglewithtim']
};

// Create Twitch client
const client = new tmi.client(opts);

// Chat history for AI context
let chatHistory = [];

// Siteswap validation using the actual Hands class
function isValidSiteswap(siteswap) {
  try {
    const hands = new Hands(siteswap);
    return hands.valid;
  } catch (e) {
    return false;
  }
}

// Find siteswap candidates (same as original)
function findSiteswapCandidates(message) {
  return Array.from(message.matchAll(/\b(?=[a-zA-Z0-9]*\d)[a-zA-Z0-9\[\]\(\),\*xX]+\b/g))
    .map(m => m[0])
    .filter(s => !/^[a-zA-Z]+$/.test(s));
}

// AI response function
async function getAIResponse(prompt, chatContext) {
  try {
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are JuggleBot, an excitable, fun, and friendly Twitch juggling robot. Respond to valid siteswaps with hype, positive encouragement, and short explanations if possible. Speak as if you are part of the stream and love engaging with chat.' },
        ...chatContext,
        { role: 'user', content: prompt }
      ],
      max_completion_tokens: 80,
      temperature: 1.5
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    });
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI API error:', error);
    return 'Exciting valid siteswap detected! (AI error)';
  }
}

// Handle Twitch messages
client.on('message', async (channel, tags, message, self) => {
  if (self) return;
  if (tags['username'] && tags['username'].toLowerCase() === opts.identity.username.toLowerCase()) return;

  const username = tags['username'] || 'unknown';
  chatHistory.push({ username, message });
  if (chatHistory.length > 20) chatHistory.shift();

  // Emit chat message to all clients
  io.emit('chat-message', { username, message });

  // Handle emotes
  if (tags.emotes) {
    const emoteID = Object.keys(tags.emotes)[0];
    io.emit('emote', `https://static-cdn.jtvnw.net/emoticons/v2/${emoteID}/default/dark/2.0`);
  }

  const singleWord = message.trim();
  if (message.includes(' ') || singleWord.length === 0) {
    // Handle messages with spaces - look for siteswap candidates
    const candidates = findSiteswapCandidates(message);
    for (const siteswapCandidate of candidates) {
      let isValid = false;
      try {
        const hands = new Hands(siteswapCandidate);
        isValid = hands.valid;
      } catch (e) { }
      if (isValid) {
        const recentChat = chatHistory
          .slice(-20)
          .filter(msg => !!msg.username && !!msg.message)
          .map(({ username, message }) => ({
            role: "user",
            content: `[${username}]: ${message}`
          }));
        const prompt = `The user @${username} has sent a message containing a valid siteswap pattern: ${siteswapCandidate}. Respond with a short message, informing the user that it is a valid siteswap and you are going to juggle it right now. Do not use any text formatting but feel free to use emojis.`;
        const aiResponse = await getAIResponse(prompt, recentChat);
        io.emit('speech-bubble', aiResponse);
        io.emit('siteswap-change', { siteswap: siteswapCandidate, propType: 'i' });
        break;
      }
    }
  }

  if (!message.includes(' ') && singleWord.length > 0) {
    // Handle single word messages
    let isValidFull = false;
    try {
      const hands = new Hands(singleWord);
      isValidFull = hands.valid;
    } catch (e) { }
    if (isValidFull) {
      const recentChat = chatHistory
        .slice(-20)
        .filter(msg => !!msg.username && !!msg.message)
        .map(({ username, message }) => ({
          role: "user",
          content: `[${username}]: ${message}`
        }));
      const prompt = `The user @${username} has sent a message containing a valid siteswap pattern: ${singleWord}. Respond with a short message, informing the user that it is a valid siteswap and you are going to juggle it right now. Do not use any text formatting but feel free to use emojis.`;
      const aiResponse = await getAIResponse(prompt, recentChat);
      io.emit('speech-bubble', aiResponse);
      io.emit('siteswap-change', { siteswap: singleWord, propType: 'i' });
    }
  }

  // Handle !ss command
  if (message.startsWith('!ss')) {
    const params = message.slice(3).trim().split(' ');
    const siteswap = params[0];
    const propType = params[1] || 'i';
    if (isValidSiteswap(siteswap)) {
      io.emit('siteswap-change', { siteswap, propType });
    } else {
      client.say(channel, `Invalid siteswap NotLikeThis`);
    }
  }
});

// Connect to Twitch
client.connect();

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected');
  // Send current state if needed
});

server.listen(PORT, () => {
  console.log(`SiteswapJS server running at http://localhost:${PORT}`);
});
