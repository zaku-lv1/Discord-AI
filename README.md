# 🤖 Discord AI Bot - AI管理システム

Discord bot with AI capabilities and web-based administration panel featuring Discord OAuth login.

## ✨ Features

- **🤖 AI-Powered Discord Bot**: Multiple AI personalities with customizable prompts
- **🌐 Web Admin Panel**: User-friendly interface for managing AI configurations
- **🔐 Discord OAuth Login**: Secure authentication using Discord accounts
- **🔥 Firebase Integration**: Real-time database for settings and user management
- **🧠 Google Gemini AI**: Advanced AI responses with multiple model modes
- **👥 Multi-Admin Support**: Hierarchical admin system with invite codes
- **📱 Responsive Design**: Modern dark theme with mobile support

## 🛠️ Setup Instructions

### Prerequisites

- Node.js 18.0.0 or higher
- Discord application and bot token
- Firebase project
- Google Gemini API key

### 1. Discord Application Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select existing one
3. Go to "Bot" section:
   - Create a bot and copy the token
   - Enable necessary intents: `Guilds`, `Guild Messages`, `Message Content`
4. Go to "OAuth2" section:
   - Add redirect URIs based on your deployment:
     - **Development**: `http://localhost:8080/auth/discord/callback`
     - **Production**: `https://your-domain.com/auth/discord/callback`
     - **Railway/Heroku**: `https://your-app.railway.app/auth/discord/callback`
   - Copy Client ID and Client Secret

### 2. Firebase Setup

1. Create a new project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Firestore Database
3. Go to Project Settings:
   - Copy your web app configuration values
4. Go to Service Accounts:
   - Generate new private key and download the JSON file

### 3. Google Gemini API Setup

1. Visit [Google AI Studio](https://ai.google.dev/)
2. Create an API key for Gemini

### 4. Installation

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
   
4. Edit `.env` file with your actual values:
   - Fill in all the required tokens and credentials
   - Make sure to format the Firebase service account JSON properly

### 5. Running the Application

1. Start the bot:
   ```bash
   npm start
   ```

2. Access the admin panel:
   - Open your browser and go to `http://localhost:8080`
   - Click "Login with Discord" to authenticate

## 🎯 Usage

### Bot Commands

The bot includes various slash commands:
- `/toka` - AI conversation with customizable personality
- `/gemini` - Direct Gemini AI interaction
- `/image` - Image-related commands
- `/echo` - Echo messages
- And many more...

### Web Admin Panel

1. **Login**: Use Discord OAuth to authenticate
2. **AI Management**: Create and configure multiple AI personalities
3. **User Management**: Manage admin users and permissions
4. **Settings**: Configure global bot settings

### AI Configuration

- **System Prompts**: Define AI personality and behavior
- **Model Modes**: Choose between Hybrid (high quality) or Flash (fast)
- **Response Settings**: Configure delays and error messages
- **User Recognition**: Enable personalized interactions

## 🔧 Configuration

### Environment Variables

See `.env.example` for a complete list of required environment variables.

### Firebase Security Rules

Make sure your Firestore has appropriate security rules configured for the collections:
- `bot_settings`
- `invitation_codes`

### Discord Bot Permissions

Required bot permissions:
- Send Messages
- Read Message History
- Use Slash Commands
- Embed Links
- Attach Files

## 🚀 Deployment

### Production Setup

The application automatically detects the environment and configures authentication accordingly:

#### Environment Configuration

1. **Development (localhost)**:
   ```bash
   NODE_ENV=development
   ADMIN_DOMAIN=localhost
   PORT=8080
   ```
   - Uses HTTP protocol
   - Includes port in callback URL
   - Less strict session security

2. **Production (custom domain)**:
   ```bash
   NODE_ENV=production
   ADMIN_DOMAIN=your-domain.com
   PORT=443
   ```
   - Uses HTTPS protocol
   - No port in callback URL
   - Enhanced session security
   - Secure cookies

3. **Cloud Platforms (Railway, Heroku, etc.)**:
   ```bash
   NODE_ENV=production
   ADMIN_DOMAIN=your-app.railway.app
   PORT=80
   ```
   - Automatically uses HTTPS
   - Platform handles SSL termination

#### Discord OAuth Configuration

The callback URL is automatically constructed based on your environment:

- **Development**: `http://localhost:8080/auth/discord/callback`
- **Production**: `https://your-domain.com/auth/discord/callback`
- **Custom**: Set `DISCORD_CALLBACK_URL` to override automatic detection

#### Manual Callback URL Override

For complex deployment scenarios, you can manually specify the callback URL:

```bash
DISCORD_CALLBACK_URL=https://your-custom-domain.com/auth/discord/callback
```

### Platform-Specific Deployment

#### Railway
```bash
NODE_ENV=production
ADMIN_DOMAIN=your-app.railway.app
# Other environment variables...
```

#### Heroku
```bash
NODE_ENV=production
ADMIN_DOMAIN=your-app.herokuapp.com
# Other environment variables...
```

#### VPS/Custom Server
```bash
NODE_ENV=production
ADMIN_DOMAIN=your-domain.com
PORT=443
# Other environment variables...
```

### Docker Deployment

```dockerfile
# Example Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
```

## 🛡️ Security

- Environment variables are excluded from git
- Firebase service account credentials are securely stored
- Discord OAuth provides secure authentication
- Admin permissions are hierarchical with super admin controls

## 🐛 Troubleshooting

### Common Issues

1. **Bot not responding**: Check Discord token and bot permissions
2. **Login fails**: 
   - Verify Discord OAuth redirect URI matches exactly
   - Check if callback URL is correctly configured for your environment
   - Ensure HTTPS is used in production
3. **Firebase errors**: Ensure service account JSON is properly formatted
4. **AI not working**: Check Gemini API key and quota
5. **Session issues in production**: 
   - Verify `SESSION_SECRET` is set to a strong value
   - Check if `NODE_ENV=production` is set
   - Ensure HTTPS is properly configured

### Authentication Troubleshooting

If authentication fails:

1. **Check environment variables**:
   ```bash
   echo $NODE_ENV
   echo $ADMIN_DOMAIN
   echo $DISCORD_CLIENT_ID
   ```

2. **Verify callback URL**: The Discord OAuth callback URL must exactly match what's configured in Discord Developer Portal

3. **Test callback URL construction**: Use the included test script:
   ```bash
   node test_auth.js
   ```

4. **Check browser console**: Look for any JavaScript errors or network issues

### Logs

Check console output for detailed error messages and debugging information.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🙏 Acknowledgments

- Discord.js for Discord API integration
- Google Generative AI for AI capabilities
- Firebase for backend services
- Express.js for web server functionality

---

For support or questions, please create an issue in the repository.