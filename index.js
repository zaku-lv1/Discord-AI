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
const { v4: uuidv4 } = require('uuid');

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
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`[情報] コマンドを読み込みました: /${command.data.name}`);
        }
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
        if (!settingsDoc.exists) {
            req.user = decodedToken;
            return next();
        }
        const admins = (Array.isArray(settingsDoc.data().admins)) ? settingsDoc.data().admins : [];
        if (admins.length > 0 && !admins.some(admin => admin.email === decodedToken.email)) {
            return res.status(403).send('Forbidden: Access is denied.');
        }
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error("認証エラー:", error);
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


// --- 設定取得API ---
adminRouter.get('/api/settings/toka', verifyFirebaseToken, async (req, res) => {
    try {
        const doc = await db.collection('bot_settings').doc('toka_profile').get();
        if (!doc.exists) return res.status(404).json({ message: '設定がまだありません。' });
        
        const data = doc.data();
        const admins = data.admins || [];
        let isSuperAdmin = admins.length > 0 ? (req.user.email === admins[0].email) : true;

        res.status(200).json({
            baseUserId: data.baseUserId || null,
            systemPrompt: data.systemPrompt || '',
            enableNameRecognition: data.enableNameRecognition ?? true,
            userNicknames: data.userNicknames || {},
            admins: admins,
            currentUser: { isSuperAdmin: isSuperAdmin }
        });
    } catch (error) { res.status(500).json({ message: 'サーバーエラー' }); }
});

adminRouter.get('/api/settings/schedule', verifyFirebaseToken, async (req, res) => {
    try {
        const doc = await db.collection('bot_settings').doc('schedule_settings').get();
        if (!doc.exists) return res.status(404).json({ message: '設定がまだありません。' });
        res.status(200).json(doc.data());
    } catch (error) { res.status(500).json({ message: 'サーバーエラー' }); }
});


// --- 設定保存API ---
adminRouter.post('/api/settings/toka', verifyFirebaseToken, async (req, res) => {
    try {
        const { baseUserId, systemPrompt, enableNameRecognition, userNicknames } = req.body;
        const dataToSave = { baseUserId, systemPrompt, enableNameRecognition, userNicknames, updatedBy: req.user.email, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        await db.collection('bot_settings').doc('toka_profile').set(dataToSave, { merge: true });
        res.status(200).json({ message: 'とーか設定を更新しました。' });
    } catch (error) { res.status(500).json({ message: 'サーバーエラー' }); }
});

adminRouter.post('/api/settings/schedule', verifyFirebaseToken, async (req, res) => {
    try {
        const { googleSheetId, googleServiceAccountJson, reminderGuildId, reminderRoleId, remindersEnabled } = req.body;
        try { if(googleServiceAccountJson) JSON.parse(googleServiceAccountJson); } catch (e) { return res.status(400).json({ message: 'GoogleサービスアカウントのJSON形式が無効です。' }); }
        const dataToSave = { googleSheetId, googleServiceAccountJson, reminderGuildId, reminderRoleId, remindersEnabled, updatedBy: req.user.email, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
        await db.collection('bot_settings').doc('schedule_settings').set(dataToSave, { merge: true });
        res.status(200).json({ message: 'スケジュール設定を更新しました。' });
    } catch (error) { res.status(500).json({ message: 'サーバーエラー' }); }
});

adminRouter.post('/api/settings/admins', verifyFirebaseToken, async (req, res) => {
    try {
        const { admins: newAdminsList } = req.body;
        const docRef = db.collection('bot_settings').doc('toka_profile');
        const docSnap = await docRef.get();
        const currentSettings = docSnap.exists ? docSnap.data() : {};
        const currentAdmins = currentSettings.admins || [];
        const superAdminEmail = currentAdmins.length > 0 ? currentAdmins[0].email : null;
        const newAdminEmails = (newAdminsList || []).map(a => a.email);
        const currentAdminEmails = currentAdmins.map(a => a.email);
        const adminsChanged = JSON.stringify([...currentAdminEmails].sort()) !== JSON.stringify([...newAdminEmails].sort());

        if (adminsChanged && superAdminEmail && req.user.email !== superAdminEmail) {
            return res.status(403).json({ message: 'エラー: 管理者リストの変更は最高管理者のみ許可されています。' });
        }
        
        let finalAdmins = newAdminsList || [];
        if (docSnap.exists && finalAdmins.length === 0) {
            finalAdmins.push({ name: req.user.displayName || '管理者', email: req.user.email });
        } else if (!docSnap.exists) {
            finalAdmins = [{ name: req.user.displayName || '最初の管理者', email: req.user.email }];
        }
        
        await docRef.set({ admins: finalAdmins }, { merge: true });
        await db.collection('settings_history').add({ timestamp: admin.firestore.FieldValue.serverTimestamp(), changedBy: req.user.email, changes: { summary: '管理者リストを更新', admins: finalAdmins } });
        
        res.status(200).json({ message: '管理者リストを更新しました。' });
    } catch (error) { res.status(500).json({ message: 'サーバーエラー' }); }
});


// --- 招待コード・登録API (変更なし) ---
adminRouter.post('/api/generate-invite-code', verifyFirebaseToken, async (req, res) => { /* ... */ });
adminRouter.post('/api/register-with-invite', async (req, res) => { /* ... */ });


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
    const { code } = req.params;
    if (code === 'favicon.ico') return res.status(204).send();
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