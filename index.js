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
        console.log(`[情報] コマンドを読み込みました: /${command.data.name}`);
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

// Firebaseトークンを検証し、管理者リストによる認可も行うミドルウェア
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

        // 管理者リストが空でなく、アクセスしてきたユーザーがリストに含まれていない場合はアクセスを拒否
        if (admins.length > 0 && !admins.includes(decodedToken.email)) {
            return res.status(403).send('Forbidden: Access is denied.');
        }

        req.user = decodedToken;
        next();
    } catch (error) {
        res.status(403).send('Unauthorized: Invalid token');
    }
};

// 設定パネルのHTMLをレンダリング
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

// GET /api/settings/toka (設定の読み込み)
adminRouter.get('/api/settings/toka', verifyFirebaseToken, async (req, res) => {
    try {
        const doc = await db.collection('bot_settings').doc('toka_profile').get();
        if (!doc.exists) {
            return res.status(404).json({ message: '設定がまだありません。' });
        }
        const data = doc.data();
        
        const responseData = {
            baseUserId: data.baseUserId || null,
            systemPrompt: data.systemPrompt || '',
            enableNameRecognition: data.enableNameRecognition ?? true,
            userNicknames: data.userNicknames || {},
            admins: data.admins || []
        };
        res.status(200).json(responseData);

    } catch (error) {
        console.error('GET /api/settings/toka エラー:', error);
        res.status(500).json({ message: 'サーバーエラー' });
    }
});

// POST /api/settings/toka (設定の保存と管理者アカウントの自動作成)
adminRouter.post('/api/settings/toka', verifyFirebaseToken, async (req, res) => {
    try {
        const {
            systemPrompt,
            baseUserId,
            enableNameRecognition,
            userNicknames,
            admins: newAdminsList
        } = req.body;

        if (typeof systemPrompt === 'undefined') {
            return res.status(400).json({ message: 'systemPromptは必須です。' });
        }
        
        const docRef = db.collection('bot_settings').doc('toka_profile');
        const docSnap = await docRef.get();
        const currentAdmins = (docSnap.exists && Array.isArray(docSnap.data().admins)) ? docSnap.data().admins : [];

        // 新しく追加された管理者を特定し、アカウントを自動作成
        const newlyAddedAdmins = newAdminsList.filter(email => !currentAdmins.includes(email));
        const creationPromises = newlyAddedAdmins.map(async (email) => {
            try {
                await admin.auth().getUserByEmail(email);
                console.log(`[情報] 管理者 ${email} は既に存在します。`);
            } catch (error) {
                if (error.code === 'auth/user-not-found') {
                    console.log(`[情報] 新規管理者 ${email} のアカウントを作成します...`);
                    await admin.auth().createUser({ email: email });
                    return email;
                }
                throw error;
            }
        });
        
        const createdUsers = (await Promise.all(creationPromises)).filter(Boolean);

        // 最終的な管理者リストを決定
        let finalAdmins = newAdminsList || [];
        if (currentAdmins.length === 0 && createdUsers.length === 0 && !finalAdmins.includes(req.user.email)) {
            finalAdmins.push(req.user.email);
        }
        
        // Firestoreに全設定を保存
        const dataToSave = {
            systemPrompt,
            baseUserId: baseUserId || null,
            enableNameRecognition: enableNameRecognition ?? true,
            userNicknames: userNicknames || {},
            admins: finalAdmins,
            updatedBy: req.user.email,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        await docRef.set(dataToSave, { merge: true });
        
        let message = '設定を更新しました。';
        if (createdUsers.length > 0) {
            message += `\n新規管理者 (${createdUsers.join(', ')}) のアカウントが作成されました。対象者は「パスワードを忘れた場合」のリンクから初期パスワードを設定してください。`;
        }

        res.status(200).json({ message: message });

    } catch (error) {
        console.error('POST /api/settings/toka エラー:', error);
        res.status(500).json({ message: 'サーバーエラーが発生しました。' });
    }
});

// --- ドメイン名によって管理ページへのアクセスを制御 ---
app.use((req, res, next) => {
    if (req.hostname === process.env.ADMIN_DOMAIN) {
        adminRouter(req, res, next);
    } else {
        next();
    }
});

// --- その他のルート ---
app.get('/:code', async (req, res) => {
    // (画像表示などの処理があればここに)
});

// Expressサーバーを起動
app.listen(port, () => {
    console.log(`[情報] Webサーバーがポート ${port} で起動しました。`);
    console.log(`[情報] 管理ページ: https://${process.env.ADMIN_DOMAIN}`);
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
    try { await command.execute(interaction); }
    catch (error) {
        console.error(`コマンドエラー (${interaction.commandName}):`, error);
        const reply = { content: 'コマンド実行中にエラーが発生しました。', ephemeral: true };
        if (interaction.replied || interaction.deferred) await interaction.followUp(reply);
        else await interaction.reply(reply);
    }
});

client.login(process.env.DISCORD_TOKEN);