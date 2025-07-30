document.addEventListener("DOMContentLoaded", () => {
  // ================ DOM要素の参照 ================
  // --- 共通要素 ---
  const loaderContainer = document.getElementById("loader-container");
  const pageContainer = document.querySelector(".container");
  const authContainer = document.getElementById("auth-container");
  const mainContent = document.getElementById("main-content");
  const statusMessage = document.getElementById("status-message");
  const toastContainer = document.getElementById("toast-container");

  // --- 認証関連要素 ---
  const userDisplayNameEl = document.getElementById("user-display-name");
  const userAvatarEl = document.getElementById("user-avatar");
  const logoutBtn = document.getElementById("logout-btn");

  // --- ナビゲーション要素 ---
  const navLinks = document.querySelectorAll(".nav-link");
  const panels = document.querySelectorAll(".dashboard-panel");
  const adminNavItem = document.getElementById("nav-item-admin");
  const userMgmtNavItem = document.getElementById("nav-item-user-management");

  // --- プロファイル要素 ---
  const profileDisplayNameInput = document.getElementById("profile-display-name");
  const profileEmailInput = document.getElementById("profile-email");
  const profileHandleInput = document.getElementById("profile-handle");
  const profileRoleInput = document.getElementById("profile-role");
  const saveProfileBtn = document.getElementById("save-profile-btn");

  // --- AI管理要素 ---
  const aiListContainer = document.getElementById("ai-list-container");
  const createAiForm = document.getElementById("create-ai-form");
  const editAiModal = document.getElementById("edit-ai-modal");
  const editAiForm = document.getElementById("edit-ai-form");
  const closeModalBtn = document.querySelector(".close");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");

  // --- ユーザー管理要素 ---
  const generateRoleInviteBtn = document.getElementById("generate-role-invite-btn");
  const invitationTargetRole = document.getElementById("invitation-target-role");
  const roleInviteDisplay = document.getElementById("role-invite-display");
  const newRoleInviteCode = document.getElementById("new-role-invite-code");
  const copyRoleInviteBtn = document.getElementById("copy-role-invite-btn");
  const useInviteBtn = document.getElementById("use-invite-btn");
  const useInvitationCodeInput = document.getElementById("use-invitation-code");
  const usersListContainer = document.getElementById("users-list-container");
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
    users: [],
    userRoles: [],
    isSuperAdmin: false,
    isOwner: false,
    aiList: [],
    currentEditingAi: null
  };

  // ================ トースト通知システム ================
  function showToast(message, type = 'info', duration = 4000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const iconMap = {
      success: '✓',
      error: '✗', 
      warning: '⚠',
      info: 'ℹ'
    };
    
    toast.innerHTML = `
      <div class="toast-content">
        <div class="toast-icon">${iconMap[type] || 'ℹ'}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" onclick="closeToast(this)">×</button>
      </div>
      <div class="toast-progress"></div>
    `;
    
    toastContainer.appendChild(toast);
    
    // アニメーション用にちょっと待つ
    setTimeout(() => {
      toast.classList.add('show');
    }, 100);
    
    // 自動で消える
    setTimeout(() => {
      closeToast(toast.querySelector('.toast-close'));
    }, duration);
    
    return toast;
  }

  function showSuccessToast(message, duration = 4000) {
    return showToast(message, 'success', duration);
  }

  function showErrorToast(message, duration = 6000) {
    return showToast(message, 'error', duration);
  }

  function showWarningToast(message, duration = 5000) {
    return showToast(message, 'warning', duration);
  }

  function showInfoToast(message, duration = 4000) {
    return showToast(message, 'info', duration);
  }

  // グローバル関数として定義（HTML onclick から呼び出される）
  window.closeToast = function(closeBtn) {
    const toast = closeBtn.closest('.toast');
    if (toast) {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 400);
    }
  };

  // ================ グローバルトースト関数 ================
  window.showToast = showToast;
  window.showSuccessToast = showSuccessToast;
  window.showErrorToast = showErrorToast;
  window.showWarningToast = showWarningToast;
  window.showInfoToast = showInfoToast;

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
      showErrorToast('メール認証に失敗しました: ' + (urlParams.get('message') || '不明なエラー'));
    } else if (urlParams.get('error') === 'invalid_token') {
      showErrorToast('無効なトークンです: ' + (urlParams.get('message') || '不明なエラー'));
    } else if (urlParams.get('error') === 'login_failed') {
      showErrorToast('ログインに失敗しました: ' + (urlParams.get('message') || '不明なエラー'));
    } else if (urlParams.get('auth') === 'verified') {
      showSuccessToast('メールアドレスの認証が完了しました。');
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
      // ユーザー名の表示（ハンドル形式を優先）
      const displayName = state.user.handle || `@${state.user.username}`;
      userDisplayNameEl.textContent = displayName;
      
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
      
      if (profileUsernameInput) {
        profileUsernameInput.value = state.user.username;
      }
      if (profileEmailInput) {
        profileEmailInput.value = state.user.email || '';
      }
      if (profileHandleInput) {
        profileHandleInput.value = state.user.handle || `@${state.user.username}`;
      }
      if (profileRoleInput) {
        profileRoleInput.value = state.user.roleDisplay || state.user.role || '閲覧者';
      }
      
      // プロファイル概要を更新
      const profileNameDisplay = document.getElementById('profile-name-display');
      if (profileNameDisplay) {
        profileNameDisplay.textContent = state.user.displayName || state.user.username;
      }
      
      const profileRoleDisplay = document.getElementById('profile-role-display');
      if (profileRoleDisplay) {
        profileRoleDisplay.textContent = state.user.roleDisplay || state.user.role || '閲覧者';
      }

      // ナビゲーション表示制御
      updateNavigationVisibility();
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
      showErrorToast(`AI一覧の取得に失敗しました: ${error.message}`);
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
        showSuccessToast(result.message);
        await fetchAiList();
        switchToPanel('panel-ai-list');
        createAiForm.reset();
        // Clear status message on success
        statusMessage.textContent = "";
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error("AI作成エラー:", error);
      showErrorToast(`AI作成エラー: ${error.message}`);
      // Clear status message on error
      statusMessage.textContent = "";
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
        showSuccessToast(result.message);
        await fetchAiList();
        editAiModal.style.display = "none";
        // Clear status message on success
        statusMessage.textContent = "";
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error("AI更新エラー:", error);
      showErrorToast(`AI更新エラー: ${error.message}`);
      // Clear status message on error
      statusMessage.textContent = "";
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
        showSuccessToast(result.message);
        await fetchAiList();
      } else {
        throw new Error(result.message);
      }
    } catch (error) {
      console.error("AI削除エラー:", error);
      showErrorToast(`AI削除エラー: ${error.message}`);
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

  // ================ ユーザー管理関数 ================
  function updateNavigationVisibility() {
    if (!state.user) return;
    
    // Legacy admin check
    const isAdmin = state.user.isAdmin || state.user.role === 'admin' || state.user.role === 'owner';
    const isOwner = state.user.isSuperAdmin || state.user.role === 'owner';
    
    // Admin panel (legacy compatibility)
    if (adminNavItem) {
      adminNavItem.style.display = isAdmin ? "block" : "none";
    }
    
    // User management panel (admin or owner only)
    if (userMgmtNavItem) {
      userMgmtNavItem.style.display = isAdmin ? "block" : "none";
    }
    
    // Update role-based UI elements
    updateRoleBasedUI();
  }

  function updateRoleBasedUI() {
    const isOwner = state.user?.role === 'owner' || state.user?.isSuperAdmin;
    const isAdmin = isOwner || state.user?.role === 'admin' || state.user?.isAdmin;
    
    // Show/hide invitation target roles based on user's role
    if (invitationTargetRole) {
      const options = invitationTargetRole.querySelectorAll('option');
      options.forEach(option => {
        if (option.value === 'owner' || option.value === 'admin') {
          option.style.display = isOwner ? 'block' : 'none';
        }
      });
    }
  }

  async function fetchUsers() {
    try {
      const response = await fetch('/api/roles/users', {
        credentials: 'include'
      });
      
      if (response.ok) {
        const result = await response.json();
        state.users = result.users || [];
        renderUsersList();
      } else {
        console.log('Cannot fetch users - insufficient permissions');
        state.users = [];
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }

  function renderUsersList() {
    if (!usersListContainer) return;
    
    usersListContainer.innerHTML = '';
    
    if (state.users.length === 0) {
      usersListContainer.innerHTML = `
        <div class="empty-state">
          <p>ユーザーが見つかりません。</p>
        </div>
      `;
      return;
    }

    state.users.forEach(user => {
      const userCard = document.createElement('div');
      userCard.className = 'user-card';
      
      const isCurrentUser = user.email === state.user?.email;
      const canChangeRole = state.user?.role === 'owner' && !isCurrentUser;
      
      userCard.innerHTML = `
        <div class="user-info">
          <div class="user-details">
            <h4>${escapeHtml(user.handle || '@' + user.username)}</h4>
            <p class="user-display-name">${escapeHtml(user.displayName || user.username)}</p>
            <p class="user-email">${escapeHtml(user.email)}</p>
          </div>
          <div class="user-role">
            <span class="role-badge role-${user.role}">${escapeHtml(user.roleDisplay)}</span>
            ${isCurrentUser ? '<span class="current-user-badge">（あなた）</span>' : ''}
          </div>
        </div>
        ${canChangeRole ? `
          <div class="user-actions">
            <select class="role-selector" data-user-email="${escapeHtml(user.email)}">
              <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>閲覧者</option>
              <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>編集者</option>
              <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>管理者</option>
              <option value="owner" ${user.role === 'owner' ? 'selected' : ''}>オーナー</option>
            </select>
            <button class="change-role-btn" data-user-email="${escapeHtml(user.email)}">変更</button>
          </div>
        ` : ''}
      `;
      
      usersListContainer.appendChild(userCard);
    });
    
    // Add event listeners for role changes
    const changeRoleBtns = usersListContainer.querySelectorAll('.change-role-btn');
    changeRoleBtns.forEach(btn => {
      btn.addEventListener('click', handleRoleChange);
    });
  }

  async function handleRoleChange(event) {
    const userEmail = event.target.dataset.userEmail;
    const selector = usersListContainer.querySelector(`select[data-user-email="${userEmail}"]`);
    const newRole = selector.value;
    
    if (!confirm(`このユーザーのロールを「${getRoleDisplayName(newRole)}」に変更しますか？`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/roles/users/${encodeURIComponent(userEmail)}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ role: newRole })
      });
      
      const result = await response.json();
      
      if (result.success) {
        showSuccessToast(result.message);
        await fetchUsers(); // Refresh the list
      } else {
        showErrorToast(result.message);
      }
    } catch (error) {
      console.error('Role change error:', error);
      showErrorToast('ロールの変更に失敗しました');
    }
  }

  function getRoleDisplayName(role) {
    const roleNames = {
      'viewer': '閲覧者',
      'editor': '編集者', 
      'admin': '管理者',
      'owner': 'オーナー'
    };
    return roleNames[role] || role;
  }
  function renderAdminList() {
    adminsListContainer.innerHTML = "";
    
    // Add help text at the top
    const helpDiv = document.createElement("div");
    helpDiv.className = "admin-help-text";
    helpDiv.innerHTML = `
      <div>
        <i class="fas fa-info-circle"></i>
        <strong>管理者リストについて:</strong>
        <ul style="margin: 0.5rem 0 0 1.5rem; padding-left: 1rem;">
          <li>リストの一番上の管理者が「最高管理者」として設定されます</li>
          <li>最高管理者は他の管理者の追加・削除・招待コード生成ができます</li>
          <li>管理者はAIの設定やプロファイルを編集できます</li>
          <li>表示名は管理者パネルでの識別用です</li>
        </ul>
      </div>
    `;
    adminsListContainer.appendChild(helpDiv);
    
    (state.admins || []).forEach((admin, index) => {
      const entryDiv = document.createElement("div");
      entryDiv.className = "admin-entry";
      entryDiv.setAttribute("draggable", state.isSuperAdmin);
      entryDiv.dataset.index = index;

      let html = `
        <div class="admin-field-group">
          <label for="admin-name-${index}">表示名</label>
          <input type="text" id="admin-name-${index}" class="admin-name" data-field="name" 
                 placeholder="表示名を入力してください" value="${admin.name || ""}"
                 ${!state.isSuperAdmin ? 'disabled' : ''}>
        </div>
        <div class="admin-field-group">
          <label for="admin-email-${index}">メールアドレス</label>
          <input type="email" id="admin-email-${index}" class="admin-email" data-field="email" 
                 placeholder="admin@example.com" value="${admin.email || ""}"
                 ${!state.isSuperAdmin ? 'disabled' : ''}>
        </div>
      `;

      if (index === 0) {
        entryDiv.classList.add("super-admin");
        html += `
          <div class="super-admin-label">
            <i class="fas fa-crown"></i>
            最高管理者
          </div>
        `;
      } else {
        html += `
          <div class="admin-role-badge admin">
            <i class="fas fa-user-shield"></i>
            管理者
          </div>
        `;
      }

      html += `
        <div class="admin-actions-buttons">
          ${state.isSuperAdmin && index > 0 ? '<button type="button" class="delete-btn">削除</button>' : ''}
        </div>
      `;

      // Add admin info display if available
      if (admin.username || admin.discordId) {
        html += `
          <div class="admin-info-display" style="grid-column: 1 / -1;">
            <div class="admin-info-label">追加情報:</div>
            ${admin.username ? `<div class="admin-info-item">
              <span class="admin-info-label">ユーザー名:</span>
              <span class="admin-info-value">@${admin.username}</span>
            </div>` : ''}
            ${admin.discordId ? `<div class="admin-info-item">
              <span class="admin-info-label">Discord ID:</span>
              <span class="admin-info-value">${admin.discordId}</span>
            </div>` : ''}
            ${admin.updatedAt ? `<div class="admin-info-item">
              <span class="admin-info-label">最終更新:</span>
              <span class="admin-info-value">${new Date(admin.updatedAt).toLocaleString('ja-JP')}</span>
            </div>` : ''}
          </div>
        `;
      }

      entryDiv.innerHTML = html;
      adminsListContainer.appendChild(entryDiv);
    });
  }

  // ================ データ取得関数 ================
  async function fetchSettings() {
    if (!state.user) return;
    
    // ローディング状態を表示（トーストではなく、通常のステータス）
    statusMessage.textContent = "読込中...";
    let settingsLoaded = false;

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
        
        settingsLoaded = true;
      } else if (tokaRes.status === 404) {
        // 初回セットアップの場合
        state.isSuperAdmin = true;
        adminNavItem.style.display = "block";
        profileDisplayNameInput.value = state.user.username || "";
        profileEmailInput.value = state.user.email || "";
        settingsLoaded = true;
      } else {
        const errData = await tokaRes.json().catch(() => ({}));
        throw new Error(errData.message || "設定の読み込みに失敗");
      }
    } catch (err) {
      showErrorToast(`設定の読み込みエラー: ${err.message}`);
      console.error("設定の読み込みエラー:", err);
    }

    // AI一覧を取得
    await fetchAiList();
    
    // ユーザー一覧を取得（管理者以上の場合）
    if (state.user?.isAdmin || state.user?.role === 'admin' || state.user?.role === 'owner') {
      await fetchUsers();
    }
    
    // 設定が正常に読み込まれた場合のみトースト通知を表示
    if (settingsLoaded) {
      showSuccessToast("設定を読み込みました。", 3000);
    }
    
    // ステータスメッセージをクリア
    statusMessage.textContent = "";
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
      showErrorToast("AI IDは英数字、ハイフン、アンダースコアのみ使用可能です。");
      return;
    }

    createAiForm.querySelector('button[type="submit"]').disabled = true;
    showInfoToast("AIを作成中...");

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
    showInfoToast("AIを更新中...");

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
      showInfoToast("プロファイルを更新中...");

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
        showSuccessToast(result.message);

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
              showSuccessToast("プロファイルとメールアドレスを更新しました。");
            } else {
              const emailError = await emailRes.json();
              showWarningToast(`プロファイルは更新されましたが、メールアドレスの更新に失敗: ${emailError.message}`);
            }
          } catch (emailError) {
            showWarningToast(`プロファイルは更新されましたが、メールアドレスの更新に失敗: ${emailError.message}`);
          }
        }

        await fetchSettings();
      } catch (err) {
        console.error("プロファイル更新エラー:", err);
        showErrorToast(`プロファイルの更新中にエラーが発生しました: ${err.message}`);
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
      showErrorToast(`招待コード生成エラー: ${err.message}`);
    } finally {
      generateInviteCodeBtn.disabled = false;
    }
  });

  copyInviteCodeBtn.addEventListener("click", () => {
    newInviteCodeInput.select();
    document.execCommand("copy");
    showSuccessToast("招待コードをコピーしました！");
  });

  saveAdminsBtn.addEventListener("click", async () => {
    if (!state.user || saveAdminsBtn.disabled) return;

    saveAdminsBtn.disabled = true;
    showInfoToast("管理者リストを保存中...");

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

      showSuccessToast(result.message);
      await fetchSettings();
    } catch (err) {
      showErrorToast(`管理者リスト保存エラー: ${err.message}`);
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
        showErrorToast("ユーザー名またはメールアドレス、パスワードを入力してください。");
        return;
      }
      
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      showInfoToast("ログイン中...");
      
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
          showSuccessToast(result.message);
          // ログイン成功時、少し待ってから認証状態をチェック
          setTimeout(() => {
            checkAuthStatus();
          }, 1000);
        } else {
          showErrorToast(result.message);
        }
      } catch (error) {
        console.error('ログインエラー:', error);
        showErrorToast('ログインに失敗しました。');
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
      const invitationCode = document.getElementById("register-invitation-code").value.trim();
      
      if (!username || !password || !email) {
        showErrorToast("すべての項目を入力してください。");
        return;
      }
      
      const submitBtn = registerForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      showInfoToast("アカウントを作成中...");
      
      try {
        const response = await fetch('/auth/register', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ 
            username, 
            password, 
            email,
            invitationCode: invitationCode || undefined
          })
        });
        
        const result = await response.json();
        
        if (result.success) {
          showSuccessToast(result.message);
          
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
          showErrorToast(result.message);
        }
      } catch (error) {
        console.error('登録エラー:', error);
        showErrorToast('アカウント作成に失敗しました。');
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
        showErrorToast("メールアドレスを入力してください。");
        return;
      }
      
      const submitBtn = passwordResetForm.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      showInfoToast("パスワード再設定メールを送信中...");
      
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
          showSuccessToast(result.message);
          // フォームをリセットしてログインフォームに戻る
          setTimeout(() => {
            passwordResetForm.reset();
            showLoginForm();
          }, 3000);
        } else {
          showErrorToast(result.message);
        }
      } catch (error) {
        console.error('パスワード再設定エラー:', error);
        showErrorToast('パスワード再設定に失敗しました。');
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (resendVerificationBtn) {
    resendVerificationBtn.addEventListener("click", async () => {
      const email = document.getElementById("verification-email").textContent;
      
      if (!email) {
        showErrorToast("メールアドレスが見つかりません。");
        return;
      }
      
      resendVerificationBtn.disabled = true;
      showInfoToast("認証メールを再送信中...");
      
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
          showSuccessToast(result.message);
        } else {
          showErrorToast(result.message);
        }
      } catch (error) {
        console.error('認証メール再送信エラー:', error);
        showErrorToast('認証メール再送信に失敗しました。');
      } finally {
        resendVerificationBtn.disabled = false;
      }
    });
  }

  // --- ユーザー管理関連 ---
  if (generateRoleInviteBtn) {
    generateRoleInviteBtn.addEventListener("click", async () => {
      if (!state.user) return;

      const targetRole = invitationTargetRole.value;
      generateRoleInviteBtn.disabled = true;

      try {
        const response = await fetch("/api/roles/invitation-codes", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: 'include',
          body: JSON.stringify({ targetRole: targetRole })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message);

        newRoleInviteCode.value = result.code;
        document.getElementById("invite-code-details").textContent = 
          `${result.targetRoleDisplay}用の招待コードです。7日間有効です。`;
        roleInviteDisplay.style.display = "flex";
        
        showSuccessToast(result.message);
      } catch (err) {
        showErrorToast(`招待コード生成エラー: ${err.message}`);
      } finally {
        generateRoleInviteBtn.disabled = false;
      }
    });
  }

  if (copyRoleInviteBtn) {
    copyRoleInviteBtn.addEventListener("click", () => {
      newRoleInviteCode.select();
      document.execCommand("copy");
      showSuccessToast("招待コードをコピーしました！");
    });
  }

  if (useInviteBtn) {
    useInviteBtn.addEventListener("click", async () => {
      const code = useInvitationCodeInput.value.trim();
      
      if (!code) {
        showErrorToast("招待コードを入力してください。");
        return;
      }

      useInviteBtn.disabled = true;
      showInfoToast("招待コードを確認中...");

      try {
        const response = await fetch("/api/roles/use-invitation-code", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: 'include',
          body: JSON.stringify({ code: code })
        });

        const result = await response.json();
        
        if (result.success) {
          showSuccessToast(result.message);
          useInvitationCodeInput.value = '';
          // Refresh user data
          setTimeout(() => {
            checkAuthStatus();
          }, 1000);
        } else {
          showErrorToast(result.message);
        }
      } catch (error) {
        console.error('招待コード使用エラー:', error);
        showErrorToast('招待コードの使用に失敗しました。');
      } finally {
        useInviteBtn.disabled = false;
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