document.addEventListener("DOMContentLoaded", () => {
  // ================ DOM要素の参照 ================
  // --- 共通要素 ---
  const loaderContainer = document.getElementById("loader-container");
  const pageContainer = document.querySelector(".container");
  const authContainer = document.getElementById("auth-container");
  const mainContent = document.getElementById("main-content");
  const statusMessage = document.getElementById("status-message");

  // --- 認証関連要素 ---
  const userDisplayNameEl = document.getElementById("user-display-name");
  const userAvatarEl = document.getElementById("user-avatar");
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
    user: null,
    admins: [],
    isSuperAdmin: false,
    aiList: [],
    currentEditingAi: null
  };

  // ================ 通知システム ================
  const notificationContainer = document.getElementById("notification-container");
  
  function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // アイコンを設定
    let icon = '';
    switch (type) {
      case 'success':
        icon = '<i class="fas fa-check-circle"></i>';
        break;
      case 'error':
        icon = '<i class="fas fa-exclamation-circle"></i>';
        break;
      case 'info':
      default:
        icon = '<i class="fas fa-info-circle"></i>';
        break;
    }
    
    notification.innerHTML = `
      <div class="notification-icon">${icon}</div>
      <div class="notification-content">${message}</div>
      <button class="notification-close" onclick="hideNotification(this.parentElement)">
        <i class="fas fa-times"></i>
      </button>
    `;
    
    // コンテナに追加
    notificationContainer.appendChild(notification);
    
    // アニメーション表示
    setTimeout(() => {
      notification.classList.add('show');
    }, 10);
    
    // 自動で消す
    if (duration > 0) {
      setTimeout(() => {
        hideNotification(notification);
      }, duration);
    }
    
    return notification;
  }
  
  function hideNotification(notification) {
    if (!notification) return;
    
    notification.classList.remove('show');
    setTimeout(() => {
      if (notification.parentElement) {
        notification.parentElement.removeChild(notification);
      }
    }, 300);
  }
  
  function clearAllNotifications() {
    const notifications = notificationContainer.querySelectorAll('.notification');
    notifications.forEach(notification => {
      hideNotification(notification);
    });
  }

  // ================ 認証状態チェック ================
  async function checkAuthStatus() {
    try {
      const response = await fetch('/auth/user', {
        credentials: 'include'
      });
      const authData = await response.json();
      
      if (authData.authenticated) {
        state.user = authData.user;
        showMainContent();
        await fetchSettings();
      } else {
        showAuthContainer();
      }
    } catch (error) {
      console.error('認証状態の確認に失敗:', error);
      showAuthContainer();
    }
  }

  function showAuthContainer() {
    loaderContainer.style.display = "none";
    pageContainer.style.display = "block";
    authContainer.style.display = "block";
    mainContent.style.display = "none";
    
    // URLパラメータをチェックして認証エラーを表示
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('error') === 'verification_failed') {
      statusMessage.textContent = 'メール認証に失敗しました: ' + (urlParams.get('message') || '不明なエラー');
      statusMessage.style.color = '#e74c3c';
    } else if (urlParams.get('error') === 'invalid_token') {
      statusMessage.textContent = '無効なトークンです: ' + (urlParams.get('message') || '不明なエラー');
      statusMessage.style.color = '#e74c3c';
    } else if (urlParams.get('error') === 'login_failed') {
      statusMessage.textContent = 'ログインに失敗しました: ' + (urlParams.get('message') || '不明なエラー');
      statusMessage.style.color = '#e74c3c';
    } else if (urlParams.get('auth') === 'verified') {
      statusMessage.textContent = 'メールアドレスの認証が完了しました。';
      statusMessage.style.color = '#27ae60';
      // 成功時は少し待ってから再チェック
      setTimeout(checkAuthStatus, 1000);
    }
  }

  function showMainContent() {
    loaderContainer.style.display = "none";
    pageContainer.style.display = "block";
    authContainer.style.display = "none";
    mainContent.style.display = "block";
    
    // ユーザー情報を表示
    if (state.user) {
      // ユーザー名の表示
      userDisplayNameEl.textContent = state.user.username;
      
      // アバターはローカルユーザーには表示しない
      userAvatarEl.style.display = 'none';
      const profileAvatar = document.getElementById('profile-avatar-display');
      if (profileAvatar) {
        profileAvatar.style.display = 'none';
        const placeholder = document.querySelector('.avatar-placeholder');
        if (placeholder) placeholder.style.display = 'block';
      }
      
      // プロファイル情報を設定
      const profileUsernameInput = document.getElementById('profile-username');
      const profileEmailInput = document.getElementById('profile-email');
      
      if (profileUsernameInput) {
        profileUsernameInput.value = state.user.username;
      }
      if (profileEmailInput) {
        profileEmailInput.value = state.user.email || '';
      }
      
      // プロファイル概要を更新
      const profileNameDisplay = document.getElementById('profile-name-display');
      if (profileNameDisplay) {
        profileNameDisplay.textContent = state.user.username;
      }
    }
  }

  // ================ AI管理関数 ================
  async function fetchAiList() {
    if (!state.user) return;

    try {
      const response = await fetch("/api/ais", {
        credentials: 'include'
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
    if (!state.user) return;

    try {
      const response = await fetch("/api/ais", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: 'include',
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
    if (!state.user) return;

    try {
      const response = await fetch(`/api/ais/${aiId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: 'include',
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
    if (!state.user) return;

    try {
      const response = await fetch(`/api/ais/${aiId}`, {
        method: "DELETE",
        credentials: 'include'
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
  async function fetchSettings() {
    if (!state.user) return;
    
    statusMessage.textContent = "読込中...";
    let finalStatusMessage = "設定を読み込みました。";
    let notificationType = 'success';

    try {
      const tokaRes = await fetch("/api/settings/toka", {
        credentials: 'include'
      });

      if (tokaRes.status === 403 || tokaRes.status === 401) {
        throw new Error("アクセスが拒否されました。");
      }

      if (tokaRes.ok) {
        const data = await tokaRes.json();
        const currentUserAdminInfo = (data.admins || []).find(
          (admin) => admin.email === state.user.email || admin.discordId === state.user.id
        );

        if (currentUserAdminInfo) {
          profileDisplayNameInput.value = currentUserAdminInfo.name || "";
          profileEmailInput.value = currentUserAdminInfo.email || "";
        } else {
          // 新規ユーザーの場合、Discord情報を初期値に設定
          profileDisplayNameInput.value = state.user.username || "";
          profileEmailInput.value = state.user.email || "";
        }

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
        // 初回セットアップの場合
        state.isSuperAdmin = true;
        adminNavItem.style.display = "block";
        profileDisplayNameInput.value = state.user.username || "";
        profileEmailInput.value = state.user.email || "";
      } else {
        const errData = await tokaRes.json().catch(() => ({}));
        throw new Error(errData.message || "設定の読み込みに失敗");
      }
    } catch (err) {
      finalStatusMessage = `エラー: ${err.message}`;
      notificationType = 'error';
      console.error("設定の読み込みエラー:", err);
    }

    // AI一覧を取得
    await fetchAiList();
    
    // 通知システムを使用して一時的な通知を表示
    statusMessage.textContent = ""; // ステータスメッセージをクリア
    showNotification(finalStatusMessage, notificationType, 3000);
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
  // 初期化時に認証状態をチェック
  checkAuthStatus();

  // ログアウトボタン
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      window.location.href = '/auth/logout';
    });
  }

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
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener("click", async () => {
      if (!state.user || saveProfileBtn.disabled) return;

      saveProfileBtn.disabled = true;
      statusMessage.textContent = "プロファイルを更新中...";

      try {
        const newDisplayName = profileDisplayNameInput.value.trim();
        const newEmail = profileEmailInput.value.trim();

        const res = await fetch("/api/update-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: 'include',
          body: JSON.stringify({ displayName: newDisplayName }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || "更新に失敗しました");
        }

        const result = await res.json();
        statusMessage.textContent = result.message;

        // メールアドレスが変更された場合の処理
        if (newEmail && newEmail !== state.user.email) {
          try {
            const emailRes = await fetch("/api/update-email", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              credentials: 'include',
              body: JSON.stringify({ 
                oldEmail: state.user.email, 
                newEmail: newEmail 
              }),
            });

            if (emailRes.ok) {
              statusMessage.textContent = "プロファイルとメールアドレスを更新しました。";
            } else {
              const emailError = await emailRes.json();
              statusMessage.textContent = `プロファイルは更新されましたが、メールアドレスの更新に失敗: ${emailError.message}`;
            }
          } catch (emailError) {
            statusMessage.textContent = `プロファイルは更新されましたが、メールアドレスの更新に失敗: ${emailError.message}`;
          }
        }

        await fetchSettings();
      } catch (err) {
        console.error("プロファイル更新エラー:", err);
        statusMessage.textContent = `エラー: ${err.message}`;
      } finally {
        saveProfileBtn.disabled = false;
      }
    });
  }

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
    if (!state.user || !state.isSuperAdmin) return;

    generateInviteCodeBtn.disabled = true;

    try {
      const res = await fetch("/api/generate-invite-code", {
        method: "POST",
        credentials: 'include'
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
    if (!state.user || saveAdminsBtn.disabled) return;

    saveAdminsBtn.disabled = true;
    statusMessage.textContent = "管理者リストを保存中...";

    try {
      const adminsArray = state.admins.filter((admin) => admin.email && admin.name);

      const res = await fetch("/api/settings/admins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: 'include',
        body: JSON.stringify({ admins: adminsArray }),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.message);

      statusMessage.textContent = result.message;
      await fetchSettings();
    } catch (err) {
      statusMessage.textContent = `エラー: ${err.message}`;
    } finally {
      saveAdminsBtn.disabled = false;
    }
  });

  // --- 新しい認証システム用のイベントリスナー ---
  const loginForm = document.getElementById("login-form-element");
  const registerForm = document.getElementById("register-form-element");
  const passwordResetForm = document.getElementById("password-reset-form-element");
  const resendVerificationBtn = document.getElementById("resend-verification-btn");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const username = document.getElementById("login-username").value.trim();
      const password = document.getElementById("login-password").value;
      
      if (!username || !password) {
        statusMessage.textContent = "ユーザー名またはメールアドレス、パスワードを入力してください。";
        statusMessage.style.color = "#e74c3c";
        return;
      }
      
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      statusMessage.textContent = "ログイン中...";
      statusMessage.style.color = "#2c3e50";
      
      try {
        const response = await fetch('/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (result.success) {
          statusMessage.textContent = result.message;
          statusMessage.style.color = "#27ae60";
          // ログイン成功時、少し待ってから認証状態をチェック
          setTimeout(() => {
            checkAuthStatus();
          }, 1000);
        } else {
          statusMessage.textContent = result.message;
          statusMessage.style.color = "#e74c3c";
        }
      } catch (error) {
        console.error('ログインエラー:', error);
        statusMessage.textContent = 'ログインに失敗しました。';
        statusMessage.style.color = "#e74c3c";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const username = document.getElementById("register-username").value.trim();
      const password = document.getElementById("register-password").value;
      const email = document.getElementById("register-email").value.trim();
      
      if (!username || !password || !email) {
        statusMessage.textContent = "すべての項目を入力してください。";
        statusMessage.style.color = "#e74c3c";
        return;
      }
      
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      statusMessage.textContent = "アカウントを作成中...";
      statusMessage.style.color = "#2c3e50";
      
      try {
        const response = await fetch('/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ username, password, email })
        });
        
        const result = await response.json();
        
        if (result.success) {
          statusMessage.textContent = result.message;
          statusMessage.style.color = "#27ae60";
          
          if (result.requiresVerification) {
            // メール認証が必要な場合
            document.getElementById("verification-email").textContent = email;
            showVerificationPendingForm();
          } else {
            // メール認証不要の場合（テスト環境など）
            setTimeout(() => {
              checkAuthStatus();
            }, 1000);
          }
        } else {
          statusMessage.textContent = result.message;
          statusMessage.style.color = "#e74c3c";
        }
      } catch (error) {
        console.error('登録エラー:', error);
        statusMessage.textContent = 'アカウント作成に失敗しました。';
        statusMessage.style.color = "#e74c3c";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (passwordResetForm) {
    passwordResetForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const email = document.getElementById("reset-email").value.trim();
      
      if (!email) {
        statusMessage.textContent = "メールアドレスを入力してください。";
        statusMessage.style.color = "#e74c3c";
        return;
      }
      
      const submitBtn = passwordResetForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      statusMessage.textContent = "パスワード再設定メールを送信中...";
      statusMessage.style.color = "#2c3e50";
      
      try {
        const response = await fetch('/auth/request-password-reset', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email })
        });
        
        const result = await response.json();
        
        if (result.success) {
          statusMessage.textContent = result.message;
          statusMessage.style.color = "#27ae60";
          // フォームをリセットしてログインフォームに戻る
          setTimeout(() => {
            passwordResetForm.reset();
            showLoginForm();
          }, 3000);
        } else {
          statusMessage.textContent = result.message;
          statusMessage.style.color = "#e74c3c";
        }
      } catch (error) {
        console.error('パスワード再設定エラー:', error);
        statusMessage.textContent = 'パスワード再設定に失敗しました。';
        statusMessage.style.color = "#e74c3c";
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (resendVerificationBtn) {
    resendVerificationBtn.addEventListener("click", async () => {
      const email = document.getElementById("verification-email").textContent;
      
      if (!email) {
        statusMessage.textContent = "メールアドレスが見つかりません。";
        statusMessage.style.color = "#e74c3c";
        return;
      }
      
      resendVerificationBtn.disabled = true;
      statusMessage.textContent = "認証メールを再送信中...";
      statusMessage.style.color = "#2c3e50";
      
      try {
        const response = await fetch('/auth/resend-verification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email })
        });
        
        const result = await response.json();
        
        if (result.success) {
          statusMessage.textContent = result.message;
          statusMessage.style.color = "#27ae60";
        } else {
          statusMessage.textContent = result.message;
          statusMessage.style.color = "#e74c3c";
        }
      } catch (error) {
        console.error('認証メール再送信エラー:', error);
        statusMessage.textContent = '認証メール再送信に失敗しました。';
        statusMessage.style.color = "#e74c3c";
      } finally {
        resendVerificationBtn.disabled = false;
      }
    });
  }
});

// ================ グローバル関数（HTML onclick から呼び出される） ================
function showLoginForm() {
  const loginSection = document.getElementById("login-section");
  const registerSection = document.getElementById("register-section");
  const passwordResetSection = document.getElementById("password-reset-section");
  const verificationSection = document.getElementById("verification-pending-section");
  
  loginSection.style.display = "block";
  registerSection.style.display = "none";
  passwordResetSection.style.display = "none";
  verificationSection.style.display = "none";
}

function showRegisterForm() {
  const loginSection = document.getElementById("login-section");
  const registerSection = document.getElementById("register-section");
  const passwordResetSection = document.getElementById("password-reset-section");
  const verificationSection = document.getElementById("verification-pending-section");
  
  loginSection.style.display = "none";
  registerSection.style.display = "block";
  passwordResetSection.style.display = "none";
  verificationSection.style.display = "none";
}

function showPasswordResetForm() {
  const loginSection = document.getElementById("login-section");
  const registerSection = document.getElementById("register-section");
  const passwordResetSection = document.getElementById("password-reset-section");
  const verificationSection = document.getElementById("verification-pending-section");
  
  loginSection.style.display = "none";
  registerSection.style.display = "none";
  passwordResetSection.style.display = "block";
  verificationSection.style.display = "none";
}

function showVerificationPendingForm() {
  const loginSection = document.getElementById("login-section");
  const registerSection = document.getElementById("register-section");
  const passwordResetSection = document.getElementById("password-reset-section");
  const verificationSection = document.getElementById("verification-pending-section");
  
  loginSection.style.display = "none";
  registerSection.style.display = "none";
  passwordResetSection.style.display = "none";
  verificationSection.style.display = "block";
}