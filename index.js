// =================================================================================
// モジュールのインポート
// =================================================================================
const fs = require('node:fs');
const path = require('node:path');
const { Client, GatewayIntentBits, Collection, Events } = require('discord.js');
const dotenv = require('dotenv');
const express = require('express');
const admin = require('firebase-admin');
const ejs = require('ejs');
const { v4: uuidv4 } = require('uuid');
const cron = require('node-cron');
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');

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
        }
    }
}

// =================================================================================
// Google Sheets API クライアント取得ヘルパー関数
// =================================================================================
async function getSheetsClient() {
    const credentialsJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!credentialsJson) throw new Error('GoogleサービスアカウントのJSON認証情報が.envに設定されていません。');
    const serviceAccountCreds = JSON.parse(credentialsJson);
    const jwtClient = new JWT({
        email: serviceAccountCreds.client_email,
        key: serviceAccountCreds.private_key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return google.sheets({ version: 'v4', auth: jwtClient });
}

// =================================================================================
// リマインダー スケジューラー
// =================================================================================
let dailyReminderTask = null;
async function setupReminderSchedule() {
    if (dailyReminderTask) {
        dailyReminderTask.stop();
        console.log('[リマインダー] 既存のスケジュールを停止しました。');
    }
    try {
        const settingsDoc = await db.collection('bot_settings').doc('schedule_settings').get();
        if (!settingsDoc.exists) return;
        const settings = settingsDoc.data();
        if (settings.remindersEnabled && settings.reminderTime) {
            const [hour, minute] = settings.reminderTime.split(':');
            const cronExpression = `${minute} ${hour} * * *`;
            if (cron.validate(cronExpression)) {
                const scheduleCommand = client.commands.get('schedule');
                if (scheduleCommand && typeof scheduleCommand.scheduleDailyReminder === 'function') {
                    dailyReminderTask = cron.schedule(cronExpression, () => {
                        scheduleCommand.scheduleDailyReminder(client, db);
                    }, { scheduled: true, timezone: "Asia/Tokyo" });
                    console.log(`[リマインダー] セットアップ完了。毎日 ${settings.reminderTime} にリマインダーが送信されます。`);
                }
            }
        }
    } catch (error) {
        console.error('[リマインダー] スケジュールセットアップ中にエラーが発生しました:', error);
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
adminRouter.use(express.json({ limit: '5mb' }));

const verifyFirebaseToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).send('Unauthorized');
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
            return res.status(403).send('Forbidden');
        }
        req.user = decodedToken;
        next();
    } catch (error) {
        res.status(403).send('Unauthorized');
    }
};

adminRouter.get('/', (req, res) => {
    const firebaseConfig = { apiKey: process.env.FIREBASE_API_KEY, authDomain: process.env.FIREBASE_AUTH_DOMAIN, projectId: process.env.FIREBASE_PROJECT_ID, storageBucket: process.env.FIREBASE_STORAGE_BUCKET, messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID, appId: process.env.FIREBASE_APP_ID };
    res.render('index', { firebaseConfig });
});

// --- APIエンドポイント ---
adminRouter.get('/api/settings', verifyFirebaseToken, async (req, res) => {
    try {
        const tokaPromise = db.collection('bot_settings').doc('toka_profile').get();
        const schedulePromise = db.collection('bot_settings').doc('schedule_settings').get();
        const [tokaDoc, scheduleDoc] = await Promise.all([tokaPromise, schedulePromise]);

        if (!tokaDoc.exists && !scheduleDoc.exists) return res.status(404).json({ message: '設定がまだありません。' });

        const tokaData = tokaDoc.exists ? tokaDoc.data() : {};
        const scheduleData = scheduleDoc.exists ? scheduleDoc.data() : {};
        
        const admins = tokaData.admins || [];
        let isSuperAdmin = admins.length > 0 ? (req.user.email === admins[0].email) : true;

        res.status(200).json({
            toka: {
                baseUserId: tokaData.baseUserId || null,
                systemPrompt: tokaData.systemPrompt || '',
                enableNameRecognition: tokaData.enableNameRecognition ?? true,
                userNicknames: tokaData.userNicknames || {},
                admins: admins,
                currentUser: { isSuperAdmin: isSuperAdmin }
            },
            schedule: {
                remindersEnabled: scheduleData.remindersEnabled ?? false,
                reminderTime: scheduleData.reminderTime || '',
                googleSheetId: scheduleData.googleSheetId || '',
                reminderGuildId: scheduleData.reminderGuildId || '',
                reminderRoleId: scheduleData.reminderRoleId || '',
            }
        });
    } catch (error) { res.status(500).json({ message: 'サーバーエラー' }); }
});

adminRouter.post('/api/settings', verifyFirebaseToken, async (req, res) => {
    try {
        const { toka, schedule } = req.body;
        const batch = db.batch();
        const tokaDocRef = db.collection('bot_settings').doc('toka_profile');
        const scheduleDocRef = db.collection('bot_settings').doc('schedule_settings');
        
        if (toka) {
            const docSnap = await tokaDocRef.get();
            const currentAdmins = (docSnap.exists && Array.isArray(docSnap.data().admins)) ? docSnap.data().admins : [];
            const superAdminEmail = currentAdmins.length > 0 ? currentAdmins[0].email : null;
            const newAdminEmails = (toka.admins || []).map(a => a.email);
            const currentAdminEmails = currentAdmins.map(a => a.email);
            const adminsChanged = JSON.stringify([...currentAdminEmails].sort()) !== JSON.stringify([...newAdminEmails].sort());
            if (adminsChanged && superAdminEmail && req.user.email !== superAdminEmail) {
                return res.status(403).json({ message: 'エラー: 管理者リストの変更は最高管理者のみ許可されています。' });
            }
            let finalAdmins = toka.admins || [];
            if (!docSnap.exists || finalAdmins.length === 0) {
                finalAdmins = [{ name: req.user.displayName || '管理者', email: req.user.email }];
            }
            const tokaDataToSave = { ...toka, admins: finalAdmins, updatedBy: req.user.email, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
            batch.set(tokaDocRef, tokaDataToSave, { merge: true });
        }
        
        if (schedule) {
            const scheduleDataToSave = { ...schedule, updatedBy: req.user.email, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
            batch.set(scheduleDocRef, scheduleDataToSave, { merge: true });
        }

        await batch.commit();
        if (schedule) await setupReminderSchedule();
        
        res.status(200).json({ message: 'すべての設定を保存しました。' });
    } catch (error) {
        console.error('POST /api/settings エラー:', error);
        res.status(500).json({ message: '設定の保存中にサーバーエラーが発生しました。' });
    }
});

adminRouter.get('/api/schedule/items', verifyFirebaseToken, async (req, res) => {
    try {
        const settingsDoc = await db.collection('bot_settings').doc('schedule_settings').get();
        if (!settingsDoc.exists || !settingsDoc.data().googleSheetId) return res.status(404).json([]);
        
        const { googleSheetId } = settingsDoc.data();
        const sheetsClient = await getSheetsClient();
        const response = await sheetsClient.spreadsheets.values.get({ spreadsheetId: googleSheetId, range: 'シート1!A2:C' });
        res.status(200).json(response.data.values || []);
    } catch (error) {
        res.status(500).json({ message: 'スプレッドシートの予定読み込みに失敗しました。' });
    }
});

adminRouter.post('/api/schedule/items', verifyFirebaseToken, async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items)) return res.status(400).json({ message: '無効なデータ形式です。' });

        const settingsDoc = await db.collection('bot_settings').doc('schedule_settings').get();
        if (!settingsDoc.exists || !settingsDoc.data().googleSheetId) return res.status(400).json({ message: 'スプレッドシートが設定されていません。' });
        
        const { googleSheetId } = settingsDoc.data();
        const sheets = await getSheetsClient();
        const range = 'シート1!A2:C';

        await sheets.spreadsheets.values.clear({ spreadsheetId: googleSheetId, range });
        if (items.length > 0) {
            await sheets.spreadsheets.values.update({ spreadsheetId: googleSheetId, range, valueInputOption: 'USER_ENTERED', resource: { values: items } });
        }
        res.status(200).json({ message: '予定リストをスプレッドシートに保存しました。' });
    } catch (error) {
        res.status(500).json({ message: '予定リストの保存に失敗しました。' });
    }
});

adminRouter.post('/api/generate-invite-code', verifyFirebaseToken, async (req, res) => {
    try {
        const settingsDoc = await db.collection('bot_settings').doc('toka_profile').get();
        const admins = (settingsDoc.exists && Array.isArray(settingsDoc.data().admins)) ? settingsDoc.data().admins : [];
        const superAdminEmail = admins.length > 0 ? admins[0].email : null;
        if (!superAdminEmail || req.user.email !== superAdminEmail) return res.status(403).json({ message: '招待コードの発行は最高管理者のみ許可されています。' });
        
        const newCode = uuidv4().split('-')[0].toUpperCase();
        await db.collection('invitation_codes').doc(newCode).set({
            code: newCode, createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: req.user.email, used: false, usedBy: null, usedAt: null
        });
        res.status(201).json({ code: newCode });
    } catch (error) { res.status(500).json({ message: '招待コードの生成に失敗しました。' }); }
});

adminRouter.post('/api/register-with-invite', async (req, res) => {
    try {
        const { inviteCode, displayName, email, password } = req.body;
        if (!inviteCode || !displayName || !email || !password) return res.status(400).json({ message: 'すべての項目を入力してください。' });
        
        const inviteCodeRef = db.collection('invitation_codes').doc(inviteCode);
        const codeDoc = await inviteCodeRef.get();
        if (!codeDoc.exists || codeDoc.data().used) return res.status(400).json({ message: 'この招待コードは無効か、既に使用されています。' });
        
        const userRecord = await admin.auth().createUser({ email, password, displayName });
        const settingsRef = db.collection('bot_settings').doc('toka_profile');
        await db.runTransaction(async (transaction) => {
            const settingsDoc = await transaction.get(settingsRef);
            const admins = (settingsDoc.exists && Array.isArray(settingsDoc.data().admins)) ? settingsDoc.data().admins : [];
            admins.push({ name: displayName, email: email });
            transaction.set(settingsRef, { admins }, { merge: true });
        });
        await inviteCodeRef.update({ used: true, usedBy: email, usedAt: admin.firestore.FieldValue.serverTimestamp() });
        res.status(201).json({ message: `ようこそ、${displayName}さん！アカウントが正常に作成されました。ログインしてください。` });
    } catch (error) {
        if (error.code === 'auth/email-already-exists') return res.status(400).json({ message: 'このメールアドレスは既に使用されています。' });
        res.status(500).json({ message: 'アカウントの作成に失敗しました。' });
    }
});


app.use((req, res, next) => {
    if (req.hostname === process.env.ADMIN_DOMAIN) { adminRouter(req, res, next); } else { next(); }
});
app.listen(port, () => { console.log(`[情報] Webサーバーがポート ${port} で起動しました。`); });

client.once(Events.ClientReady, c => {
    console.log(`✅ ボット起動: ${c.user.tag}`);
    c.application.commands.set(client.commands.map(cmd => cmd.data.toJSON()));
    setupReminderSchedule();
});
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try { await command.execute(interaction); }
    catch (error) { console.error(`コマンドエラー (${interaction.commandName}):`, error); }
});
client.login(process.env.DISCORD_TOKEN);