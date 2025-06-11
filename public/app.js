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

  // ================ アプリケーションの状態 ================
  let state = {
    admins: [],
    isSuperAdmin: false,
    scheduleItems: [],
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
        renderNicknameList(data.userNicknames || {});

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

  saveProfileBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user || saveProfileBtn.disabled) return;

    saveProfileBtn.disabled = true;
    statusMessage.textContent = "プロファイルを更新中...";

    try {
      const newDisplayName = profileDisplayNameInput.value.trim();
      const newEmail = profileEmailInput.value.trim();
      const currentEmail = user.email;

      // メールアドレスのバリデーション
      if (newEmail && newEmail !== currentEmail) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
          throw new Error("メールアドレスの形式が正しくありません。");
        }
      }

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
          newEmail: newEmail, // サーバーサイドでもメール更新を処理
        }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message || "更新に失敗しました");

      // メールアドレスの更新（変更がある場合のみ）
      if (newEmail && newEmail !== currentEmail) {
        try {
          // 再認証が必要な可能性があるため、先に確認
          await user.reload();

          // メールアドレス更新処理
          await user.updateEmail(newEmail);
          await user.sendEmailVerification();

          statusMessage.textContent =
            "プロファイルとメールアドレスを更新しました。新しいメールアドレス宛に確認メールを送信しました。";

          // Firestore内のメールアドレスも更新
          await fetch("/api/update-email", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${await user.getIdToken(true)}`,
            },
            body: JSON.stringify({
              oldEmail: currentEmail,
              newEmail: newEmail,
            }),
          });
        } catch (emailError) {
          console.error("メール更新エラー:", emailError);
          if (emailError.code === "auth/requires-recent-login") {
            // 再認証が必要な場合
            await auth.signOut();
            throw new Error(
              "セキュリティのため再ログインが必要です。一度ログアウトしました。再度ログインして更新してください。"
            );
          } else {
            throw new Error(
              `メールアドレスの更新に失敗しました: ${emailError.message}`
            );
          }
        }
      } else {
        statusMessage.textContent = "プロファイルを更新しました。";
      }

      // 設定を再読み込み
      await fetchSettings(user);
    } catch (err) {
      console.error("プロファイル更新エラー:", err);
      statusMessage.textContent = `エラー: ${err.message}`;
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
        userNicknames: nicknamesObject,
        modelMode: tokaModelModeSelect.value,
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

  saveProfileBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user || saveProfileBtn.disabled) return;

    saveProfileBtn.disabled = true;
    statusMessage.textContent = "プロファイルを更新中...";

    try {
      const token = await user.getIdToken();
      const newDisplayName = profileDisplayNameInput.value.trim();
      const newEmail = profileEmailInput.value.trim();
      const currentEmail = user.email;

      console.log("プロファイル更新リクエスト:", {
        displayName: newDisplayName,
        currentEmail,
      });

      // 表示名の更新
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

      const result = await res.json();

      if (!res.ok) {
        console.error("プロファイル更新エラー:", result);
        throw new Error(
          result.message || result.details || "不明なエラーが発生しました。"
        );
      }

      // メールアドレスの更新（変更がある場合のみ）
      if (newEmail !== currentEmail) {
        await user.updateEmail(newEmail);
        await user.sendEmailVerification();
        statusMessage.textContent =
          "プロファイルを更新しました。新しいメールアドレスの確認メールを送信しました。";
      } else {
        statusMessage.textContent = "プロファイルを更新しました。";
      }

      // 設定を再読み込み
      await fetchSettings(user);
    } catch (err) {
      console.error("プロファイル更新エラーの詳細:", err);

      if (err.code === "auth/requires-recent-login") {
        statusMessage.textContent =
          "セキュリティのため、再度ログインが必要です。一度ログアウトしてから、もう一度お試しください。";
      } else {
        statusMessage.textContent = `エラー: ${err.message}`;
      }
    } finally {
      saveProfileBtn.disabled = false;
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

      // とーか設定
      const nicknamesObject = {};
      document.querySelectorAll(".nickname-entry").forEach((entry) => {
        const id = entry.querySelector(".nickname-id").value.trim();
        const name = entry.querySelector(".nickname-name").value.trim();
        if (id) nicknamesObject[id] = name;
      });

      const tokaSettings = {
        baseUserId: baseUserIdInput.value,
        systemPrompt: promptTextarea.value,
        enableNameRecognition: nameRecognitionCheckbox.checked,
        userNicknames: nicknamesObject,
        modelMode: tokaModelModeSelect.value,
      };

      // スケジュール設定
      const scheduleSettings = {
        remindersEnabled: remindersEnabledCheckbox.checked,
        reminderTime: reminderTimeInput.value,
        googleSheetId: googleSheetIdInput.value,
        reminderGuildId: reminderGuildIdInput.value,
        reminderRoleId: reminderRoleIdInput.value,
      };

      // 管理者設定
      const adminsArray = state.admins.filter(
        (admin) => admin.email && admin.name
      );

      // 各設定の保存を並行して実行
      const savePromises = [
        fetch("/api/settings/toka", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(tokaSettings),
        }),
        fetch("/api/settings/schedule", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(scheduleSettings),
        }),
      ];

      // 管理者の場合のみ管理者設定を保存
      if (state.isSuperAdmin) {
        savePromises.push(
          fetch("/api/settings/admins", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ admins: adminsArray }),
          })
        );
      }

      // すべての保存処理を実行
      const responses = await Promise.all(savePromises);

      // エラーチェック
      for (const res of responses) {
        if (!res.ok) {
          const error = await res.json();
          throw new Error(
            error.message || "設定の保存中にエラーが発生しました。"
          );
        }
      }

      // 設定を再読み込み
      await fetchSettings(user);
      await fetchScheduleItems();

      statusMessage.textContent = "すべての設定を保存しました。";
    } catch (err) {
      console.error("設定の保存エラー:", err);
      statusMessage.textContent = `エラー: ${err.message}`;
    } finally {
      saveAllBtn.disabled = false;
    }
  });
});
