document.addEventListener("DOMContentLoaded", () => {
  // ================ Firebase初期化 ================
  firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();

  // ================ DOM要素の参照 ================
  // --- 共通要素 ---
  const loaderContainer = document.getElementById("loader-container");
  const pageContainer = document.querySelector(".container");
  const authContainer = document.getElementById("auth-container");
  const mainContent = document.getElementById("main-content");
  const statusMessage = document.getElementById("status-message");
  const saveAllBtn = document.getElementById("save-all-btn");

  // --- 認証関連要素 ---
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginBtn = document.getElementById("login-btn");
  const registerBtn = document.getElementById("register-btn");
  const forgotPasswordLink = document.getElementById("forgot-password-link");
  const showRegisterFormLink = document.getElementById(
    "show-register-form-link"
  );
  const showLoginFormLink = document.getElementById("show-login-form-link");
  const userEmailEl = document.getElementById("user-email");
  const logoutBtn = document.getElementById("logout-btn");

  // --- ナビゲーション要素 ---
  const navLinks = document.querySelectorAll(".nav-link");
  const panels = document.querySelectorAll(".dashboard-panel");
  const adminNavItem = document.getElementById("nav-item-admin");

  // --- プロファイル要素 ---
  const profilePanel = document.getElementById("panel-profile");
  const profileDisplayNameInput = document.getElementById(
    "profile-display-name"
  );
  const profileEmailInput = document.getElementById("profile-email");
  const saveProfileBtn = document.getElementById("save-profile-btn");

  // --- とーかパネル要素 ---
  const tokaModelModeSelect = document.getElementById("toka-model-mode");
  const baseUserIdInput = document.getElementById("base-user-id-input");
  const promptTextarea = document.getElementById("prompt-textarea");
  const nameRecognitionCheckbox = document.getElementById(
    "name-recognition-checkbox"
  );
  const botMessageResponseCheckbox = document.getElementById(
    "bot-message-response-checkbox"
  );
  const replyDelayMsInput = document.getElementById("reply-delay-ms-input");
  const errorOopsMessageInput = document.getElementById(
    "error-oops-message-input"
  );
  const nicknamesListContainer = document.getElementById(
    "nicknames-list-container"
  );
  const addNicknameBtn = document.getElementById("add-nickname-btn");
  const saveTokaBtn = document.getElementById("save-toka-btn");

  // --- スケジュールパネル要素 ---
  const remindersEnabledCheckbox = document.getElementById(
    "reminders-enabled-checkbox"
  );
  const reminderTimeInput = document.getElementById("reminder-time-input");
  const googleSheetIdInput = document.getElementById("google-sheet-id-input");
  const reminderGuildIdInput = document.getElementById(
    "reminder-guild-id-input"
  );
  const reminderRoleIdInput = document.getElementById("reminder-role-id-input");
  const saveScheduleSettingsBtn = document.getElementById(
    "save-schedule-settings-btn"
  );
  const scheduleItemsContainer = document.getElementById(
    "schedule-items-container"
  );
  const addScheduleItemBtn = document.getElementById("add-schedule-item-btn");
  const saveScheduleItemsBtn = document.getElementById(
    "save-schedule-items-btn"
  );

  // --- 管理者パネル要素 ---
  const adminSettingsSection = document.getElementById("panel-admins");
  const inviteCodeGeneratorSection = document.getElementById(
    "invite-code-generator-section"
  );
  const generateInviteCodeBtn = document.getElementById(
    "generate-invite-code-btn"
  );
  const inviteCodeDisplay = document.getElementById("invite-code-display");
  const newInviteCodeInput = document.getElementById("new-invite-code");
  const copyInviteCodeBtn = document.getElementById("copy-invite-code-btn");
  const adminsListContainer = document.getElementById("admins-list-container");
  const addAdminBtn = document.getElementById("add-admin-btn");
  const saveAdminsBtn = document.getElementById("save-admins-btn");

  // --- AI管理パネル要素 ---
  const aiPanel = document.getElementById("panel-ai");
  const aiList = document.getElementById("ai-list");
  const addAIBtn = document.getElementById("add-ai-btn");
  const aiCardTemplate = document.getElementById("ai-card-template");

  // ================ アプリケーションの状態 ================
  let state = {
    admins: [],
    isSuperAdmin: false,
    scheduleItems: [],
    aiCharacters: [],
  };
  // ================ UI関連の関数 ================
  function renderNicknameList(nicknames = {}) {
    nicknamesListContainer.innerHTML = "";
    Object.entries(nicknames).forEach(([id, name]) =>
      createNicknameEntry(id, name)
    );
  }

  function createNicknameEntry(id = "", name = "") {
    const entryDiv = document.createElement("div");
    entryDiv.className = "nickname-entry";
    entryDiv.innerHTML = `
            <input type="text" class="nickname-id" placeholder="ユーザーID" value="${id}">
            <input type="text" class="nickname-name" placeholder="ニックネーム" value="${name}">
            <button type="button" class="delete-btn">削除</button>
        `;
    nicknamesListContainer.appendChild(entryDiv);
  }

  function renderAdminList() {
    adminsListContainer.innerHTML = "";
    (state.admins || []).forEach((admin, index) => {
      const entryDiv = document.createElement("div");
      entryDiv.className = "admin-entry";
      entryDiv.setAttribute("draggable", state.isSuperAdmin);
      entryDiv.dataset.index = index;

      let html = `
                <input type="text" class="admin-name" data-field="name" 
                       placeholder="表示名" value="${admin.name || ""}">
                <input type="email" class="admin-email" data-field="email" 
                       placeholder="管理者メールアドレス" value="${
                         admin.email || ""
                       }">
            `;

      if (index === 0) {
        entryDiv.classList.add("super-admin");
        html += '<span class="super-admin-label">👑</span>';
      }

      html += '<button type="button" class="delete-btn">削除</button>';
      entryDiv.innerHTML = html;
      adminsListContainer.appendChild(entryDiv);
    });
  }

  function renderScheduleList() {
    scheduleItemsContainer.innerHTML = "";
    state.scheduleItems.forEach((item, index) => {
      const entryDiv = document.createElement("div");
      entryDiv.className = "schedule-item-entry";
      entryDiv.dataset.index = index;
      entryDiv.innerHTML = `
                <input type="text" class="item-type" data-field="0" 
                       placeholder="種別" value="${item[0] || ""}">
                <input type="text" class="item-task" data-field="1" 
                       placeholder="内容" value="${item[1] || ""}">
                <input type="text" class="item-due" data-field="2" 
                       placeholder="期限" value="${item[2] || ""}">
                <button type="button" class="delete-btn">削除</button>
            `;
      scheduleItemsContainer.appendChild(entryDiv);
    });
  }

  // --- AI管理関連の関数 ---
  function getAICardElements(card) {
    return {
      nameDisplay: card.querySelector(".ai-name"),
      commandDisplay: card.querySelector(".ai-command"),
      activeToggle: card.querySelector(".ai-active-toggle"),
      editBtn: card.querySelector(".edit-ai-btn"),
      deleteBtn: card.querySelector(".delete-ai-btn"),
      editForm: card.querySelector(".ai-edit-form"),
      displayNameInput: card.querySelector(".ai-display-name"),
      baseUserIdInput: card.querySelector(".ai-base-user-id"),
      modelModeSelect: card.querySelector(".ai-model-mode"),
      nameRecognitionCheckbox: card.querySelector(".ai-name-recognition"),
      systemPromptTextarea: card.querySelector(".ai-system-prompt"),
      botResponseCheckbox: card.querySelector(".ai-bot-response"),
      replyDelayInput: card.querySelector(".ai-reply-delay"),
      errorMessageInput: card.querySelector(".ai-error-message"),
      nicknamesList: card.querySelector(".ai-nicknames-list"),
      addNicknameBtn: card.querySelector(".add-nickname-btn"),
      saveBtn: card.querySelector(".save-ai-btn"),
      cancelBtn: card.querySelector(".cancel-ai-btn"),
    };
  }

  // AIキャラクターの変更を追跡する関数を追加
  function markAICharacterAsModified(aiId) {
    const character = state.aiCharacters.find((char) => char.id === aiId);
    if (character) {
      character.modified = true;
    }
  }

  function renderAICharactersList() {
    aiList.innerHTML = "";
    state.aiCharacters.forEach((character) => {
      const card = aiCardTemplate.content.cloneNode(true);
      const cardElement = card.querySelector(".ai-card");
      const elements = getAICardElements(cardElement);

      cardElement.dataset.aiId = character.id;
      elements.nameDisplay.textContent = character.name || "新規AIキャラクター";
      elements.commandDisplay.textContent = `/${
        character.commandName || "未設定"
      }`;
      elements.activeToggle.checked = character.active;

      elements.displayNameInput.value = character.name || "";
      elements.baseUserIdInput.value = character.baseUserId || "";
      elements.modelModeSelect.value = character.modelMode || "hybrid";
      elements.nameRecognitionCheckbox.checked =
        character.enableNameRecognition ?? true;
      elements.systemPromptTextarea.value = character.systemPrompt || "";
      elements.botResponseCheckbox.checked =
        character.enableBotMessageResponse ?? false;
      elements.replyDelayInput.value = character.replyDelayMs || 0;
      elements.errorMessageInput.value = character.errorOopsMessage || "";

      renderAICharacterNicknames(
        elements.nicknamesList,
        character.userNicknames || {}
      );

      aiList.appendChild(cardElement);
    });
  }

  function renderAICharacterNicknames(container, nicknames) {
    container.innerHTML = "";
    Object.entries(nicknames).forEach(([userId, nickname]) => {
      const entry = createNicknameEntry(userId, nickname);
      container.appendChild(entry);
    });
  }

  function addNicknameToAICharacter(container, aiId) {
    const entry = createNicknameEntry("", "");
    container.appendChild(entry);
    markAICharacterAsModified(aiId);
  }

  function toggleAIEditForm(card) {
    const elements = getAICardElements(card);
    const isVisible = elements.editForm.style.display !== "none";
    elements.editForm.style.display = isVisible ? "none" : "block";
  }

  // ================ データ取得と保存の関数 ================
  async function fetchSettings(user) {
    statusMessage.textContent = "読込中...";
    const token = await user.getIdToken();
    let finalStatusMessage = "設定を読み込みました。";

    try {
      const tokaRes = await fetch("/api/settings/toka", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (tokaRes.status === 403 || tokaRes.status === 401) {
        throw new Error("アクセスが拒否されました。");
      }

      if (tokaRes.ok) {
        const data = await tokaRes.json();
        tokaModelModeSelect.value = data.modelMode || "hybrid";
        baseUserIdInput.value = data.baseUserId || "";
        promptTextarea.value = data.systemPrompt || "";
        nameRecognitionCheckbox.checked = data.enableNameRecognition ?? true;
        botMessageResponseCheckbox.checked = !!data.enableBotMessageResponse;
        renderNicknameList(data.userNicknames || {});
        replyDelayMsInput.value = data.replyDelayMs ?? 0;
        errorOopsMessageInput.value = data.errorOopsMessage || "";

        const currentUserAdminInfo = (data.admins || []).find(
          (admin) => admin.email === user.email
        );

        if (currentUserAdminInfo) {
          profileDisplayNameInput.value = currentUserAdminInfo.name || "";
          profileEmailInput.value = user.email || "";
        }

        userEmailEl.textContent =
          currentUserAdminInfo && currentUserAdminInfo.name
            ? currentUserAdminInfo.name
            : user.email;

        state.admins = data.admins || [];
        state.isSuperAdmin = data.currentUser && data.currentUser.isSuperAdmin;
        adminNavItem.style.display = "block";
        renderAdminList();

        if (!state.isSuperAdmin) {
          document
            .querySelectorAll("#panel-admins input, #panel-admins button")
            .forEach((el) => (el.disabled = true));
          inviteCodeGeneratorSection.style.display = "none";
        } else {
          document
            .querySelectorAll("#panel-admins input, #panel-admins button")
            .forEach((el) => (el.disabled = false));
          inviteCodeGeneratorSection.style.display = "block";
        }
      } else if (tokaRes.status === 404) {
        userEmailEl.textContent = user.displayName || user.email;
        state.isSuperAdmin = true;
        adminNavItem.style.display = "block";
      } else {
        const errData = await tokaRes.json().catch(() => ({}));
        throw new Error(errData.message || "とーか設定の読み込みに失敗");
      }
      await fetchAICharacters();
    } catch (err) {
      finalStatusMessage = `エラー: ${err.message}`;
      console.error("とーか/管理者設定の読み込みエラー:", err);
    }

    try {
      const scheduleRes = await fetch("/api/settings/schedule", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (scheduleRes.ok) {
        const data = await scheduleRes.json();
        remindersEnabledCheckbox.checked = data.remindersEnabled ?? false;
        reminderTimeInput.value = data.reminderTime || "";
        googleSheetIdInput.value = data.googleSheetId || "";
        reminderGuildIdInput.value = data.reminderGuildId || "";
        reminderRoleIdInput.value = data.reminderRoleId || "";
      } else if (scheduleRes.status !== 404) {
        const errData = await scheduleRes.json().catch(() => ({}));
        throw new Error(errData.message || "スケジュール設定の読み込みに失敗");
      }
    } catch (err) {
      console.error("スケジュール設定の読み込みエラー:", err);
      finalStatusMessage =
        `${finalStatusMessage}\nスケジュール設定の読み込みに失敗しました。`.trim();
    }

    statusMessage.textContent = finalStatusMessage;
  }

  // --- AI管理関連のデータ操作関数 ---
  async function fetchAICharacters() {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/ai/characters", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(
          error.message || "AIキャラクター一覧の取得に失敗しました"
        );
      }

      state.aiCharacters = (await response.json()).map((char) => ({
        ...char,
        modified: false,
      }));
      renderAICharactersList();
    } catch (error) {
      console.error("AIキャラクター一覧取得エラー:", error);
      statusMessage.textContent = `エラー: ${error.message}`;
    }
  }

  // AIキャラクター保存処理
  async function saveAICharacter(card) {
    const user = auth.currentUser;
    if (!user) return;

    const elements = getAICardElements(card);
    const aiId = card.dataset.aiId;

    // 必須項目のバリデーション
    const name = elements.displayNameInput.value.trim();
    const baseUserId = elements.baseUserIdInput.value.trim();
    const systemPrompt = elements.systemPromptTextarea.value.trim();

    if (!name || !baseUserId || !systemPrompt) {
      statusMessage.textContent =
        "エラー: 名前、ベースユーザーID、システムプロンプトは必須です";
      return;
    }

    try {
      // ニックネームの収集
      const nicknames = {};
      elements.nicknamesList
        .querySelectorAll(".nickname-entry")
        .forEach((entry) => {
          const userId = entry.querySelector(".nickname-id").value.trim();
          const nickname = entry.querySelector(".nickname-name").value.trim();
          if (userId && nickname) {
            nicknames[userId] = nickname;
          }
        });

      const data = {
        name,
        baseUserId,
        systemPrompt,
        modelMode: elements.modelModeSelect.value,
        enableNameRecognition: elements.nameRecognitionCheckbox.checked,
        enableBotMessageResponse: elements.botResponseCheckbox.checked,
        replyDelayMs: parseInt(elements.replyDelayInput.value) || 0,
        errorOopsMessage: elements.errorMessageInput.value.trim(),
        userNicknames: nicknames,
        active: elements.activeToggle.checked,
      };

      const token = await user.getIdToken();
      const response = await fetch(`/api/ai/characters/${aiId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "AIキャラクターの更新に失敗しました");
      }

      const result = await response.json();
      const index = state.aiCharacters.findIndex((char) => char.id === aiId);
      if (index !== -1) {
        state.aiCharacters[index] = { ...result, modified: false };
      }

      renderAICharactersList();
      statusMessage.textContent = result.message;
      toggleAIEditForm(card);
    } catch (error) {
      console.error("AIキャラクター更新エラー:", error);
      statusMessage.textContent = `エラー: ${error.message}`;
    }
  }

  saveProfileBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user || saveProfileBtn.disabled) return;

    saveProfileBtn.disabled = true;
    statusMessage.textContent = "プロファイルを更新中...";

    try {
      const newDisplayName = profileDisplayNameInput.value.trim();
      const newEmail = profileEmailInput.value.trim();
      const currentEmail = user.email;

      // 表示名の更新
      const token = await user.getIdToken(true);
      const res = await fetch("/api/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          displayName: newDisplayName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "更新に失敗しました");
      }

      // メールアドレスの変更がある場合
      if (newEmail && newEmail !== currentEmail) {
        try {
          await user.verifyBeforeUpdateEmail(newEmail);
          statusMessage.textContent = `プロファイルを更新しました。
                    新しいメールアドレス（${newEmail}）に確認メールを送信しました。
                    確認メールのリンクをクリックしてメールアドレスの変更を完了してください。
                    メールが届かない場合は、スパムフォルダもご確認ください。`;

          alert(`新しいメールアドレス（${newEmail}）に確認メールを送信しました。
                    メールを確認してリンクをクリックしてください。
                    ※メールが届かない場合は、スパムフォルダもご確認ください。`);
        } catch (emailError) {
          console.error("メール更新エラー:", emailError);
          if (emailError.code === "auth/requires-recent-login") {
            await auth.signOut();
            alert(
              "セキュリティ保護のため、メールアドレスを変更するには再ログインが必要です。\nログアウトしましたので、再度ログインしてからお試しください。"
            );
            window.location.reload();
            return;
          } else {
            throw new Error(
              `メールアドレスの更新に失敗しました。エラー: ${emailError.message}`
            );
          }
        }
      } else {
        statusMessage.textContent = "プロファイルを更新しました。";
      }

      await fetchSettings(user);
    } catch (err) {
      console.error("プロファイル更新エラー:", err);
      statusMessage.textContent = `エラー: ${err.message}`;
      alert(`エラーが発生しました: ${err.message}`);
    } finally {
      saveProfileBtn.disabled = false;
    }
  });

  async function fetchScheduleItems() {
    const user = auth.currentUser;
    if (!user) return;

    statusMessage.textContent = "予定リストを読み込み中...";
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/schedule/items", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errorData = await res
          .json()
          .catch(() => ({ message: "予定リストの読み込みに失敗しました。" }));
        throw new Error(errorData.message);
      }

      const items = await res.json();
      state.scheduleItems = items;
      renderScheduleList();
      statusMessage.textContent = "予定リストを読み込みました。";
    } catch (err) {
      statusMessage.textContent = `エラー: ${err.message}`;
    }
  }

  // ================ イベントリスナーの設定 ================
  // --- ナビゲーション ---
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = link.dataset.target;
      navLinks.forEach((l) => l.classList.remove("active"));
      panels.forEach((p) => (p.style.display = "none"));
      link.classList.add("active");
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.style.display = "block";
      if (targetId === "panel-schedule") {
        fetchScheduleItems();
      }
    });
  });

  // --- 認証関連 ---
  auth.onAuthStateChanged((user) => {
    loaderContainer.style.display = "none";
    pageContainer.style.display = "block";
    if (user) {
      authContainer.style.display = "none";
      mainContent.style.display = "block";
      fetchSettings(user);
    } else {
      authContainer.style.display = "block";
      mainContent.style.display = "none";
      loginForm.style.display = "block";
      registerForm.style.display = "none";
    }
  });

  loginBtn.addEventListener("click", () => {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    auth.signInWithEmailAndPassword(email, password).catch((err) => {
      statusMessage.textContent = `ログインエラー: ${err.message}`;
    });
  });

  logoutBtn.addEventListener("click", () => auth.signOut());

  forgotPasswordLink.addEventListener("click", (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value;
    if (!email) {
      statusMessage.textContent = "メールアドレスを入力してください。";
      return;
    }

    auth
      .sendPasswordResetEmail(email)
      .then(() => {
        statusMessage.textContent = `${email} にパスワード再設定用のメールを送信しました。`;
      })
      .catch((err) => {
        statusMessage.textContent = `エラー: ${err.message}`;
      });
  });

  showRegisterFormLink.addEventListener("click", (e) => {
    e.preventDefault();
    loginForm.style.display = "none";
    registerForm.style.display = "block";
    statusMessage.textContent = "";
  });

  showLoginFormLink.addEventListener("click", (e) => {
    e.preventDefault();
    registerForm.style.display = "none";
    loginForm.style.display = "block";
    statusMessage.textContent = "";
  });

  // --- 登録処理 ---
  registerBtn.addEventListener("click", async () => {
    const inviteCode = document
      .getElementById("register-invite-code")
      .value.trim();
    const displayName = document
      .getElementById("register-display-name")
      .value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;

    statusMessage.textContent = "登録中...";
    registerBtn.disabled = true;

    try {
      const res = await fetch("/api/register-with-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode, displayName, email, password }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "登録に失敗しました。");

      statusMessage.textContent = result.message;
      document.getElementById("register-form").reset();
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      statusMessage.textContent = `エラー: ${err.message}`;
      registerBtn.disabled = false;
    }
  });

  // --- とーかパネル ---
  addNicknameBtn.addEventListener("click", () => createNicknameEntry());

  nicknamesListContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-btn")) {
      e.target.closest(".nickname-entry").remove();
    }
  });

  saveTokaBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user || saveTokaBtn.disabled) return;

    saveTokaBtn.disabled = true;
    statusMessage.textContent = "とーか設定を保存中...";

    try {
      const token = await user.getIdToken();
      const nicknamesObject = {};
      document.querySelectorAll(".nickname-entry").forEach((entry) => {
        const id = entry.querySelector(".nickname-id").value.trim();
        const name = entry.querySelector(".nickname-name").value.trim();
        if (id) nicknamesObject[id] = name;
      });

      const settings = {
        baseUserId: baseUserIdInput.value,
        systemPrompt: promptTextarea.value,
        enableNameRecognition: nameRecognitionCheckbox.checked,
        enableBotMessageResponse: botMessageResponseCheckbox.checked,
        userNicknames: nicknamesObject,
        modelMode: tokaModelModeSelect.value,
        replyDelayMs: Number(replyDelayMsInput.value) || 0,
        errorOopsMessage: errorOopsMessageInput.value.trim(),
      };

      const res = await fetch("/api/settings/toka", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      statusMessage.textContent = result.message;
    } catch (err) {
      statusMessage.textContent = `エラー: ${err.message}`;
    } finally {
      saveTokaBtn.disabled = false;
    }
  });

  // --- AI管理関連のイベントリスナー ---
  if (addAIBtn) {
    addAIBtn.addEventListener("click", async () => {
      try {
        const token = await auth.currentUser.getIdToken();
        const newCharacter = {
          name: "新規AIキャラクター",
          baseUserId: "",
          systemPrompt: "",
          modelMode: "hybrid",
          enableNameRecognition: true,
          enableBotMessageResponse: false,
          replyDelayMs: 0,
          errorOopsMessage: "",
          userNicknames: {},
          active: false,
        };

        const response = await fetch("/api/ai/characters", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(newCharacter),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message);
        }

        const savedCharacter = await response.json();
        state.aiCharacters.push({ ...savedCharacter, modified: true });
        renderAICharactersList();

        // 新しく作成したカードの編集フォームを開く
        const newCard = aiList.querySelector(
          `[data-ai-id="${savedCharacter.id}"]`
        );
        if (newCard) {
          toggleAIEditForm(newCard);
        }

        statusMessage.textContent =
          "新しいAIキャラクターを作成しました。必要な情報を入力してください。";
      } catch (error) {
        console.error("AIキャラクター作成エラー:", error);
        statusMessage.textContent = `エラー: ${error.message}`;
      }
    });
  }

  if (aiList) {
    // 編集・削除・保存のイベント処理
    aiList.addEventListener("click", async (e) => {
      const target = e.target;
      const card = target.closest(".ai-card");
      if (!card) return;

      const aiId = card.dataset.aiId;

      if (target.classList.contains("edit-ai-btn")) {
        toggleAIEditForm(card);
      } else if (target.classList.contains("delete-ai-btn")) {
        if (confirm("このAIキャラクターを削除してもよろしいですか？")) {
          try {
            const token = await auth.currentUser.getIdToken();
            const response = await fetch(`/api/ai/characters/${aiId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` },
            });

            if (!response.ok) {
              const error = await response.json();
              throw new Error(error.message);
            }

            state.aiCharacters = state.aiCharacters.filter(
              (char) => char.id !== aiId
            );
            renderAICharactersList();
            statusMessage.textContent = "AIキャラクターを削除しました";
          } catch (error) {
            console.error("AIキャラクター削除エラー:", error);
            statusMessage.textContent = `エラー: ${error.message}`;
          }
        }
      } else if (target.classList.contains("save-ai-btn")) {
        await saveAICharacter(card);
      } else if (target.classList.contains("cancel-ai-btn")) {
        toggleAIEditForm(card);
      } else if (target.classList.contains("add-nickname-btn")) {
        const elements = getAICardElements(card);
        const entry = createNicknameEntry("", "");
        elements.nicknamesList.appendChild(entry);
        markAICharacterAsModified(aiId);
      }
    });

    // アクティブ状態の切り替え
    aiList.addEventListener("change", async (e) => {
      const target = e.target;
      if (target.classList.contains("ai-active-toggle")) {
        const card = target.closest(".ai-card");
        const aiId = card.dataset.aiId;
        try {
          const token = await auth.currentUser.getIdToken();
          const response = await fetch(`/api/ai/characters/${aiId}/status`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ active: target.checked }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message);
          }

          const character = state.aiCharacters.find((char) => char.id === aiId);
          if (character) {
            character.active = target.checked;
          }

          const result = await response.json();
          statusMessage.textContent = result.message;
        } catch (error) {
          console.error("AIキャラクター状態更新エラー:", error);
          statusMessage.textContent = `エラー: ${error.message}`;
          target.checked = !target.checked; // エラー時は元の状態に戻す
        }
      }
    });

    // 入力変更時のmodifiedフラグ設定
    aiList.addEventListener("input", (e) => {
      const card = e.target.closest(".ai-card");
      if (card) {
        const aiId = card.dataset.aiId;
        markAICharacterAsModified(aiId);
      }
    });
  }

  // --- スケジュールパネル ---
  addScheduleItemBtn.addEventListener("click", () => {
    state.scheduleItems.push(["", "", ""]);
    renderScheduleList();
  });

  scheduleItemsContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-btn")) {
      const entry = e.target.closest(".schedule-item-entry");
      const index = parseInt(entry.dataset.index, 10);
      state.scheduleItems.splice(index, 1);
      renderScheduleList();
    }
  });

  scheduleItemsContainer.addEventListener("input", (e) => {
    const input = e.target;
    if (
      input.classList.contains("item-type") ||
      input.classList.contains("item-task") ||
      input.classList.contains("item-due")
    ) {
      const entry = input.closest(".schedule-item-entry");
      const index = parseInt(entry.dataset.index, 10);
      const fieldIndex = parseInt(input.dataset.field, 10);
      if (state.scheduleItems[index]) {
        state.scheduleItems[index][fieldIndex] = input.value;
      }
    }
  });

  saveScheduleSettingsBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user || saveScheduleSettingsBtn.disabled) return;

    saveScheduleSettingsBtn.disabled = true;
    statusMessage.textContent = "スケジュール設定を保存中...";

    try {
      const token = await user.getIdToken();
      const settings = {
        remindersEnabled: remindersEnabledCheckbox.checked,
        reminderTime: reminderTimeInput.value,
        googleSheetId: googleSheetIdInput.value,
        reminderGuildId: reminderGuildIdInput.value,
        reminderRoleId: reminderRoleIdInput.value,
      };

      const res = await fetch("/api/settings/schedule", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      statusMessage.textContent = result.message;
    } catch (err) {
      statusMessage.textContent = `エラー: ${err.message}`;
    } finally {
      saveScheduleSettingsBtn.disabled = false;
    }
  });

  saveScheduleItemsBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    saveScheduleItemsBtn.disabled = true;
    statusMessage.textContent = "予定リストをシートに保存中...";

    try {
      const token = await user.getIdToken();
      const itemsToSave = state.scheduleItems.filter(
        (item) => item[0] || item[1] || item[2]
      );

      const res = await fetch("/api/schedule/items", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items: itemsToSave }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      statusMessage.textContent = result.message;
      await fetchScheduleItems();
    } catch (err) {
      statusMessage.textContent = `エラー: ${err.message}`;
    } finally {
      saveScheduleItemsBtn.disabled = false;
    }
  });

  // --- 管理者パネル ---
  addAdminBtn.addEventListener("click", () => {
    if (!state.isSuperAdmin) return;
    state.admins.push({ name: "", email: "" });
    renderAdminList();
  });

  adminsListContainer.addEventListener("click", (e) => {
    if (e.target.classList.contains("delete-btn")) {
      if (!state.isSuperAdmin) return;
      const entry = e.target.closest(".admin-entry");
      const index = parseInt(entry.dataset.index, 10);
      state.admins.splice(index, 1);
      renderAdminList();
    }
  });

  adminsListContainer.addEventListener("input", (e) => {
    const input = e.target;
    if (
      input.classList.contains("admin-name") ||
      input.classList.contains("admin-email")
    ) {
      const entry = input.closest(".admin-entry");
      const index = parseInt(entry.dataset.index, 10);
      const field = input.dataset.field;
      if (state.admins[index]) state.admins[index][field] = input.value;
    }
  });

  let draggedIndex = null;

  adminsListContainer.addEventListener("dragstart", (e) => {
    if (!state.isSuperAdmin || !e.target.classList.contains("admin-entry"))
      return;
    draggedIndex = parseInt(e.target.dataset.index, 10);
    setTimeout(() => e.target.classList.add("dragging"), 0);
  });

  adminsListContainer.addEventListener("dragend", (e) => {
    if (!e.target.classList.contains("admin-entry")) return;
    e.target.classList.remove("dragging");
    if (draggedIndex !== null) renderAdminList();
    draggedIndex = null;
  });

  adminsListContainer.addEventListener("drop", (e) => {
    if (!state.isSuperAdmin || draggedIndex === null) return;
    e.preventDefault();
    const dropTarget = e.target.closest(".admin-entry");
    if (dropTarget) {
      const dropIndex = parseInt(dropTarget.dataset.index, 10);
      if (draggedIndex === dropIndex) return;
      const draggedItem = state.admins.splice(draggedIndex, 1)[0];
      state.admins.splice(dropIndex, 0, draggedItem);
      renderAdminList();
    }
  });

  adminsListContainer.addEventListener("dragover", (e) => {
    if (!state.isSuperAdmin) return;
    e.preventDefault();
  });

  generateInviteCodeBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user || !state.isSuperAdmin) return;

    generateInviteCodeBtn.disabled = true;

    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/generate-invite-code", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      newInviteCodeInput.value = result.code;
      inviteCodeDisplay.style.display = "flex";
    } catch (err) {
      statusMessage.textContent = `エラー: ${err.message}`;
    } finally {
      generateInviteCodeBtn.disabled = false;
    }
  });

  copyInviteCodeBtn.addEventListener("click", () => {
    newInviteCodeInput.select();
    document.execCommand("copy");
    statusMessage.textContent = "招待コードをコピーしました！";
  });

  saveAdminsBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user || saveAdminsBtn.disabled) return;

    saveAdminsBtn.disabled = true;
    statusMessage.textContent = "管理者リストを保存中...";

    try {
      const token = await user.getIdToken();
      const adminsArray = state.admins.filter(
        (admin) => admin.email && admin.name
      );

      const res = await fetch("/api/settings/admins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ admins: adminsArray }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      statusMessage.textContent = result.message;
      await fetchSettings(user);
    } catch (err) {
      statusMessage.textContent = `エラー: ${err.message}`;
    } finally {
      saveAdminsBtn.disabled = false;
    }
  });

  // --- すべての設定を保存 ---
  saveAllBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user || saveAllBtn.disabled) return;

    saveAllBtn.disabled = true;
    statusMessage.textContent = "すべての設定を保存中...";

    try {
      const token = await user.getIdToken();

      // AIキャラクターの保存（変更があるものだけ）
      const aiPromises = state.aiCharacters
        .filter((char) => char.modified)
        .map((char) => {
          const card = aiList.querySelector(`[data-ai-id="${char.id}"]`);
          if (card) {
            return saveAICharacter(card);
          }
          return Promise.resolve();
        });

      // とーか設定の保存
      const tokaSettings = {
        baseUserId: baseUserIdInput.value,
        systemPrompt: promptTextarea.value,
        enableNameRecognition: nameRecognitionCheckbox.checked,
        enableBotMessageResponse: botMessageResponseCheckbox.checked,
        modelMode: tokaModelModeSelect.value,
        replyDelayMs: Number(replyDelayMsInput.value) || 0,
        errorOopsMessage: errorOopsMessageInput.value.trim(),
        userNicknames: (() => {
          const nicknames = {};
          nicknamesListContainer
            .querySelectorAll(".nickname-entry")
            .forEach((entry) => {
              const id = entry.querySelector(".nickname-id").value.trim();
              const name = entry.querySelector(".nickname-name").value.trim();
              if (id) nicknames[id] = name;
            });
          return nicknames;
        })(),
      };

      await Promise.all([
        fetch("/api/settings/toka", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(tokaSettings),
        }),
        ...aiPromises,
      ]);

      statusMessage.textContent = "すべての設定を保存しました。";
    } catch (err) {
      console.error("設定の保存エラー:", err);
      statusMessage.textContent = `エラー: ${err.message}`;
    } finally {
      saveAllBtn.disabled = false;
    }
  });
});
