// =================================================================================
// モジュールのインポート
// =================================================================================
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const dotenv = require('dotenv');
const express = require('express');
const axios = require('axios');
const admin = require('firebase-admin');
const ejs = require('ejs');

dotenv.config();

// =================================================================================
// Firebase Admin SDKの初期化
// =================================================================================
try {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountString) throw new Error('環境変数 `FIREBASE_SERVICE_ACCOUNT_JSON` が設定されていません。');
    const serviceAccount = JSON.parse(serviceAccountString);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('[情報] Firebase Admin SDKが正常に初期化されました。');
} catch (error) {
    console.error('[致命的エラー] Firebase Admin SDKの初期化に失敗しました:', error.message);
    process.exit(1);
}
const db = admin.firestore();

// =================================================================================
// Discordクライアントの初期化とコマンド読み込み
// =================================================================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});
client.commands = new Collection();
client.db = db;
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
}

// =================================================================================
// Expressサーバーの設定
// =================================================================================
const app = express();
const port = process.env.PORT || 80;

const adminRouter = express.Router();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
adminRouter.use(express.static(path.join(__dirname, 'public')));
adminRouter.use(express.json());

// ▼▼▼ ここにデバッグ用のログを仕込みました ▼▼▼
const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).send('Unauthorized: No token provided.');
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        
        const settingsDoc = await db.collection('bot_settings').doc('toka_profile').get();
        const admins = (settingsDoc.exists && Array.isArray(settingsDoc.data().admins)) ? settingsDoc.data().admins : [];

        // --- デバッグログ ---
        console.log('\n========================');
        console.log('🔑 管理者チェック開始');
        console.log('👤 アクセスしてきたユーザー:', decodedToken.email);
        console.log('👥 DBの管理者リスト:', admins);
        
        // 管理者リストが空の場合は誰でも許可、そうでなければリストに含まれているかチェック
        const isAllowed = admins.length === 0 || admins.includes(decodedToken.email);
        
        console.log('✅ アクセス許可:', isAllowed ? 'はい' : 'いいえ');
        console.log('========================\n');
        // --- デバッグログここまで ---

        if (!isAllowed) {
            return res.status(403).send('Forbidden: Access is denied.');
        }

        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('認証エラー:', error);
        res.status(403).send('Unauthorized: Invalid token');
    }
};

adminRouter.get('/', (req, res) => {
    const firebaseConfig = {
        apiKey: process.env.FIREBASE_API_KEY,
        authDomain: process.env.FIREBASE_AUTH_DOMAIN,
        projectId: process.env.FIREBASE_PROJECT_ID,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.FIREBASE_APP_ID,
    };
    res.render('index', { firebaseConfig });
});

// (これ以降の GET, POST ハンドラ、サーバー起動、Discordボットの処理は変更ありません)
adminRouter.get('/api/settings/toka', verifyFirebaseToken, async (req, res) => { /* ... */ });
adminRouter.post('/api/settings/toka', verifyFirebaseToken, async (req, res) => { /* ... */ });
app.use((req, res, next) => { /* ... */ });
app.get('/:code', async (req, res) => { /* ... */ });
app.listen(port, () => { /* ... */ });
client.once(Events.ClientReady, c => { /* ... */ });
client.on(Events.InteractionCreate, async interaction => { /* ... */ });
client.login(process.env.DISCORD_TOKEN);