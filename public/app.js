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

  // --- 認証関連要素 ---
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginBtn = document.getElementById("login-btn");
  const registerBtn = document.getElementById("register-btn");
  const forgotPasswordLink = document.getElementById("forgot-password-link");
  const showRegisterFormLink = document.getElementById("show-register-form-link");
  const showLoginFormLink = document.getElementById("show-login-form-link");
  const userEmailEl = document.getElementById("user-email");
  const logoutBtn = document.getElementById("logout-btn");

  // --- ナビゲーション要素 ---
  const navLinks = document.querySelectorAll(".nav-link");
  const panels = document.querySelectorAll(".dashboard-panel");
  const adminNavItem = document.getElementById("nav-item-admin");

  // --- プロファイル要素 ---
  const profileDisplayNameInput = document.getElementById("profile-display-name");
  const profileEmailInput = document.getElementById("profile-email");
  const saveProfileBtn = document.getElementById("save-profile-btn");

  // --- AI管理要素 ---
  const aiListContainer = document.getElementById("ai-list-container");
  const createAiForm = document.getElementById("create-ai-form");
  const editAiModal = document.getElementById("edit-ai-modal");
  const editAiForm = document.getElementById("edit-ai-form");
  const closeModalBtn = document.querySelector(".close");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");

  // --- 管理者パネル要素 ---
  const generateInviteCodeBtn = document.getElementById("generate-invite-code-btn");
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
    aiList: [],
    currentEditingAi: null
  };

  // ================ AI管理関数 ================
  async function fetchAiList() {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/ais", {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        state.aiList = await response.json();
        renderAiList();
      } else {
        console.error("AI一覧の取得に失敗:", response.status);
        state.aiList = [];
        renderAiList();
      }
    } catch (error) {
      console.error("AI一覧の取得エラー:", error);
      statusMessage.textContent = `エラー: AI一覧の取得に失敗しました - ${error.message}`;
    }
  }

  function renderAiList() {
    aiListContainer.innerHTML = "";

    if (state.aiList.length === 0) {
      aiListContainer.innerHTML = `
        <div class="empty-state">
          <h3>AIがまだ作成されていません</h3>
          <p>「AI作成」タブから新しいAIを作成してください。</p>
          <button onclick="switchToPanel('panel-create-ai')" class="save-btn">AIを作成する</button>
        </div>
      `;
      return;
    }

    const aiGrid = document.createElement("div");
    aiGrid.className = "ai-grid";

    state.aiList.forEach(ai => {
      const aiCard = document.createElement("div");
      aiCard.className = "ai-card";
      aiCard.innerHTML = `
        <div class="ai-card-header">
          <h3 class="ai-card-title">${escapeHtml(ai.name)}</h3>
          <span class="ai-card-id">${escapeHtml(ai.id)}</span>
        </div>
        <div class="ai-details">
          <p><strong>モデル:</strong> ${ai.modelMode === 'hybrid' ? 'ハイブリッド' : 'Flash'}</p>
          <p><strong>返信遅延:</strong> ${ai.replyDelayMs || 0}ms</p>
          <p><strong>名前認識:</strong> ${ai.enableNameRecognition ? '有効' : '無効'}</p>
          <p><strong>Bot反応:</strong> ${ai.enableBotMessageResponse ? '有効' : '無効'}</p>
        </div>
        <div class="ai-card-actions">
          <button class="secondary-btn" onclick="editAi('${escapeHtml(ai.id)}')">編集</button>
          <button class="delete-btn" onclick="deleteAi('${escapeHtml(ai.id)}', '${escapeHtml(ai.name)}')">削除</button>
        </div>
      `;
      aiGrid.appendChild(aiCard);
    });

    aiListContainer.appendChild(aiGrid);
  }

  async function createAi(aiData) {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch("/api/ais", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(aiData)
      });

      const result = await response.json();
      
      if (response.ok) {
        statusMessage.textContent = result.message;
        await fetchAiList();
        switchToPanel('panel-ai-list');
        createAiForm.reset();
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error("AI作成エラー:", error);
      statusMessage.textContent = `エラー: ${error.message}`;
    }
  }

  async function updateAi(aiId, aiData) {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/ais/${aiId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(aiData)
      });

      const result = await response.json();
      
      if (response.ok) {
        statusMessage.textContent = result.message;
        await fetchAiList();
        editAiModal.style.display = "none";
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error("AI更新エラー:", error);
      statusMessage.textContent = `エラー: ${error.message}`;
    }
  }

  async function deleteAiById(aiId) {
    const user = auth.currentUser;
    if (!user) return;

    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/ais/${aiId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });

      const result = await response.json();
      
      if (response.ok) {
        statusMessage.textContent = result.message;
        await fetchAiList();
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error("AI削除エラー:", error);
      statusMessage.textContent = `エラー: ${error.message}`;
    }
  }

  // ================ グローバル関数（HTMLから呼び出される） ================
  window.switchToPanel = function(panelId) {
    navLinks.forEach(link => link.classList.remove("active"));
    panels.forEach(panel => panel.classList.remove("active"));
    
    const targetPanel = document.getElementById(panelId);
    const targetLink = document.querySelector(`[data-target="${panelId}"]`);
    
    if (targetPanel) targetPanel.classList.add("active");
    if (targetLink) targetLink.classList.add("active");
  };

  window.editAi = function(aiId) {
    const ai = state.aiList.find(a => a.id === aiId);
    if (!ai) return;

    state.currentEditingAi = ai;
    
    // フォームに現在の値を設定
    document.getElementById("edit-ai-id").value = ai.id;
    document.getElementById("edit-ai-name").value = ai.name;
    document.getElementById("edit-ai-model-mode").value = ai.modelMode || 'hybrid';
    document.getElementById("edit-ai-base-user-id").value = ai.baseUserId || '';
    document.getElementById("edit-ai-name-recognition").checked = ai.enableNameRecognition ?? true;
    document.getElementById("edit-ai-bot-response").checked = ai.enableBotMessageResponse ?? false;
    document.getElementById("edit-ai-reply-delay").value = ai.replyDelayMs || 0;
    document.getElementById("edit-ai-error-message").value = ai.errorOopsMessage || '';
    document.getElementById("edit-ai-system-prompt").value = ai.systemPrompt || '';

    editAiModal.style.display = "block";
  };

  window.deleteAi = function(aiId, aiName) {
    if (confirm(`AI「${aiName}」を削除しますか？この操作は取り消せません。`)) {
      deleteAiById(aiId);
    }
  };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ================ 管理者関連関数 ================
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
               placeholder="管理者メールアドレス" value="${admin.email || ""}">
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

  // ================ データ取得関数 ================
  async function fetchSettings(user) {
    statusMessage.textContent = "読込中...";
    let finalStatusMessage = "設定を読み込みました。";

    try {
      const token = await user.getIdToken();
      const tokaRes = await fetch("/api/settings/toka", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (tokaRes.status === 403 || tokaRes.status === 401) {
        throw new Error("アクセスが拒否されました。");
      }

      if (tokaRes.ok) {
        const data = await tokaRes.json();
        const currentUserAdminInfo = (data.admins || []).find(
          (admin) => admin.email === user.email
        );

        if (currentUserAdminInfo) {
          profileDisplayNameInput.value = currentUserAdminInfo.name || "";
          profileEmailInput.value = user.email || "";
        }

        userEmailEl.textContent = currentUserAdminInfo && currentUserAdminInfo.name
          ? currentUserAdminInfo.name
          : user.email;

        state.admins = data.admins || [];
        state.isSuperAdmin = data.currentUser && data.currentUser.isSuperAdmin;
        adminNavItem.style.display = "block";
        renderAdminList();

        if (!state.isSuperAdmin) {
          document.querySelectorAll("#panel-admins input, #panel-admins button")
            .forEach((el) => (el.disabled = true));
          document.getElementById("invite-code-generator-section").style.display = "none";
        }
      } else if (tokaRes.status === 404) {
        userEmailEl.textContent = user.displayName || user.email;
        state.isSuperAdmin = true;
        adminNavItem.style.display = "block";
      } else {
        const errData = await tokaRes.json().catch(() => ({}));
        throw new Error(errData.message || "設定の読み込みに失敗");
      }
    } catch (err) {
      finalStatusMessage = `エラー: ${err.message}`;
      console.error("設定の読み込みエラー:", err);
    }

    // AI一覧を取得
    await fetchAiList();
    
    statusMessage.textContent = finalStatusMessage;
  }

  // ================ イベントリスナーの設定 ================
  // --- ナビゲーション ---
  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetId = link.dataset.target;
      switchToPanel(targetId);
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

    auth.sendPasswordResetEmail(email)
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
    const inviteCode = document.getElementById("register-invite-code").value.trim();
    const displayName = document.getElementById("register-display-name").value.trim();
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
      registerForm.reset();
      await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
      statusMessage.textContent = `エラー: ${err.message}`;
      registerBtn.disabled = false;
    }
  });

  // --- AI作成フォーム ---
  createAiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const aiData = {
      id: document.getElementById("ai-id").value.trim(),
      name: document.getElementById("ai-name").value.trim(),
      modelMode: document.getElementById("ai-model-mode").value,
      baseUserId: document.getElementById("ai-base-user-id").value.trim() || null,
      enableNameRecognition: document.getElementById("ai-name-recognition").checked,
      enableBotMessageResponse: document.getElementById("ai-bot-response").checked,
      replyDelayMs: parseInt(document.getElementById("ai-reply-delay").value) || 0,
      errorOopsMessage: document.getElementById("ai-error-message").value.trim(),
      systemPrompt: document.getElementById("ai-system-prompt").value.trim(),
      userNicknames: {}
    };

    // ID検証
    if (!/^[a-zA-Z0-9_-]+$/.test(aiData.id)) {
      statusMessage.textContent = "AI IDは英数字、ハイフン、アンダースコアのみ使用可能です。";
      return;
    }

    createAiForm.querySelector('button[type="submit"]').disabled = true;
    statusMessage.textContent = "AIを作成中...";

    await createAi(aiData);
    
    createAiForm.querySelector('button[type="submit"]').disabled = false;
  });

  // --- AI編集フォーム ---
  editAiForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const aiId = document.getElementById("edit-ai-id").value;
    const aiData = {
      name: document.getElementById("edit-ai-name").value.trim(),
      modelMode: document.getElementById("edit-ai-model-mode").value,
      baseUserId: document.getElementById("edit-ai-base-user-id").value.trim() || null,
      enableNameRecognition: document.getElementById("edit-ai-name-recognition").checked,
      enableBotMessageResponse: document.getElementById("edit-ai-bot-response").checked,
      replyDelayMs: parseInt(document.getElementById("edit-ai-reply-delay").value) || 0,
      errorOopsMessage: document.getElementById("edit-ai-error-message").value.trim(),
      systemPrompt: document.getElementById("edit-ai-system-prompt").value.trim(),
      userNicknames: state.currentEditingAi?.userNicknames || {}
    };

    editAiForm.querySelector('button[type="submit"]').disabled = true;
    statusMessage.textContent = "AIを更新中...";

    await updateAi(aiId, aiData);
    
    editAiForm.querySelector('button[type="submit"]').disabled = false;
  });

  // --- モーダル制御 ---
  closeModalBtn.addEventListener("click", () => {
    editAiModal.style.display = "none";
  });

  cancelEditBtn.addEventListener("click", () => {
    editAiModal.style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target === editAiModal) {
      editAiModal.style.display = "none";
    }
  });

  // --- プロファイル設定 ---
  saveProfileBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user || saveProfileBtn.disabled) return;

    saveProfileBtn.disabled = true;
    statusMessage.textContent = "プロファイルを更新中...";

    try {
      const newDisplayName = profileDisplayNameInput.value.trim();
      const newEmail = profileEmailInput.value.trim();
      const currentEmail = user.email;

      const token = await user.getIdToken(true);
      const res = await fetch("/api/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ displayName: newDisplayName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "更新に失敗しました");
      }

      if (newEmail && newEmail !== currentEmail) {
        try {
          await user.verifyBeforeUpdateEmail(newEmail);
          statusMessage.textContent = `プロファイルを更新しました。新しいメールアドレス（${newEmail}）に確認メールを送信しました。`;
          alert(`新しいメールアドレス（${newEmail}）に確認メールを送信しました。メールを確認してリンクをクリックしてください。`);
        } catch (emailError) {
          if (emailError.code === "auth/requires-recent-login") {
            await auth.signOut();
            alert("セキュリティ保護のため、メールアドレスを変更するには再ログインが必要です。");
            window.location.reload();
            return;
          } else {
            throw new Error(`メールアドレスの更新に失敗しました。エラー: ${emailError.message}`);
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
    if (input.classList.contains("admin-name") || input.classList.contains("admin-email")) {
      const entry = input.closest(".admin-entry");
      const index = parseInt(entry.dataset.index, 10);
      const field = input.dataset.field;
      if (state.admins[index]) state.admins[index][field] = input.value;
    }
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
      const adminsArray = state.admins.filter((admin) => admin.email && admin.name);

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
});