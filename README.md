# SiteswapJS Twitch Bot

A real-time Twitch bot that detects juggling siteswap patterns in chat messages, validates them, and displays animated juggling simulations using the SiteswapJS library. Perfect for juggling streams and interactive audience engagement.

## Features

- **Real-time Siteswap Detection**: Automatically detects and validates siteswap patterns in Twitch chat messages
- **Live Animation**: Renders juggling animations in real-time using HTML5 Canvas
- **AI-Powered Responses**: Generates enthusiastic, contextual responses using OpenAI's GPT model
- **Speech Bubbles**: Displays AI responses as animated speech bubbles over the animation
- **Emote Integration**: Supports Twitch, BetterTTV, FrankerFaceZ, and unicode emoji as juggling props
- **OBS Integration**: Easy setup as a browser source in OBS Studio
- **Comprehensive Validation**: Supports vanilla, multiplex, synchronous, and synchronous multiplex siteswap patterns

## Prerequisites

- Node.js (v14 or higher)
- A Twitch account with bot credentials
- OpenAI API key (for AI responses)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/JuggleWithTim/siteswap-js-twitch.git
   cd siteswap-js-twitch
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

## Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` with your credentials:
   ```
   TWITCH_USERNAME=your_bot_username
   TWITCH_PASSWORD=oauth:your_oauth_token
   OPENAI_API_KEY=your_openai_api_key
   ```

   - **TWITCH_USERNAME**: Your Twitch bot's username
   - **TWITCH_PASSWORD**: OAuth token from [Twitch Token Generator](https://twitchtokengenerator.com/)
   - **OPENAI_API_KEY**: Your OpenAI API key for generating responses

## Usage

1. Start the server:
   ```bash
   npm start
   ```

2. The server will run at `http://localhost:3030`

3. In OBS Studio:
   - Add a "Browser Source"
   - Set URL to `http://localhost:3030`
   - Position and resize as needed in your stream layout

4. The bot will automatically:
   - Connect to your Twitch channel
   - Monitor chat for siteswap patterns
   - Validate detected patterns
   - Display animations and AI responses
   - Update props based on emotes

## How It Works

1. **Chat Monitoring**: The bot connects to Twitch using TMI.js and monitors chat messages in real-time
2. **Pattern Detection**: Messages are scanned for potential siteswap patterns using regex patterns
3. **Validation**: Detected patterns are validated using the comprehensive siteswap validator
4. **AI Response**: Valid patterns trigger OpenAI API calls to generate enthusiastic responses
5. **Animation**: The frontend receives siteswap data via Socket.IO and renders the animation
6. **Visual Feedback**: Speech bubbles display AI responses, and emotes can be used as props

## Supported Siteswap Types

- **Vanilla**: Standard siteswap notation (e.g., `531`, `97531`)
- **Multiplex**: Bracketed throws (e.g., `[55]`, `[54]`)
- **Synchronous**: Parenthesized throws (e.g., `(4,4)`, `(6x,4)*`)
- **Synchronous Multiplex**: Combined sync and multiplex (e.g., `([44],6)`)


## Credits

- **Original SiteswapJS**: [Tom Whitfield](https://github.com/tomwhitfield/siteswap-js)
- **Siteswap Validator**: Extracted and adapted from the original SiteswapJS project
- **Animation Engine**: Built on the SiteswapJS library with custom enhancements

## Examples

Try these siteswap patterns in chat:
- `5` - 5 ball cascade
- `441` - A 3 ball pattern
- `(4,4)` - Synchronous fountain
- `[33]` - Multiplex stacked cascade
