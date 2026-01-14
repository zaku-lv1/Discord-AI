# 🤖 Discord AI Bot

A simplified Discord bot with AI capabilities and a minimal web-based configuration dashboard.

## ✨ Features

- **🤖 Discord Bot**: Single `/ai` command to summon an AI assistant in Discord channels
- **🌐 Configuration Dashboard**: Simple web UI to edit AI settings (日本語対応)
- **🔐 IP-Based Access Control**: Dashboard protected by IP allowlist
- **🧠 Google Gemini AI**: Supports both Pro and Flash models with hybrid fallback
- **💾 Dual Storage Options**: File-based storage (default) or Firestore cloud storage
- **📜 Persistent Conversation History**: Chat history stored in Firestore across bot restarts
- **👤 Nickname Support**: Set a friendly nickname for natural conversation and mention handling
- **🔄 Automatic Fallback**: Seamlessly switches between storage methods
- **🌏 Japanese Interface**: Home page and dashboard in Japanese

## 🛠️ Setup

### Prerequisites

- Node.js 18.0.0 or higher
- Discord bot token
- Google Gemini API key

### 1. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select an existing one
3. Navigate to the "Bot" section:
   - Create a bot and copy the token
   - Enable required intents: `Guilds`, `Guild Messages`, `Message Content`
4. Invite the bot to your server with appropriate permissions

### 2. Google Gemini API Setup

1. Visit [Google AI Studio](https://ai.google.dev/)
2. Create an API key for Gemini

### 3. Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/zaku-lv1/Discord-AI.git
   cd Discord-AI
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   
4. Edit the `.env` file with your values:
   ```bash
   DISCORD_TOKEN=your_discord_bot_token_here
   GEMINI_API_KEY=your_gemini_api_key_here
   PORT=8080
   ADMIN_ALLOWED_IPS=127.0.0.1,your.ip.address.here
   
   # Optional: Enable Firestore cloud storage
   # FIREBASE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
   ```

### 4. (Optional) Enable Firestore Cloud Storage

For cloud-based configuration storage, see [FIRESTORE_GUIDE.md](FIRESTORE_GUIDE.md) for detailed setup instructions.

### 5. Run the Application

```bash
npm start
```

The server will start on `http://localhost:8080`

## 🎯 Usage

### Discord Bot Command

Use the `/ai` command in any Discord channel where the bot is present:
- The AI will be summoned and respond to all messages in the channel
- Run `/ai` again to dismiss the AI from the channel
- The AI uses the configuration from your dashboard
- Conversation history is persistent and stored across bot restarts (when Firebase is configured)

### Configuration Dashboard

1. Access the dashboard at `http://localhost:8080/dashboard`
   - Only accessible from IPs listed in `ADMIN_ALLOWED_IPS`
2. Configure:
   - **Bot Name**: Display name for the AI bot
   - **Bot Icon URL**: Avatar image for the bot
   - **Nickname**: A friendly nickname for the AI (e.g., "まい", "さくら")
   - **System Prompt**: Define how the AI should behave
   - **Model Mode**: Choose between Hybrid (Pro with Flash fallback) or Flash only
   - **Reply Delay**: Set delay before AI responds (in milliseconds)
   - **Error Message**: Custom message when AI fails

## 📁 Configuration Storage

### File-Based Storage (Default)

Settings are stored locally in `data/ai-config.json`:

```json
{
  "botName": "AI Assistant",
  "botIconUrl": "",
  "nickname": "まい",
  "systemPrompt": "You are a helpful and friendly AI assistant.",
  "modelMode": "hybrid",
  "replyDelayMs": 0,
  "errorOopsMessage": "Sorry, something went wrong!"
}
```

### Firestore Cloud Storage (Optional)

When Firebase credentials are configured, both settings and conversation history are stored in Firestore:
- **AI Settings**: Collection `settings`, Document `ai-config`
- **Conversation History**: Collection `conversations`, Document per channel ID

The system automatically falls back to file-based/in-memory storage if Firestore is unavailable.

See [FIRESTORE_GUIDE.md](FIRESTORE_GUIDE.md) for setup instructions.

You can edit this file directly or use the web dashboard.

## 🔧 Configuration Options

### Environment Variables

- `DISCORD_TOKEN`: Your Discord bot token (required)
- `GEMINI_API_KEY`: Your Google Gemini API key (required)
- `PORT`: Server port (default: 8080)
- `ADMIN_ALLOWED_IPS`: Comma-separated list of allowed IP addresses for dashboard access
- `NODE_ENV`: Set to `production` for production deployment

### AI Settings

- **botName**: Display name for the AI bot in Discord
- **botIconUrl**: Avatar image URL for the bot (optional)
- **nickname**: Friendly nickname for natural conversation (e.g., "まい", "さくら")
- **systemPrompt**: The personality and behavior definition for the AI
- **modelMode**: 
  - `hybrid`: Tries gemini-2.5-pro first, falls back to gemini-2.5-flash
  - `flash_only`: Uses only gemini-2.5-flash (faster, lower cost)
- **replyDelayMs**: Delay in milliseconds before AI responds (0 = no delay)
- **errorOopsMessage**: Custom error message when AI fails to respond

## 🛡️ Security

- Dashboard is protected by IP allowlist (no authentication required)
- All configuration is stored locally
- No external database connections
- No user accounts or sessions

## 🚀 Deployment

### Production Deployment

1. Set environment variables:
   ```bash
   NODE_ENV=production
   DISCORD_TOKEN=your_token
   GEMINI_API_KEY=your_key
   ADMIN_ALLOWED_IPS=your.production.ip
   PORT=8080
   ```

2. Start the application:
   ```bash
   npm start
   ```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
```

## 🐛 Troubleshooting

### Common Issues

1. **Bot doesn't respond**: Check Discord token and bot permissions
2. **Can't access dashboard**: Verify your IP is in `ADMIN_ALLOWED_IPS`
3. **AI doesn't work**: Verify Gemini API key and check for quota limits
4. **Settings not saving**: Check file permissions for `data/` directory

### Finding Your IP Address

To add your IP to the allowlist:
```bash
curl ifconfig.me
```

Add the returned IP address to `ADMIN_ALLOWED_IPS` in your `.env` file.

## 📄 License

This project is licensed under the ISC License.

## 🙏 Acknowledgements

- Discord.js for Discord API integration
- Google Generative AI for AI functionality
- Express.js for web server

---

For support or questions, please create an issue in the repository.
