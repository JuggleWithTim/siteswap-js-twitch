const axios = require('axios');
const NodeCache = require('node-cache');
const twemoji = require('twemoji');

// Cache for emote data (TTL: 1 hour)
const emoteCache = new NodeCache({ stdTTL: 3600 });

// Cache for emoji data (TTL: 24 hours)
const emojiCache = new NodeCache({ stdTTL: 86400 });

class EmoteService {
  constructor(channelName, channelId) {
    this.channelName = channelName;
    this.channelId = channelId;
    this.bttvGlobalApiUrl = 'https://api.betterttv.net/3/cached/emotes/global';
    this.ffzGlobalApiUrl = 'https://api.frankerfacez.com/v1/set/global';
    this.seventvApiUrl = 'https://7tv.io/v3/emotes/global';
  }

  async initialize() {
    try {
      await this.loadGlobalEmotes();
      if (this.channelName) {
        await this.loadChannelEmotes();
      }
      console.log('Emote service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize emote service:', error);
    }
  }

  async loadGlobalEmotes() {
    // Load BTTV global emotes
    try {
      const bttvResponse = await axios.get(this.bttvGlobalApiUrl);
      const bttvEmotes = {};
      bttvResponse.data.forEach(emote => {
        bttvEmotes[emote.code] = {
          id: emote.id,
          url: `https://cdn.betterttv.net/emote/${emote.id}/2x`,
          type: 'bttv'
        };
      });
      emoteCache.set('bttv_global', bttvEmotes);
      console.log(`Loaded ${Object.keys(bttvEmotes).length} BTTV global emotes`);
    } catch (error) {
      console.error('Error loading BTTV global emotes:', error.message);
    }

    // Load FFZ global emotes
    try {
      const ffzResponse = await axios.get(this.ffzGlobalApiUrl);
      const ffzEmotes = {};
      ffzResponse.data.sets[ffzResponse.data.default_sets[0]].emoticons.forEach(emote => {
        ffzEmotes[emote.name] = {
          id: emote.id,
          url: `https://cdn.frankerfacez.com/emoticon/${emote.id}/2`,
          type: 'ffz'
        };
      });
      emoteCache.set('ffz_global', ffzEmotes);
      console.log(`Loaded ${Object.keys(ffzEmotes).length} FFZ global emotes`);
    } catch (error) {
      console.error('Error loading FFZ global emotes:', error.message);
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

  async loadChannelEmotes() {
    if (!this.channelName) return;

    // Load BTTV channel emotes
    try {
      // Use the channelId for BTTV (which requires numeric user ID)
      if (!this.channelId) {
        console.log('No CHANNEL_ID provided. BTTV channel emotes will not be loaded.');
        console.log('To enable BTTV channel emotes, add CHANNEL_ID=your_user_id to .env');
        emoteCache.set('bttv_channel', {});
        return;
      }

      const channelResponse = await axios.get(`https://api.betterttv.net/3/cached/users/twitch/${this.channelId}`);
      const bttvChannelEmotes = {};

      // Add channel emotes
      if (channelResponse.data.channelEmotes) {
        channelResponse.data.channelEmotes.forEach(emote => {
          bttvChannelEmotes[emote.code] = {
            id: emote.id,
            url: `https://cdn.betterttv.net/emote/${emote.id}/2x`,
            type: 'bttv_channel'
          };
        });
      }

      // Add shared emotes
      if (channelResponse.data.sharedEmotes) {
        channelResponse.data.sharedEmotes.forEach(emote => {
          bttvChannelEmotes[emote.code] = {
            id: emote.id,
            url: `https://cdn.betterttv.net/emote/${emote.id}/2x`,
            type: 'bttv_shared'
          };
        });
      }

      emoteCache.set('bttv_channel', bttvChannelEmotes);
      console.log(`Loaded ${Object.keys(bttvChannelEmotes).length} BTTV channel emotes`);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        // This is normal - channel doesn't have BTTV emotes set up
        console.log('No BTTV channel emotes found (this is normal)');
        emoteCache.set('bttv_channel', {});
      } else {
        console.error('Error loading BTTV channel emotes:', error.message);
      }
    }

    // Load FFZ channel emotes
    try {
      const ffzChannelResponse = await axios.get(`https://api.frankerfacez.com/v1/room/${this.channelName}`);
      const ffzChannelEmotes = {};

      // Get the room sets
      const room = ffzChannelResponse.data.room;
      if (room && room.set) {
        const setId = room.set;
        const setData = ffzChannelResponse.data.sets[setId];
        if (setData && setData.emoticons) {
          setData.emoticons.forEach(emote => {
            ffzChannelEmotes[emote.name] = {
              id: emote.id,
              url: `https://cdn.frankerfacez.com/emoticon/${emote.id}/2`,
              type: 'ffz_channel'
            };
          });
        }
      }

      emoteCache.set('ffz_channel', ffzChannelEmotes);
      console.log(`Loaded ${Object.keys(ffzChannelEmotes).length} FFZ channel emotes`);
    } catch (error) {
      console.error('Error loading FFZ channel emotes:', error.message);
    }
  }

  detectEmotes(message) {
    const detectedEmotes = [];

    // Get cached emote data - channel emotes have higher priority
    const bttvChannelEmotes = emoteCache.get('bttv_channel') || {};
    const ffzChannelEmotes = emoteCache.get('ffz_channel') || {};
    const bttvGlobalEmotes = emoteCache.get('bttv_global') || {};
    const ffzGlobalEmotes = emoteCache.get('ffz_global') || {};
    const seventvEmotes = emoteCache.get('7tv_global') || {};

    // Split message into words and check each word
    const words = message.split(/\s+/);

    for (const word of words) {
      // Check channel emotes first (higher priority)
      if (bttvChannelEmotes[word]) {
        detectedEmotes.push(bttvChannelEmotes[word]);
      }
      else if (ffzChannelEmotes[word]) {
        detectedEmotes.push(ffzChannelEmotes[word]);
      }
      // Then check global emotes
      else if (bttvGlobalEmotes[word]) {
        detectedEmotes.push(bttvGlobalEmotes[word]);
      }
      else if (ffzGlobalEmotes[word]) {
        detectedEmotes.push(ffzGlobalEmotes[word]);
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

module.exports = EmoteService;
