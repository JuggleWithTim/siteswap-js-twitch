require('dotenv').config();
const express = require('express');
const path = require('path');
const tmi = require('tmi.js');
const { Server } = require('socket.io');
const http = require('http');
const axios = require('axios');
const { google } = require('googleapis');
const validateSiteswap = require('./siteswapValidator');
const EmoteService = require('./emoteService');
const emoteService = new EmoteService(process.env.CHANNEL_NAME, process.env.CHANNEL_ID);

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
  channels: [process.env.CHANNEL_NAME || 'jugglewithtim']
};

// Create Twitch client
const client = new tmi.client(opts);

// YouTube client setup
let youtubeAuth = null;
let youtube = null;
let liveChatId = null;
let nextPageToken = null;

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN && process.env.YOUTUBE_VIDEO_ID) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob' // For desktop apps
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  });

  youtubeAuth = oauth2Client;
  youtube = google.youtube({ version: 'v3', auth: oauth2Client });
}

// Chat history for AI context
let chatHistory = [];

// Siteswap validation using secure validator
function isValidSiteswap(siteswap) {
  return validateSiteswap(siteswap);
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

// YouTube functions
async function getLiveChatId(videoId) {
  try {
    const response = await youtube.videos.list({
      part: 'liveStreamingDetails',
      id: videoId
    });
    const video = response.data.items[0];
    if (video && video.liveStreamingDetails && video.liveStreamingDetails.activeLiveChatId) {
      return video.liveStreamingDetails.activeLiveChatId;
    }
    throw new Error('No active live chat found for this video');
  } catch (error) {
    console.error('Error getting live chat ID:', error.message);
    return null;
  }
}

async function pollYouTubeMessages() {
  if (!youtube || !liveChatId) return;

  try {
    const response = await youtube.liveChatMessages.list({
      liveChatId: liveChatId,
      part: 'snippet,authorDetails',
      pageToken: nextPageToken
    });

    nextPageToken = response.data.nextPageToken;

    const messages = response.data.items;
    for (const msg of messages) {
      const snippet = msg.snippet;
      const author = msg.authorDetails;
      const message = snippet.textMessageDetails ? snippet.textMessageDetails.messageText : '';
      const username = author.displayName;

      // Skip if message is empty or from bot
      if (!message || author.isChatOwner || author.isChatModerator) continue; // Adjust as needed

      chatHistory.push({ username, message });
      if (chatHistory.length > 20) chatHistory.shift();

      // Emit chat message
      io.emit('chat-message', { username, message });

      // Handle emotes - for now, only emojis
      const detectedEmojis = emoteService.detectEmojis(message);
      if (detectedEmojis.length > 0) {
        const emoteUrl = detectedEmojis[0].url;
        io.emit('emote', emoteUrl);
      }

      // Handle siteswaps (same logic as Twitch)
      const singleWord = message.trim();
      if (message.includes(' ') || singleWord.length === 0) {
        const candidates = findSiteswapCandidates(message);
        for (const siteswapCandidate of candidates) {
          if (validateSiteswap(siteswapCandidate)) {
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
        if (validateSiteswap(singleWord)) {
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
    }
  } catch (error) {
    console.error('Error polling YouTube messages:', error.message);
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
  let emoteUrl = null;

  // First priority: Twitch emotes
  if (tags.emotes) {
    const emoteID = Object.keys(tags.emotes)[0];
    emoteUrl = `https://static-cdn.jtvnw.net/emoticons/v2/${emoteID}/default/dark/2.0`;
  }
  // Second priority: 3rd party emotes and emojis
  else {
    const detectedEmote = await emoteService.getFirstEmote(message);
    if (detectedEmote) {
      emoteUrl = detectedEmote.url;
    }
  }

  // Send emote to frontend if found
  if (emoteUrl) {
    io.emit('emote', emoteUrl);
  }

  const singleWord = message.trim();
  if (message.includes(' ') || singleWord.length === 0) {
    // Handle messages with spaces - look for siteswap candidates
    const candidates = findSiteswapCandidates(message);
    for (const siteswapCandidate of candidates) {
      if (validateSiteswap(siteswapCandidate)) {
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
    if (validateSiteswap(singleWord)) {
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
});

// Initialize emote service
async function initializeServer() {
  await emoteService.initialize();

  // Connect to Twitch
  client.connect();

  // Initialize YouTube if configured
  if (youtube && process.env.YOUTUBE_VIDEO_ID) {
    liveChatId = await getLiveChatId(process.env.YOUTUBE_VIDEO_ID);
    if (liveChatId) {
      console.log('YouTube live chat initialized');
      // Poll every 5 seconds
      setInterval(pollYouTubeMessages, 5000);
    } else {
      console.log('Failed to initialize YouTube live chat');
    }
  }

  server.listen(PORT, () => {
    console.log(`SiteswapJS server running at http://localhost:${PORT}`);
  });
}

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('Client connected');
  // Send current state if needed
});

initializeServer();
