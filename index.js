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

// .envファイルから環境変数を読み込む
dotenv.config();

// =================================================================================
// Firebase Admin SDKの初期化 (環境変数を使用)
// =================================================================================
try {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!serviceAccountString) {
        throw new Error('環境変数 `FIREBASE_SERVICE_ACCOUNT_JSON` が設定されていません。');
    }
    const serviceAccount = JSON.parse(serviceAccountString);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('[情報] Firebase Admin SDKが正常に初期化されました。');
} catch (error) {
    console.error('[致命的エラー] Firebase Admin SDKの初期化に失敗しました:', error.message);
    process.exit(1);
}

const db = admin.firestore();
console.log('[情報] Firebase Firestoreに正常に接続しました。');

// =================================================================================
// Discordクライアントの初期化
// =================================================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

client.commands = new Collection();
client.db = db;

// =================================================================================
// コマンドの読み込み
// =================================================================================
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`[情報] コマンドを読み込みました: /${command.data.name}`);
        } else {
            console.log(`[警告] ${filePath} のコマンドには、必須の "data" または "execute" プロパティがありません。`);
        }
    }
} else {
    console.log('[警告] `commands` ディレクトリが見つかりません。');
}

// =================================================================================
// Expressサーバーの設定
// =================================================================================
const app = express();
// ★ ポートをADMIN_PORTから取得するように変更
const port = process.env.ADMIN_PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Firebase Authトークンを検証するミドルウェア
const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(403).send('Unauthorized: No token provided.');
    }
    const idToken = authHeader.split('Bearer ')[1];
    try {
        req.user = await admin.auth().verifyIdToken(idToken);
        next();
    } catch (error) {
        res.status(403).send('Unauthorized: Invalid token.');
    }
};

// API: 設定の取得
app.get('/api/settings/toka', verifyFirebaseToken, async (req, res) => {
    try {
        const doc = await db.collection('bot_settings').doc('toka_profile').get();
        if (!doc.exists) {
            return res.status(404).json({ message: '設定がまだ保存されていません。' });
        }
        res.status(200).json(doc.data());
    } catch (error) {
        res.status(500).json({ message: 'サーバーエラーが発生しました。' });
    }
});

// API: 設定の保存
app.post('/api/settings/toka', verifyFirebaseToken, async (req, res) => {
    try {
        const { systemPrompt } = req.body;
        if (!systemPrompt) {
            return res.status(400).json({ message: 'systemPromptは必須です。' });
        }
        await db.collection('bot_settings').doc('toka_profile').set({
            systemPrompt,
            updatedBy: req.user.email,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.status(200).json({ message: '設定が正常に更新されました。' });
    } catch (error) {
        res.status(500).json({ message: 'サーバーエラーが発生しました。' });
    }
});

app.listen(port, () => {
    console.log(`[情報] Webサーバーが http://localhost:${port} で起動しました。`);
});


// =================================================================================
// Discordイベントハンドラ & ログイン
// =================================================================================
client.once(Events.ClientReady, async c => {
    console.log('----------------------------------------------------');
    console.log(`✅ ボットが起動しました。ログインユーザー: ${c.user.tag}`);
    console.log('----------------------------------------------------');
    try {
        await c.application.commands.set(client.commands.map(cmd => cmd.data.toJSON()));
        console.log('[情報] スラッシュコマンドが正常にDiscordに登録されました。');
    } catch (error) {
        console.error('[致命的エラー] スラッシュコマンドの登録中にエラーが発生しました:', error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`コマンド実行エラー (${interaction.commandName}):`, error);
        const reply = { content: 'コマンド実行中にエラーが発生しました。', ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
        else await interaction.reply(reply);
    }
});

if (!process.env.DISCORD_TOKEN) {
    console.error('[致命的エラー] 環境変数 `DISCORD_TOKEN` が設定されていません。');
    process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);