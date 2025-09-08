const axios = require('axios');
const NodeCache = require('node-cache');
const twemoji = require('twemoji');

// Cache for emote data (TTL: 1 hour)
const emoteCache = new NodeCache({ stdTTL: 3600 });

// Cache for emoji data (TTL: 24 hours)
const emojiCache = new NodeCache({ stdTTL: 86400 });

class EmoteService {
  constructor() {
    this.bttvApiUrl = 'https://api.betterttv.net/3/cached/emotes/global';
    this.ffzApiUrl = 'https://api.frankerfacez.com/v1/set/global';
    this.seventvApiUrl = 'https://7tv.io/v3/emotes/global';
  }

  async initialize() {
    try {
      await this.loadGlobalEmotes();
      console.log('Emote service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize emote service:', error);
    }
  }

  async loadGlobalEmotes() {
    // Load BTTV global emotes
    try {
      const bttvResponse = await axios.get(this.bttvApiUrl);
      const bttvEmotes = {};
      bttvResponse.data.forEach(emote => {
        bttvEmotes[emote.code] = {
          id: emote.id,
          url: `https://cdn.betterttv.net/emote/${emote.id}/2x`,
          type: 'bttv'
        };
      });
      emoteCache.set('bttv_global', bttvEmotes);
      console.log(`Loaded ${Object.keys(bttvEmotes).length} BTTV emotes`);
    } catch (error) {
      console.error('Error loading BTTV emotes:', error.message);
    }

    // Load FFZ global emotes
    try {
      const ffzResponse = await axios.get(this.ffzApiUrl);
      const ffzEmotes = {};
      ffzResponse.data.sets[ffzResponse.data.default_sets[0]].emoticons.forEach(emote => {
        ffzEmotes[emote.name] = {
          id: emote.id,
          url: `https://cdn.frankerfacez.com/emoticon/${emote.id}/2`,
          type: 'ffz'
        };
      });
      emoteCache.set('ffz_global', ffzEmotes);
      console.log(`Loaded ${Object.keys(ffzEmotes).length} FFZ emotes`);
    } catch (error) {
      console.error('Error loading FFZ emotes:', error.message);
    }

    // Load 7TV global emotes (temporarily disabled due to API issues)
    // try {
    //   const seventvResponse = await axios.get(this.seventvApiUrl);
    //   const seventvEmotes = {};
    //   seventvResponse.data.forEach(emote => {
    //     seventvEmotes[emote.name] = {
    //       id: emote.id,
    //       url: `https://cdn.7tv.app/emote/${emote.id}/2x.webp`,
    //       type: '7tv'
    //     };
    //   });
    //   emoteCache.set('7tv_global', seventvEmotes);
    //   console.log(`Loaded ${Object.keys(seventvEmotes).length} 7TV emotes`);
    // } catch (error) {
    //   console.error('Error loading 7TV emotes:', error.message);
    // }
  }

  detectEmotes(message) {
    const detectedEmotes = [];

    // Get cached emote data
    const bttvEmotes = emoteCache.get('bttv_global') || {};
    const ffzEmotes = emoteCache.get('ffz_global') || {};
    const seventvEmotes = emoteCache.get('7tv_global') || {};

    // Split message into words and check each word
    const words = message.split(/\s+/);

    for (const word of words) {
      // Check BTTV
      if (bttvEmotes[word]) {
        detectedEmotes.push(bttvEmotes[word]);
      }
      // Check FFZ
      else if (ffzEmotes[word]) {
        detectedEmotes.push(ffzEmotes[word]);
      }
      // Check 7TV
      else if (seventvEmotes[word]) {
        detectedEmotes.push(seventvEmotes[word]);
      }
    }

    return detectedEmotes;
  }

  detectEmojis(message) {
    const detectedEmojis = [];

    // Use twemoji to parse emojis
    const parsed = twemoji.parse(message, {
      callback: (icon, options) => {
        const emojiData = {
          code: icon,
          url: `https://twemoji.maxcdn.com/v/latest/72x72/${icon}.png`,
          type: 'emoji'
        };
        detectedEmojis.push(emojiData);
        return false; // Don't replace, just detect
      }
    });

    return detectedEmojis;
  }

  getEmoteUrl(emote) {
    return emote.url;
  }

  // Get the first available emote from a message
  async getFirstEmote(message) {
    // First check for Twitch emotes (handled separately in server.js)
    // Then check for 3rd party emotes
    const thirdPartyEmotes = this.detectEmotes(message);
    if (thirdPartyEmotes.length > 0) {
      return thirdPartyEmotes[0];
    }

    // Then check for emojis
    const emojis = this.detectEmojis(message);
    if (emojis.length > 0) {
      return emojis[0];
    }

    return null;
  }
}

module.exports = new EmoteService();
