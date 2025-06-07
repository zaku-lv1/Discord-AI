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
// Firebase Admin SDKの初期化
// =================================================================================
// 環境変数からFirebaseの認証情報を読み込むか、キーファイルから読み込む
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
} else {
    const keyFilePath = path.join(__dirname, 'firebase-key.json');
    if (!fs.existsSync(keyFilePath)) {
        console.error('[致命的エラー] `firebase-key.json` が見つかりません。セットアップ手順を確認してください。');
        process.exit(1);
    }
    serviceAccount = require(keyFilePath);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Firestoreのインスタンスを取得
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

// コマンドやDBインスタンスをclientオブジェクトからアクセスできるようにする
client.commands = new Collection();
client.db = db;

// =================================================================================
// コマンドの読み込み
// =================================================================================
const commandsPath = path.join(__dirname, 'commands');
// `commands`ディレクトリが存在するか確認
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
    console.log('[警告] `commands` ディレクトリが見つかりません。コマンドは読み込まれません。');
}


// =================================================================================
// Expressサーバーの設定
// =================================================================================
const app = express();
const port = process.env.PORT || 3000;

// :code パラメータを含むURLへのGETリクエストを処理する
app.get('/:code', async (req, res) => {
    const { code } = req.params;

    // パラメータが意図しないリクエスト(例: favicon.ico)の場合は無視する
    if (code.length < 10) { // コードは32文字なので、短いものは弾く
        return res.status(404).send('Not Found');
    }

    try {
        const docRef = db.collection('images').doc(code);
        const doc = await docRef.get();

        if (doc.exists) {
            const imageData = doc.data();
            const imageResponse = await axios.get(imageData.url, {
                responseType: 'arraybuffer'
            });
            res.set('Content-Type', imageData.contentType);
            res.send(imageResponse.data);
        } else {
            res.status(404).send('画像が見つかりません。');
        }
    } catch (error) {
        console.error(`[Firestoreエラー] 画像の取得に失敗 (Code: ${code}):`, error);
        res.status(500).send('データベースへのアクセス中にエラーが発生しました。');
    }
});

// Expressサーバーを起動
app.listen(port, () => {
    console.log(`[情報] Webサーバーがポート ${port} で起動しました。`);
});


// =================================================================================
// Discordイベントハンドラ
// =================================================================================
client.once(Events.ClientReady, async c => {
    console.log('----------------------------------------------------');
    console.log(`✅ ボットが起動しました。ログインユーザー: ${c.user.tag}`);
    console.log('----------------------------------------------------');

    // スラッシュコマンドをDiscordに登録
    const data = client.commands.map(command => command.data.toJSON());
    try {
        await c.application.commands.set(data);
        console.log('[情報] スラッシュコマンドが正常にDiscordに登録されました。');
    } catch (error) {
        console.error('[致命的エラー] スラッシュコマンドの登録中にエラーが発生しました:', error);
    }
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`コマンド "${interaction.commandName}" が見つかりません。`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error(`コマンド実行エラー (${interaction.commandName}):`, error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'コマンド実行中にエラーが発生しました。', ephemeral: true });
        } else {
            await interaction.reply({ content: 'コマンド実行中にエラーが発生しました。', ephemeral: true });
        }
    }
});

// =================================================================================
// Discordへのログイン
// =================================================================================
if (!process.env.DISCORD_TOKEN) {
    console.error('[致命的エラー] 環境変数 `DISCORD_TOKEN` が設定されていません。');
    process.exit(1);
}
client.login(process.env.DISCORD_TOKEN);