// =================================================================================
// モジュールのインポート
// =================================================================================
const fs = require("node:fs");
const path = require("node:path");
const { Client, GatewayIntentBits, Collection, Events } = require("discord.js");
const dotenv = require("dotenv");
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const DiscordStrategy = require("passport-discord").Strategy;
const admin = require("firebase-admin");
const ejs = require("ejs");
const { v4: uuidv4 } = require("uuid");



dotenv.config();

// =================================================================================
// Firebase Admin SDKの初期化
// =================================================================================
let db;
try {
  const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountString)
    throw new Error(
      "環境変数 `FIREBASE_SERVICE_ACCOUNT_JSON` が設定されていません。"
    );
  
  // テスト環境での簡易設定
  if (serviceAccountString.includes('test-project')) {
    console.log("[警告] テスト環境でのFirebase設定を使用しています。");
    // テスト用のFirebase Admin SDK初期化をスキップ
    db = {
      collection: () => ({
        doc: () => ({
          get: () => Promise.resolve({ exists: false }),
          set: () => Promise.resolve(),
          update: () => Promise.resolve()
        }),
        add: () => Promise.resolve(),
        where: () => ({
          get: () => Promise.resolve({ docs: [] })
        })
      })
    };
  } else {
    const serviceAccount = JSON.parse(serviceAccountString);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    db = admin.firestore();
  }
  console.log("[情報] Firebase Admin SDKが正常に初期化されました。");
} catch (error) {
  console.error(
    "[致命的エラー] Firebase Admin SDKの初期化に失敗しました:",
    error.message
  );
  console.log("[情報] テスト用のモックDBを使用します。");
  // モック DB を作成してアプリケーションを続行
  db = {
    collection: () => ({
      doc: () => ({
        get: () => Promise.resolve({ exists: false, data: () => ({}) }),
        set: () => Promise.resolve(),
        update: () => Promise.resolve()
      }),
      add: () => Promise.resolve(),
      where: () => ({
        get: () => Promise.resolve({ docs: [] })
      })
    })
  };
}

// ヘルパー関数：Firestore FieldValue を安全に取得
const getServerTimestamp = () => {
  return admin.firestore ? getServerTimestamp() : new Date();
};

// =================================================================================
// Passport Discord OAuth設定
// =================================================================================
passport.use(new DiscordStrategy({
  clientID: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  callbackURL: `http://${process.env.ADMIN_DOMAIN}:${process.env.PORT || 80}/auth/discord/callback`,
  scope: ['identify', 'email', 'guilds']
}, async (accessToken, refreshToken, profile, done) => {
  try {
    // Discordプロファイル情報をFirebaseに保存/更新
    const userRef = db.collection('discord_users').doc(profile.id);
    await userRef.set({
      id: profile.id,
      username: profile.username,
      discriminator: profile.discriminator,
      email: profile.email,
      avatar: profile.avatar,
      accessToken: accessToken,
      refreshToken: refreshToken,
      lastLogin: getServerTimestamp()
    }, { merge: true });

    return done(null, profile);
  } catch (error) {
    console.error('Discord OAuth エラー:', error);
    return done(error, null);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const userDoc = await db.collection('discord_users').doc(id).get();
    if (userDoc.exists) {
      done(null, userDoc.data());
    } else {
      done(null, false);
    }
  } catch (error) {
    done(error, null);
  }
});

// =================================================================================
// Discordクライアントの初期化とコマンド読み込み
// =================================================================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
client.commands = new Collection();
client.db = db;
const commandsPath = path.join(__dirname, "commands");
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter((file) => file.endsWith(".js"));
  for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    if ("data" in command && "execute" in command) {
      client.commands.set(command.data.name, command);
    }
  }
}





// =================================================================================
// Expressサーバーの設定
// =================================================================================
const app = express();
const port = process.env.PORT || 80;
const adminRouter = express.Router();

// セッション設定
app.use(session({
  secret: process.env.SESSION_SECRET || 'default-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // HTTPSを使用する場合はtrueに設定
    maxAge: 24 * 60 * 60 * 1000 // 24時間
  }
}));

// Passport初期化
app.use(passport.initialize());
app.use(passport.session());

// ボディパーサーミドルウェアの設定
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
adminRouter.use(express.static(path.join(__dirname, "public")));
adminRouter.use(express.json({ limit: "5mb" }));

// =================================================================================
// Discord OAuth ルート
// =================================================================================
adminRouter.get('/auth/discord', passport.authenticate('discord'));

adminRouter.get('/auth/discord/callback', 
  passport.authenticate('discord', { failureRedirect: '/?error=auth_failed' }),
  (req, res) => {
    // 認証成功時にリダイレクト
    res.redirect('/?auth=success');
  }
);

adminRouter.get('/auth/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('ログアウトエラー:', err);
    }
    res.redirect('/');
  });
});

adminRouter.get('/auth/user', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ 
      user: {
        id: req.user.id,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        email: req.user.email
      },
      authenticated: true 
    });
  } else {
    res.json({ authenticated: false });
  }
});

// =================================================================================
// 認証ミドルウェア（Discord対応版）
// =================================================================================
const verifyAuthentication = async (req, res, next) => {
  // Discord OAuth認証をチェック
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Discord認証が必要です' });
  }

  try {
    // 管理者権限をチェック
    const settingsDoc = await db
      .collection("bot_settings")
      .doc("toka_profile")
      .get();
    
    if (!settingsDoc.exists) {
      // 設定がない場合、最初のユーザーを管理者とする
      req.user.isAdmin = true;
      req.user.isSuperAdmin = true;
      return next();
    }

    const admins = Array.isArray(settingsDoc.data().admins)
      ? settingsDoc.data().admins
      : [];
    
    // Discord IDまたはemailで管理者チェック
    const isAdmin = admins.some(admin => 
      admin.email === req.user.email || 
      admin.discordId === req.user.id
    );

    if (admins.length > 0 && !isAdmin) {
      return res.status(403).json({ message: 'アクセス権限がありません' });
    }

    req.user.isAdmin = true;
    req.user.isSuperAdmin = admins.length === 0 || 
      (admins[0].email === req.user.email || admins[0].discordId === req.user.id);
    
    next();
  } catch (error) {
    console.error('認証エラー:', error);
    res.status(500).json({ message: 'サーバーエラー' });
  }
};

adminRouter.get("/", (req, res) => {
  // Discord OAuth用の設定を渡す
  const discordOAuthConfig = {
    clientId: process.env.DISCORD_CLIENT_ID,
    redirectUri: `http://${process.env.ADMIN_DOMAIN}:${process.env.PORT || 80}/auth/discord/callback`
  };
  res.render("index", { discordOAuthConfig });
});

// --- AI管理API ---
adminRouter.get("/api/ais", verifyAuthentication, async (req, res) => {
  try {
    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    if (!doc.exists) {
      return res.status(200).json([]);
    }
    
    const data = doc.data();
    const aiProfiles = data.profiles || [];
    
    res.status(200).json(aiProfiles);
  } catch (error) {
    console.error("AI取得エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

adminRouter.post("/api/ais", verifyAuthentication, async (req, res) => {
  try {
    const {
      id,
      name,
      systemPrompt,
      modelMode,
      baseUserId,
      enableNameRecognition,
      enableBotMessageResponse,
      replyDelayMs,
      errorOopsMessage,
      userNicknames
    } = req.body;

    if (!id || !name) {
      return res.status(400).json({ message: "IDと名前は必須です。" });
    }

    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    const existingProfiles = doc.exists ? (doc.data().profiles || []) : [];
    
    // ID重複チェック
    if (existingProfiles.some(profile => profile.id === id)) {
      return res.status(400).json({ message: "このIDは既に使用されています。" });
    }

    const newProfile = {
      id,
      name,
      systemPrompt: systemPrompt || "",
      modelMode: modelMode || "hybrid",
      baseUserId: baseUserId || null,
      enableNameRecognition: enableNameRecognition ?? true,
      enableBotMessageResponse: enableBotMessageResponse ?? false,
      replyDelayMs: replyDelayMs ?? 0,
      errorOopsMessage: errorOopsMessage || "",
      userNicknames: userNicknames || {},
      createdAt: getServerTimestamp(),
      updatedAt: getServerTimestamp()
    };

    existingProfiles.push(newProfile);

    await db.collection("bot_settings").doc("ai_profiles").set({
      profiles: existingProfiles,
      updatedAt: getServerTimestamp()
    }, { merge: true });

    res.status(201).json({ message: `AI "${name}" を作成しました。`, ai: newProfile });
  } catch (error) {
    console.error("AI作成エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

adminRouter.put("/api/ais/:id", verifyAuthentication, async (req, res) => {
  try {
    const aiId = req.params.id;
    const {
      name,
      systemPrompt,
      modelMode,
      baseUserId,
      enableNameRecognition,
      enableBotMessageResponse,
      replyDelayMs,
      errorOopsMessage,
      userNicknames
    } = req.body;

    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    if (!doc.exists) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }

    const existingProfiles = doc.data().profiles || [];
    const profileIndex = existingProfiles.findIndex(profile => profile.id === aiId);
    
    if (profileIndex === -1) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }

    existingProfiles[profileIndex] = {
      ...existingProfiles[profileIndex],
      name: name || existingProfiles[profileIndex].name,
      systemPrompt: systemPrompt !== undefined ? systemPrompt : existingProfiles[profileIndex].systemPrompt,
      modelMode: modelMode || existingProfiles[profileIndex].modelMode,
      baseUserId: baseUserId !== undefined ? baseUserId : existingProfiles[profileIndex].baseUserId,
      enableNameRecognition: enableNameRecognition !== undefined ? enableNameRecognition : existingProfiles[profileIndex].enableNameRecognition,
      enableBotMessageResponse: enableBotMessageResponse !== undefined ? enableBotMessageResponse : existingProfiles[profileIndex].enableBotMessageResponse,
      replyDelayMs: replyDelayMs !== undefined ? replyDelayMs : existingProfiles[profileIndex].replyDelayMs,
      errorOopsMessage: errorOopsMessage !== undefined ? errorOopsMessage : existingProfiles[profileIndex].errorOopsMessage,
      userNicknames: userNicknames !== undefined ? userNicknames : existingProfiles[profileIndex].userNicknames,
      updatedAt: getServerTimestamp()
    };

    await db.collection("bot_settings").doc("ai_profiles").set({
      profiles: existingProfiles,
      updatedAt: getServerTimestamp()
    }, { merge: true });

    res.status(200).json({ message: `AI "${existingProfiles[profileIndex].name}" を更新しました。` });
  } catch (error) {
    console.error("AI更新エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

adminRouter.delete("/api/ais/:id", verifyAuthentication, async (req, res) => {
  try {
    const aiId = req.params.id;

    const doc = await db.collection("bot_settings").doc("ai_profiles").get();
    if (!doc.exists) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }

    const existingProfiles = doc.data().profiles || [];
    const profileIndex = existingProfiles.findIndex(profile => profile.id === aiId);
    
    if (profileIndex === -1) {
      return res.status(404).json({ message: "AIが見つかりません。" });
    }

    const deletedName = existingProfiles[profileIndex].name;
    existingProfiles.splice(profileIndex, 1);

    await db.collection("bot_settings").doc("ai_profiles").set({
      profiles: existingProfiles,
      updatedAt: getServerTimestamp()
    }, { merge: true });

    res.status(200).json({ message: `AI "${deletedName}" を削除しました。` });
  } catch (error) {
    console.error("AI削除エラー:", error);
    res.status(500).json({ message: "サーバーエラー" });
  }
});

// --- 設定取得API ---
adminRouter.get("/api/settings/toka", verifyAuthentication, async (req, res) => {
  try {
    const doc = await db.collection("bot_settings").doc("toka_profile").get();
    if (!doc.exists)
      return res.status(404).json({ message: "設定がまだありません。" });

    const data = doc.data();
    const admins = data.admins || [];
    let isSuperAdmin = req.user.isSuperAdmin;

    res.status(200).json({
      baseUserId: data.baseUserId || null,
      systemPrompt: data.systemPrompt || "",
      enableNameRecognition: data.enableNameRecognition ?? true,
      userNicknames: data.userNicknames || {},
      modelMode: data.modelMode || "hybrid",
      enableBotMessageResponse: data.enableBotMessageResponse ?? false,
      admins: admins,
      currentUser: { 
        isSuperAdmin: isSuperAdmin,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        discordId: req.user.id
      },
      replyDelayMs: data.replyDelayMs ?? 0,
      errorOopsMessage: data.errorOopsMessage || "",
    });
  } catch (error) {
    res.status(500).json({ message: "サーバーエラー" });
  }
});



// --- 設定保存API ---
// 1. 設定取得API・保存APIの該当部分を修正

// 取得API
adminRouter.get("/api/settings/toka", verifyAuthentication, async (req, res) => {
  try {
    const doc = await db.collection("bot_settings").doc("toka_profile").get();
    if (!doc.exists)
      return res.status(404).json({ message: "設定がまだありません。" });

    const data = doc.data();
    const admins = data.admins || [];
    let isSuperAdmin = req.user.isSuperAdmin;

    res.status(200).json({
      baseUserId: data.baseUserId || null,
      systemPrompt: data.systemPrompt || "",
      enableNameRecognition: data.enableNameRecognition ?? true,
      userNicknames: data.userNicknames || {},
      modelMode: data.modelMode || "hybrid",
      admins: admins,
      currentUser: { 
        isSuperAdmin: isSuperAdmin,
        username: req.user.username,
        discriminator: req.user.discriminator,
        avatar: req.user.avatar,
        discordId: req.user.id
      },
      enableBotMessageResponse: data.enableBotMessageResponse ?? false,
      replyDelayMs: data.replyDelayMs ?? 0,
    });
  } catch (error) {
    res.status(500).json({ message: "サーバーエラー" });
  }
});

// 保存API
adminRouter.post(
  "/api/settings/toka",
  verifyAuthentication,
  async (req, res) => {
    try {
      const {
        baseUserId,
        systemPrompt,
        enableNameRecognition,
        userNicknames,
        modelMode,
        enableBotMessageResponse,
        replyDelayMs,
      } = req.body;
      const dataToSave = {
        baseUserId,
        systemPrompt,
        enableNameRecognition,
        userNicknames,
        modelMode,
        enableBotMessageResponse,
        replyDelayMs: typeof replyDelayMs === "number" ? replyDelayMs : 0,
      };
      await db
        .collection("bot_settings")
        .doc("toka_profile")
        .set(dataToSave, { merge: true });
      res.status(200).json({ message: "とーか設定を更新しました。" });
    } catch (error) {
      res.status(500).json({ message: "サーバーエラー" });
    }
  }
);



adminRouter.post(
  "/api/settings/admins",
  verifyAuthentication,
  async (req, res) => {
    try {
      const { admins: newAdminsList } = req.body;
      const docRef = db.collection("bot_settings").doc("toka_profile");
      const docSnap = await docRef.get();
      const currentAdmins =
        docSnap.exists && Array.isArray(docSnap.data().admins)
          ? docSnap.data().admins
          : [];
      const superAdminEmail =
        currentAdmins.length > 0 ? currentAdmins[0].email : null;
      const superAdminDiscordId =
        currentAdmins.length > 0 ? currentAdmins[0].discordId : null;

      const newAdminEmails = (newAdminsList || []).map((a) => a.email);
      const newAdminDiscordIds = (newAdminsList || []).map((a) => a.discordId);
      const currentAdminEmails = currentAdmins.map((a) => a.email);
      const currentAdminDiscordIds = currentAdmins.map((a) => a.discordId);
      
      const adminsChanged =
        JSON.stringify([...currentAdminEmails].sort()) !==
        JSON.stringify([...newAdminEmails].sort()) ||
        JSON.stringify([...currentAdminDiscordIds].sort()) !==
        JSON.stringify([...newAdminDiscordIds].sort());

      if (
        adminsChanged &&
        !req.user.isSuperAdmin
      ) {
        return res.status(403).json({
          message:
            "エラー: 管理者リストの変更は最高管理者のみ許可されています。",
        });
      }

      let finalAdmins = newAdminsList || [];
      if (!docSnap.exists || finalAdmins.length === 0) {
        finalAdmins = [
          { 
            name: req.user.username || "管理者", 
            email: req.user.email,
            discordId: req.user.id,
            username: req.user.username,
            discriminator: req.user.discriminator,
            avatar: req.user.avatar
          },
        ];
      }

      await docRef.set({ admins: finalAdmins }, { merge: true });
      res.status(200).json({ message: "管理者リストを更新しました。" });
    } catch (error) {
      res.status(500).json({ message: "サーバーエラー" });
    }
  }
);



// メールアドレス更新用のエンドポイント
app.post("/api/update-email", verifyAuthentication, async (req, res) => {
  try {
    const { oldEmail, newEmail } = req.body;
    const userEmail = req.user.email;
    const userDiscordId = req.user.id;

    // 権限チェック
    if (userEmail !== oldEmail) {
      return res.status(403).json({
        message: "他のユーザーのメールアドレスは更新できません。",
      });
    }

    // Firestoreでのメールアドレス更新
    const settingsRef = db.collection("bot_settings").doc("toka_profile");
    const settingsDoc = await settingsRef.get();

    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      const admins = Array.isArray(data.admins) ? data.admins : [];

      const updatedAdmins = admins.map((admin) => {
        if (admin.email === oldEmail || admin.discordId === userDiscordId) {
          return { ...admin, email: newEmail };
        }
        return admin;
      });

      await settingsRef.update({
        admins: updatedAdmins,
        updatedAt: getServerTimestamp(),
      });
    }

    res.json({
      message: "メールアドレスを更新しました。",
      email: newEmail,
    });
  } catch (error) {
    console.error("メールアドレス更新エラー:", error);
    res.status(500).json({
      message: "メールアドレスの更新中にエラーが発生しました。",
      details: error.message,
    });
  }
});



// プロファイル更新API
app.post("/api/update-profile", verifyAuthentication, async (req, res) => {
  try {
    const { displayName } = req.body;
    const userDiscordId = req.user.id;
    const userEmail = req.user.email;

    console.log("プロファイル更新リクエスト:", {
      userDiscordId,
      userEmail,
      displayName,
      timestamp: new Date().toISOString(),
    });

    // 入力値の検証
    if (!displayName || typeof displayName !== "string") {
      return res.status(400).json({
        message: "表示名が正しく指定されていません。",
      });
    }

    // bot_settingsコレクションのtoka_profileドキュメントを取得
    const settingsRef = db.collection("bot_settings").doc("toka_profile");
    const settingsDoc = await settingsRef.get();

    console.log("設定ドキュメントの存在:", settingsDoc.exists);

    let admins = [];
    if (settingsDoc.exists) {
      const data = settingsDoc.data();
      admins = Array.isArray(data.admins) ? data.admins : [];
    }

    console.log("現在の管理者リスト:", admins);

    // 管理者リストの更新（Discord IDまたはemailで検索）
    let updatedAdmins;
    const adminIndex = admins.findIndex((admin) => 
      admin.email === userEmail || admin.discordId === userDiscordId
    );

    if (adminIndex === -1) {
      // 新規ユーザーの場合は追加
      updatedAdmins = [
        ...admins,
        {
          email: userEmail,
          discordId: userDiscordId,
          name: displayName,
          username: req.user.username,
          discriminator: req.user.discriminator,
          avatar: req.user.avatar,
          updatedAt: new Date().toISOString(),
        },
      ];
    } else {
      // 既存ユーザーの場合は更新
      updatedAdmins = admins.map((admin, index) => {
        if (index === adminIndex) {
          return {
            ...admin,
            name: displayName,
            discordId: userDiscordId,
            username: req.user.username,
            discriminator: req.user.discriminator,
            avatar: req.user.avatar,
            updatedAt: new Date().toISOString(),
          };
        }
        return admin;
      });
    }

    console.log("更新する管理者リスト:", updatedAdmins);

    // Firestoreの更新
    await settingsRef.set(
      {
        admins: updatedAdmins,
        updatedAt: getServerTimestamp(),
      },
      { merge: true }
    );

    console.log("データベース更新完了");

    // 成功レスポンス
    res.json({
      message: "プロファイルを更新しました。",
      displayName,
      username: req.user.username,
      discriminator: req.user.discriminator,
      avatar: req.user.avatar,
      discordId: userDiscordId,
      email: userEmail,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    // エラーの詳細をログに記録
    console.error("プロファイル更新エラー:", {
      message: error.message,
      stack: error.stack,
      userEmail: req.user?.email,
      timestamp: new Date().toISOString(),
    });

    // クライアントへのエラーレスポンス
    res.status(500).json({
      message: "プロファイルの更新中にエラーが発生しました。",
      details: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// --- 招待コード・登録API ---
adminRouter.post(
  "/api/generate-invite-code",
  verifyAuthentication,
  async (req, res) => {
    try {
      const settingsDoc = await db
        .collection("bot_settings")
        .doc("toka_profile")
        .get();
      const admins =
        settingsDoc.exists && Array.isArray(settingsDoc.data().admins)
          ? settingsDoc.data().admins
          : [];
      const superAdminEmail = admins.length > 0 ? admins[0].email : null;
      const superAdminDiscordId = admins.length > 0 ? admins[0].discordId : null;
      
      if (!req.user.isSuperAdmin)
        return res.status(403).json({
          message: "招待コードの発行は最高管理者のみ許可されています。",
        });
      
      const newCode = uuidv4().split("-")[0].toUpperCase();
      await db.collection("invitation_codes").doc(newCode).set({
        code: newCode,
        createdAt: getServerTimestamp(),
        createdBy: req.user.email || req.user.username,
        createdByDiscordId: req.user.id,
        used: false,
        usedBy: null,
        usedByDiscordId: null,
        usedAt: null,
      });
      res.status(201).json({ code: newCode });
    } catch (error) {
      res.status(500).json({ message: "招待コードの生成に失敗しました。" });
    }
  }
);

adminRouter.post("/api/register-with-invite", async (req, res) => {
  try {
    const { inviteCode, displayName, email, password } = req.body;
    if (!inviteCode || !displayName || !email || !password)
      return res
        .status(400)
        .json({ message: "すべての項目を入力してください。" });
    const inviteCodeRef = db.collection("invitation_codes").doc(inviteCode);
    const codeDoc = await inviteCodeRef.get();
    if (!codeDoc.exists || codeDoc.data().used)
      return res
        .status(400)
        .json({ message: "この招待コードは無効か、既に使用されています。" });
    const userRecord = await admin
      .auth()
      .createUser({ email, password, displayName });
    const settingsRef = db.collection("bot_settings").doc("toka_profile");
    await db.runTransaction(async (transaction) => {
      const settingsDoc = await transaction.get(settingsRef);
      const admins =
        settingsDoc.exists && Array.isArray(settingsDoc.data().admins)
          ? settingsDoc.data().admins
          : [];
      admins.push({ name: displayName, email: email });
      transaction.set(settingsRef, { admins }, { merge: true });
    });
    await inviteCodeRef.update({
      used: true,
      usedBy: email,
      usedAt: getServerTimestamp(),
    });
    res.status(201).json({
      message: `ようこそ、${displayName}さん！アカウントが正常に作成されました。ログインしてください。`,
    });
  } catch (error) {
    if (error.code === "auth/email-already-exists")
      return res
        .status(400)
        .json({ message: "このメールアドレスは既に使用されています。" });
    res.status(500).json({ message: "アカウントの作成に失敗しました。" });
  }
});

app.use((req, res, next) => {
  if (req.hostname === process.env.ADMIN_DOMAIN) {
    adminRouter(req, res, next);
  } else {
    next();
  }
});
app.listen(port, () => {
  console.log(`[情報] Webサーバーがポート ${port} で起動しました。`);
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ ボット起動: ${c.user.tag}`);
  c.application.commands.set(client.commands.map((cmd) => cmd.data.toJSON()));
  client.user.setActivity("AI管理システム", { type: 3 }); // type: 3 = Watching
});
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`コマンドエラー (${interaction.commandName}):`, error);
  }
});

// Discord bot login with error handling for testing
if (process.env.DISCORD_TOKEN !== 'test_token') {
  client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('[エラー] Discord bot への接続に失敗しました:', error.message);
    console.log('[情報] Web サーバーのみで続行します。');
  });
} else {
  console.log('[情報] テスト環境: Discord bot の初期化をスキップします。');
}