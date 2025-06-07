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

// .envファイルから環境変数を読み込む
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
// Discordクライアントの初期化
// =================================================================================
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});
client.commands = new Collection();
client.db = db;

// =================================================================================
// コマンドの読み込み
// =================================================================================
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        console.log(`[情報] コマンドを読み込みました: /${command.data.name}`);
    }
}

// =================================================================================
// Expressサーバーの設定
// =================================================================================
const app = express();
const port = process.env.PORT || 80;

// --- 管理ページ用のルーターを定義 ---
const adminRouter = express.Router();

// EJSをテンプレートエンジンとして設定
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 管理ページ用の静的ファイル（CSS, JS）を提供
adminRouter.use(express.static(path.join(__dirname, 'public')));
// APIがJSONボディを読めるようにする
adminRouter.use(express.json());

// Firebaseトークンを検証するミドルウェア
const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(403).send('Unauthorized');
    const idToken = authHeader.split('Bearer ')[1];
    try {
        req.user = await admin.auth().verifyIdToken(idToken);
        next();
    } catch (error) {
        res.status(403).send('Unauthorized');
    }
};

// [管理ページ] ルートURLへのアクセス
adminRouter.get('/', (req, res) => {
    // .envからWebアプリ用のFirebase設定を読み込んでHTMLに渡す
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

// [管理ページAPI] 設定を取得
adminRouter.get('/api/settings/toka', verifyFirebaseToken, async (req, res) => {
    try {
        const doc = await db.collection('bot_settings').doc('toka_profile').get();
        if (!doc.exists) return res.status(404).json({ message: '設定がまだありません。' });
        res.status(200).json(doc.data());
    } catch (error) { res.status(500).json({ message: 'サーバーエラー' }); }
});

// [管理ページAPI] 設定を保存
adminRouter.post('/api/settings/toka', verifyFirebaseToken, async (req, res) => {
    try {
        const { systemPrompt, baseUserId } = req.body;
        if (typeof systemPrompt === 'undefined') return res.status(400).json({ message: 'systemPromptは必須です。' });
        await db.collection('bot_settings').doc('toka_profile').set({
            systemPrompt,
            baseUserId: baseUserId || null,
            updatedBy: req.user.email,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.status(200).json({ message: '設定を更新しました。' });
    } catch (error) { res.status(500).json({ message: 'サーバーエラー' }); }
});


// ★★★ ドメイン名(ホスト名)によって処理を振り分けるミドルウェア ★★★
app.use((req, res, next) => {
    // アクセスされたホスト名が、.envで設定したADMIN_DOMAINと一致する場合
    if (req.hostname === process.env.ADMIN_DOMAIN) {
        // 管理ページ用ルーターに処理をすべて渡す
        adminRouter(req, res, next);
    } else {
        // それ以外のドメインの場合は、次の処理（画像表示ルート）へ進む
        next();
    }
});


// --- 画像表示用のルート ---
app.get('/:code', async (req, res) => {
    const { code } = req.params;
    if (code === 'favicon.ico') return res.status(204).send();
    try {
        const doc = await db.collection('images').doc(code).get();
        if (doc.exists) {
            const { url, contentType } = doc.data();
            const imageResponse = await axios.get(url, { responseType: 'arraybuffer' });
            res.set('Content-Type', contentType);
            res.send(imageResponse.data);
        } else {
            res.status(404).send('画像が見つかりません。');
        }
    } catch (error) {
        console.error(`[エラー] 画像取得失敗 (Code: ${code}):`, error);
        res.status(500).send('エラーが発生しました。');
    }
});


// Expressサーバーを起動
app.listen(port, () => {
    console.log(`[情報] Webサーバーがポート ${port} で起動しました。`);
    console.log(`[情報] - 画像アクセス: ${process.env.BASE_URL || 'http://localhost:' + port}/{code}`);
    console.log(`[情報] - 管理ページ: https://${process.env.ADMIN_DOMAIN}`);
});

// =================================================================================
// Discordイベントハンドラ & ログイン
// =================================================================================
client.once(Events.ClientReady, c => {
    console.log('----------------------------------------------------');
    console.log(`✅ ボット起動: ${c.user.tag}`);
    c.application.commands.set(client.commands.map(cmd => cmd.data.toJSON()));
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`コマンドエラー (${interaction.commandName}):`, error);
        const reply = { content: 'コマンド実行中にエラーが発生しました。', ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
        else await interaction.reply(reply);
    }
});

client.login(process.env.DISCORD_TOKEN);