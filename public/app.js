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
  const systemSettingsNavItem = document.getElementById("nav-item-system-settings");

  // --- プロファイル要素 ---
  const profileDisplayNameInput = document.getElementById("profile-display-name");
  const profileEmailInput = document.getElementById("profile-email");
  const profileHandleInput = document.getElementById("profile-handle");
  const profileRoleInput = document.getElementById("profile-role");
  const profileDiscordIdInput = document.getElementById("profile-discord-id");
  const saveProfileBtn = document.getElementById("save-profile-btn");

  // --- Discord ID管理要素 --- (Removed global Discord mapping, now AI-specific)

  // --- AI管理要素 ---
  const aiListContainer = document.getElementById("ai-list-container");
  const createAiForm = document.getElementById("create-ai-form");
  const editAiModal = document.getElementById("edit-ai-modal");
  const editAiForm = document.getElementById("edit-ai-form");
  const closeModalBtn = document.querySelector(".close");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");

  // --- AI固有ニックネーム管理要素 ---
  const editNewDiscordIdInput = document.getElementById("edit-new-discord-id");
  const editNewNicknameInput = document.getElementById("edit-new-nickname");
  const addAiNicknameBtn = document.getElementById("add-ai-nickname-btn");
  const aiNicknamesContainer = document.getElementById("ai-nicknames-container");

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

  // --- システム設定要素 ---
  const systemSettingsForm = document.getElementById("system-settings-form");
  const maintenanceModeToggle = document.getElementById("maintenance-mode");
  const maintenanceMessageInput = document.getElementById("maintenance-message");
  const requireInvitationCodesToggle = document.getElementById("require-invitation-codes");
  const allowOpenRegistrationToggle = document.getElementById("allow-open-registration");
  const ownershipTransferForm = document.getElementById("ownership-transfer-form");
  const newOwnerEmailInput = document.getElementById("new-owner-email");
  const confirmOwnerEmailInput = document.getElementById("confirm-owner-email");
  const transferConfirmationCheckbox = document.getElementById("transfer-confirmation");
  const maintenanceStatusEl = document.getElementById("maintenance-status");
  const registrationStatusEl = document.getElementById("registration-status");

  // ================ アプリケーションの状態 ================
  let state = {
    user: null,
    admins: [],
    users: [],
    userRoles: [],
    isSuperAdmin: false,
    isOwner: false,
    systemSettings: null,
    aiList: [],
    currentEditingAi: null,
    currentAiNicknames: {} // AI固有のニックネーム（編集中のAI用）
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
  
  // ================ グローバルシステム設定関数 ================
  window.checkSystemSettings = checkSystemSettings;

  // ================ 安全なJSON解析ヘルパー関数 ================
  /**
   * 安全にレスポンスをJSONとして解析する関数
   * 502エラーなどでHTMLが返される場合の対応
   */
  async function safeParseJSON(response) {
    try {
      // レスポンスのContent-Typeをチェック
      const contentType = response.headers.get('content-type');
      
      // レスポンスが2xx以外の場合の処理
      if (!response.ok) {
        // JSONレスポンスの場合は解析を試行
        if (contentType && contentType.includes('application/json')) {
          const data = await response.json();
          return { 
            success: false, 
            data: data,
            error: `HTTP ${response.status}: ${data.message || response.statusText}`,
            isJSON: true 
          };
        } else {
          // HTMLエラーページなどの場合
          const text = await response.text();
          return { 
            success: false, 
            data: null,
            error: `サーバーエラーが発生しました (HTTP ${response.status})`,
            isJSON: false,
            htmlContent: text
          };
        }
      }
      
      // 成功レスポンスの場合
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json();
        return { 
          success: true, 
          data: data,
          error: null,
          isJSON: true 
        };
      } else {
        // JSONでない成功レスポンス
        const text = await response.text();
        return { 
          success: false, 
          data: null,
          error: 'サーバーから予期しないレスポンスが返されました',
          isJSON: false,
          htmlContent: text
        };
      }
    } catch (parseError) {
      console.error('JSON解析エラー:', parseError);
      return { 
        success: false, 
        data: null,
        error: 'レスポンスの解析に失敗しました',
        isJSON: false,
        parseError: parseError
      };
    }
  }

  // ================ システム設定チェック ================
  async function checkSystemSettings() {
    try {
      const response = await fetch('/api/system-settings/status', {
        credentials: 'include'
      });
      const result = await safeParseJSON(response);
      
      if (result.success && result.data.success && result.data.status) {
        // Use the actual system setting for invitation code requirement
        updateInvitationCodeField(result.data.status.requireInvitationCodes);
      } else {
        console.error('システム設定の取得に失敗:', result.error);
        // エラー時はデフォルトとして必須にする（セキュリティ重視）
        updateInvitationCodeField(true);
      }
    } catch (error) {
      console.error('システム設定の取得に失敗:', error);
      // エラー時はデフォルトとして必須にする（セキュリティ重視）
      updateInvitationCodeField(true);
    }
  }

  function updateInvitationCodeField(required) {
    const invitationCodeGroup = document.querySelector('label[for="register-invitation-code"]').parentElement;
    const invitationCodeInput = document.getElementById('register-invitation-code');
    const smallText = invitationCodeGroup.querySelector('small');
    
    if (required) {
      // Show invitation code field as required
      invitationCodeGroup.style.display = 'block';
      invitationCodeInput.required = true;
      invitationCodeInput.placeholder = '招待コードを入力してください（必須）';
      smallText.textContent = '新規登録には招待コードが必要です。登録後は編集者権限が付与されます。';
      smallText.style.color = '#dc3545'; // 赤色で必須であることを強調
    } else {
      // Hide invitation code field when not required
      invitationCodeGroup.style.display = 'none';
      invitationCodeInput.required = false;
      invitationCodeInput.value = ''; // Clear any existing value
    }
  }

  // ================ 認証状態チェック ================
  async function checkAuthStatus() {
    try {
      console.log('[DEBUG] Checking authentication status...');
      
      const response = await fetch('/auth/user', {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });
      
      const result = await safeParseJSON(response);
      
      if (result.success && result.data.authenticated && result.data.user) {
        state.user = result.data.user;
        console.log('[DEBUG] User authenticated, showing main content...');
        showMainContent();
        await fetchSettings();
      } else {
        console.log('[DEBUG] User not authenticated, showing auth container...');
        if (!result.success && result.error) {
          console.error('[ERROR] Auth check failed:', result.error);
        }
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
      if (profileDiscordIdInput) {
        profileDiscordIdInput.value = state.user.discordId || '';
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

      const result = await safeParseJSON(response);
      
      if (result.success) {
        state.aiList = result.data;
        renderAiList();
      } else {
        console.error("AI一覧の取得に失敗:", result.error);
        state.aiList = [];
        renderAiList();
        
        // Only show error toast for unexpected errors, not auth failures
        if (!result.error.includes('401') && !result.error.includes('403')) {
          showErrorToast(`AI一覧の取得に失敗しました: ${result.error}`);
        }
      }
    } catch (error) {
      console.error("AI一覧の取得エラー:", error);
      state.aiList = [];
      renderAiList();
      showErrorToast('AI一覧の取得中にネットワークエラーが発生しました');
    }
  }

  function renderAiList() {
    aiListContainer.innerHTML = "";

    if (state.aiList.length === 0) {
      const canCreateAI = canUserEditAI();
      aiListContainer.innerHTML = `
        <div class="empty-state">
          <h3>AIがまだ作成されていません</h3>
          ${canCreateAI ? '<p>「AI作成」タブから新しいAIを作成してください。</p>' : '<p>AIの作成は編集者以上の権限が必要です。</p>'}
          ${canCreateAI ? '<button onclick="switchToPanel(\'panel-create-ai\')" class="save-btn">AIを作成する</button>' : ''}
        </div>
      `;
      return;
    }

    const aiGrid = document.createElement("div");
    aiGrid.className = "ai-grid";
    const canEdit = canUserEditAI();

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
        ${canEdit ? `<div class="ai-card-actions">
          <button class="secondary-btn" onclick="editAi('${escapeHtml(ai.id)}')">編集</button>
          <button class="delete-btn" onclick="deleteAi('${escapeHtml(ai.id)}', '${escapeHtml(ai.name)}')">削除</button>
        </div>` : ''}
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

      const result = await safeParseJSON(response);
      
      if (result.success && result.data.success) {
        showSuccessToast(result.data.message);
        await fetchAiList();
        switchToPanel('panel-ai-list');
        createAiForm.reset();
        // Clear status message on success
        statusMessage.textContent = "";
      } else {
        const errorMessage = result.data ? result.data.message : result.error;
        throw new Error(errorMessage);
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

      const result = await safeParseJSON(response);
      
      if (result.success && result.data.success) {
        showSuccessToast(result.data.message);
        await fetchAiList();
        editAiModal.style.display = "none";
        // Clear status message on success
        statusMessage.textContent = "";
      } else {
        const errorMessage = result.data ? result.data.message : result.error;
        throw new Error(errorMessage);
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

      const result = await safeParseJSON(response);
      
      if (result.success && result.data.success) {
        showSuccessToast(result.data.message);
        await fetchAiList();
      } else {
        const errorMessage = result.data ? result.data.message : result.error;
        throw new Error(errorMessage);
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
    document.getElementById("edit-ai-name-recognition").checked = ai.enableNameRecognition ?? true;
    document.getElementById("edit-ai-bot-response").checked = ai.enableBotMessageResponse ?? false;
    document.getElementById("edit-ai-reply-delay").value = ai.replyDelayMs || 0;
    document.getElementById("edit-ai-error-message").value = ai.errorOopsMessage || '';
    document.getElementById("edit-ai-system-prompt").value = ai.systemPrompt || '';

    // AI固有のニックネームを読み込み
    loadAiNicknames(aiId);

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

  // ================ 権限チェック関数 ================
  function canUserEditAI() {
    if (!state.user) return false;
    
    // Check if user has editor role or higher
    const userRole = state.user.role;
    const roleHierarchy = {
      'editor': 1,
      'owner': 2
    };
    
    const userLevel = roleHierarchy[userRole] || 0;
    const requiredLevel = roleHierarchy['editor'] || 1;
    
    return userLevel >= requiredLevel;
  }

  // ================ ユーザー管理関数 ================
  function updateNavigationVisibility() {
    if (!state.user) return;
    
    // Legacy admin check - now only owners have admin privileges
    const isAdmin = state.user.isAdmin || state.user.role === 'owner';
    const isOwner = state.user.isSuperAdmin || state.user.role === 'owner';
    const canEdit = canUserEditAI();
    
    // Control AI creation panel access
    const createAiNavItem = document.querySelector('a[data-target="panel-create-ai"]')?.parentElement;
    if (createAiNavItem) {
      createAiNavItem.style.display = canEdit ? "block" : "none";
    }
    
    // Admin panel (legacy compatibility)
    if (adminNavItem) {
      adminNavItem.style.display = isAdmin ? "block" : "none";
    }
    
    // User management panel (admin or owner only)
    if (userMgmtNavItem) {
      userMgmtNavItem.style.display = isAdmin ? "block" : "none";
    }
    
    // System settings panel (owner only)
    if (systemSettingsNavItem) {
      systemSettingsNavItem.style.display = isOwner ? "block" : "none";
    }
    
    // Update role-based UI elements
    updateRoleBasedUI();
  }

  function updateRoleBasedUI() {
    const isOwner = state.user?.role === 'owner' || state.user?.isSuperAdmin;
    
    // Show/hide invitation target roles based on user's role
    if (invitationTargetRole) {
      const options = invitationTargetRole.querySelectorAll('option');
      options.forEach(option => {
        if (option.value === 'owner') {
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
      
      const result = await safeParseJSON(response);
      
      if (result.success && result.data.users) {
        state.users = result.data.users || [];
        renderUsersList();
      } else {
        console.log('Cannot fetch users - insufficient permissions or error:', result.error);
        state.users = [];
        renderUsersList();
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      state.users = [];
      renderUsersList();
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
              <option value="editor" ${user.role === 'editor' ? 'selected' : ''}>編集者</option>
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
      
      const result = await safeParseJSON(response);
      
      if (result.success && result.data.success) {
        showSuccessToast(result.data.message);
        await fetchUsers(); // Refresh the list
      } else {
        const errorMessage = result.data ? result.data.message : result.error;
        showErrorToast(errorMessage || 'ロールの変更に失敗しました');
      }
    } catch (error) {
      console.error('Role change error:', error);
      showErrorToast('ロールの変更に失敗しました');
    }
  }

  function getRoleDisplayName(role) {
    const roleNames = {
      'editor': '編集者', 
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
      const aiRes = await fetch("/api/settings/ai", {
        credentials: 'include'
      });

      if (aiRes.status === 403 || aiRes.status === 401) {
        throw new Error("アクセスが拒否されました。");
      }

      if (aiRes.ok) {
        const data = await aiRes.json();
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
      } else if (aiRes.status === 404) {
        // 初回セットアップの場合
        state.isSuperAdmin = true;
        adminNavItem.style.display = "block";
        profileDisplayNameInput.value = state.user.username || "";
        profileEmailInput.value = state.user.email || "";
        settingsLoaded = true;
      } else {
        const errData = await aiRes.json().catch(() => ({}));
        throw new Error(errData.message || "設定の読み込みに失敗");
      }
    } catch (err) {
      showErrorToast(`設定の読み込みエラー: ${err.message}`);
      console.error("設定の読み込みエラー:", err);
    }

    // AI一覧を取得
    await fetchAiList();
    
    // ユーザー一覧を取得（オーナーのみ）
    if (state.user?.role === 'owner') {
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
  // 初期化時に認証状態とシステム設定をチェック
  checkAuthStatus();
  checkSystemSettings();

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
        const newDiscordId = profileDiscordIdInput.value.trim();

        const res = await fetch("/api/update-profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          credentials: 'include',
          body: JSON.stringify({ 
            displayName: newDisplayName,
            discordId: newDiscordId 
          }),
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

  // ================ AI固有ニックネーム管理機能 ================
  
  // AI固有ニックネーム読み込み
  async function loadAiNicknames(aiId) {
    try {
      const res = await fetch(`/api/ais/${aiId}/nicknames`, {
        method: 'GET',
        credentials: 'include'
      });
      
      if (!res.ok) {
        throw new Error('AI固有ニックネームの読み込みに失敗しました');
      }
      
      const data = await res.json();
      state.currentAiNicknames = data.nicknames || {};
      renderAiNicknames();
    } catch (error) {
      console.error('AI固有ニックネーム読み込みエラー:', error);
      showErrorToast(`AI固有ニックネームの読み込みに失敗しました: ${error.message}`);
    }
  }
  
  // AI固有ニックネームリストの描画
  function renderAiNicknames() {
    if (!aiNicknamesContainer) return;
    
    const nicknames = state.currentAiNicknames;
    const nicknameKeys = Object.keys(nicknames);
    
    if (nicknameKeys.length === 0) {
      aiNicknamesContainer.innerHTML = `
        <div class="empty-nicknames">
          <i class="fas fa-users" style="font-size: 2rem; color: var(--text-secondary); margin-bottom: 1rem;"></i>
          <p>まだニックネームが登録されていません</p>
        </div>
      `;
      return;
    }
    
    aiNicknamesContainer.innerHTML = nicknameKeys.map(discordId => {
      const nickname = nicknames[discordId];
      
      return `
        <div class="nickname-item" data-discord-id="${discordId}">
          <div class="nickname-info">
            <div class="discord-id">${discordId}</div>
            <div class="nickname">${nickname.nickname}</div>
          </div>
          <div class="nickname-actions">
            <button type="button" class="secondary-btn edit-ai-nickname-btn" data-discord-id="${discordId}">
              <i class="fas fa-edit"></i> 編集
            </button>
            <button type="button" class="secondary-btn delete-ai-nickname-btn" data-discord-id="${discordId}">
              <i class="fas fa-trash"></i> 削除
            </button>
          </div>
        </div>
      `;
    }).join('');
  }
  
  // AI固有ニックネーム追加
  if (addAiNicknameBtn) {
    addAiNicknameBtn.addEventListener('click', async () => {
      const discordId = editNewDiscordIdInput.value.trim();
      const nickname = editNewNicknameInput.value.trim();
      
      if (!discordId || !nickname) {
        showWarningToast('Discord IDとニックネームを入力してください');
        return;
      }
      
      if (!/^\d{17,19}$/.test(discordId)) {
        showWarningToast('Discord IDは17-19桁の数字である必要があります');
        return;
      }
      
      if (!state.currentEditingAi) {
        showErrorToast('編集中のAIが見つかりません');
        return;
      }
      
      try {
        addAiNicknameBtn.disabled = true;
        showInfoToast('ニックネームを追加中...');
        
        const res = await fetch(`/api/ais/${state.currentEditingAi.id}/nicknames`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({
            discordId: discordId,
            nickname: nickname
          })
        });
        
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.message || 'ニックネームの追加に失敗しました');
        }
        
        const data = await res.json();
        state.currentAiNicknames = data.nicknames;
        renderAiNicknames();
        
        // 入力欄をクリア
        editNewDiscordIdInput.value = '';
        editNewNicknameInput.value = '';
        
        showSuccessToast('ニックネームを追加しました');
      } catch (error) {
        console.error('AI固有ニックネーム追加エラー:', error);
        showErrorToast(`ニックネームの追加に失敗しました: ${error.message}`);
      } finally {
        addAiNicknameBtn.disabled = false;
      }
    });
  }
  
  // AI固有ニックネームの編集・削除
  if (aiNicknamesContainer) {
    aiNicknamesContainer.addEventListener('click', async (e) => {
      const discordId = e.target.closest('[data-discord-id]')?.dataset.discordId;
      if (!discordId || !state.currentEditingAi) return;
      
      if (e.target.classList.contains('edit-ai-nickname-btn') || e.target.closest('.edit-ai-nickname-btn')) {
        // 編集
        const currentNickname = state.currentAiNicknames[discordId]?.nickname || '';
        const newNickname = prompt('新しいニックネームを入力してください:', currentNickname);
        
        if (!newNickname || newNickname.trim() === currentNickname) {
          return;
        }
        
        try {
          showInfoToast('ニックネームを更新中...');
          
          const res = await fetch(`/api/ais/${state.currentEditingAi.id}/nicknames/${discordId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
              nickname: newNickname.trim()
            })
          });
          
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message || 'ニックネームの更新に失敗しました');
          }
          
          const data = await res.json();
          state.currentAiNicknames = data.nicknames;
          renderAiNicknames();
          showSuccessToast('ニックネームを更新しました');
        } catch (error) {
          console.error('AI固有ニックネーム更新エラー:', error);
          showErrorToast(`ニックネームの更新に失敗しました: ${error.message}`);
        }
      } else if (e.target.classList.contains('delete-ai-nickname-btn') || e.target.closest('.delete-ai-nickname-btn')) {
        // 削除確認
        const nickname = state.currentAiNicknames[discordId];
        if (!confirm(`Discord ID "${discordId}" (${nickname.nickname}) を削除しますか？`)) {
          return;
        }
        
        try {
          showInfoToast('ニックネームを削除中...');
          
          const res = await fetch(`/api/ais/${state.currentEditingAi.id}/nicknames/${discordId}`, {
            method: 'DELETE',
            credentials: 'include'
          });
          
          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.message || 'ニックネームの削除に失敗しました');
          }
          
          const data = await res.json();
          state.currentAiNicknames = data.nicknames;
          renderAiNicknames();
          showSuccessToast('ニックネームを削除しました');
        } catch (error) {
          console.error('AI固有ニックネーム削除エラー:', error);
          showErrorToast(`ニックネームの削除に失敗しました: ${error.message}`);
        }
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
        showErrorToast("ハンドル名またはメールアドレス、パスワードを入力してください。");
        return;
      }
      
      // Validate input format and normalize username
      const isEmail = username.includes('@') && username.includes('.');
      const isHandle = username.startsWith('@');
      const isPlainUsername = !isEmail && !isHandle && username.length >= 3;
      
      // Auto-format plain username as handle by adding @ prefix
      let loginUsername = username;
      if (isPlainUsername) {
        // Validate plain username format (alphanumeric, underscore, hyphen only)
        if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
          showErrorToast("ユーザー名は英数字、アンダースコア、ハイフンのみ使用可能です。");
          return;
        }
        loginUsername = '@' + username;
      } else if (!isEmail && !isHandle) {
        showErrorToast("メールアドレス（例: user@example.com）、ハンドル（例: @username）、またはユーザー名（例: username）を入力してください。");
        return;
      }
      
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>ログイン中...';
      
      // Show loader container for better visual feedback
      if (loaderContainer) {
        loaderContainer.style.display = "flex";
      }
      
      try {
        const response = await fetch('/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ username: loginUsername, password })
        });
        
        const result = await safeParseJSON(response);
        
        if (result.success && result.data.success) {
          showSuccessToast("ログインしました。ダッシュボードに移動しています...");
          
          // Store login state for debugging
          console.log('[DEBUG] Login successful, checking auth status...');
          
          // Clear any existing error parameters from URL
          const currentUrl = new URL(window.location);
          currentUrl.search = '';
          window.history.replaceState({}, '', currentUrl);
          
          // Immediately check auth status without delay for faster redirect
          try {
            await checkAuthStatus();
            
            // If we're still showing auth container after first check, try again
            if (authContainer.style.display !== 'none') {
              console.log('[DEBUG] First auth check failed, retrying...');
              setTimeout(async () => {
                await checkAuthStatus();
              }, 1000);
            }
          } catch (authError) {
            console.error('[ERROR] Auth status check failed:', authError);
            showErrorToast('ログイン後の認証確認に失敗しました。ページを再読み込みしてください。');
          }
        } else {
          const errorMessage = result.data ? result.data.message : result.error;
          showErrorToast(errorMessage || 'ログインに失敗しました。');
        }
      } catch (error) {
        console.error('ログインエラー:', error);
        if (error.message && error.message.includes('502')) {
          showErrorToast('サーバーに接続できません。しばらく待ってから再試行してください。');
        } else {
          showErrorToast('ログインに失敗しました。ネットワーク接続を確認してください。');
        }
      } finally {
        // Always hide loader and restore button
        if (loaderContainer) {
          loaderContainer.style.display = "none";
        }
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
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
      const invitationCodeInput = document.getElementById("register-invitation-code");
      
      if (!username || !password || !email) {
        showErrorToast("すべての項目を入力してください。");
        return;
      }
      
      // Check if invitation code is required and provided
      if (invitationCodeInput.required && !invitationCode) {
        showErrorToast("招待コードは必須です。");
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
        
        const result = await safeParseJSON(response);
        
        if (result.success && result.data.success) {
          showSuccessToast(result.data.message);
          
          if (result.data.requiresVerification) {
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
          const errorMessage = result.data ? result.data.message : result.error;
          showErrorToast(errorMessage || 'アカウント作成に失敗しました。');
        }
      } catch (error) {
        console.error('登録エラー:', error);
        if (error.message && error.message.includes('502')) {
          showErrorToast('サーバーに接続できません。しばらく待ってから再試行してください。');
        } else {
          showErrorToast('アカウント作成に失敗しました。ネットワーク接続を確認してください。');
        }
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
        
        const result = await safeParseJSON(response);
        
        if (result.success && result.data.success) {
          showSuccessToast(result.data.message);
          // フォームをリセットしてログインフォームに戻る
          setTimeout(() => {
            passwordResetForm.reset();
            showLoginForm();
          }, 3000);
        } else {
          const errorMessage = result.data ? result.data.message : result.error;
          showErrorToast(errorMessage || 'パスワード再設定に失敗しました。');
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
        
        const result = await safeParseJSON(response);
        
        if (result.success && result.data.success) {
          showSuccessToast(result.data.message);
        } else {
          const errorMessage = result.data ? result.data.message : result.error;
          showErrorToast(errorMessage || '認証メール再送信に失敗しました。');
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

        const result = await safeParseJSON(response);
        if (!result.success) throw new Error(result.data ? result.data.message : result.error);

        newRoleInviteCode.value = result.data.code;
        document.getElementById("invite-code-details").textContent = 
          `${result.data.targetRoleDisplay}用の招待コードです。7日間有効です。`;
        roleInviteDisplay.style.display = "flex";
        
        showSuccessToast(result.data.message);
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

        const result = await safeParseJSON(response);
        
        if (result.success && result.data.success) {
          showSuccessToast(result.data.message);
          useInvitationCodeInput.value = '';
          // Refresh user data
          setTimeout(() => {
            checkAuthStatus();
          }, 1000);
        } else {
          const errorMessage = result.data ? result.data.message : result.error;
          showErrorToast(errorMessage || '招待コードの使用に失敗しました');
        }
      } catch (error) {
        console.error('招待コード使用エラー:', error);
        showErrorToast('招待コードの使用に失敗しました。');
      } finally {
        useInviteBtn.disabled = false;
      }
    });
  }

  // ================ システム設定管理 ================
  
  // システム設定の読み込み
  async function loadSystemSettings() {
    if (!state.user || !state.user.isSuperAdmin) return;
    
    try {
      const response = await fetch('/api/system-settings', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await safeParseJSON(response);
      
      if (result.success && result.data.settings) {
        state.systemSettings = result.data.settings;
        updateSystemSettingsDisplay();
        updateSystemStatusDisplay();
      } else {
        const errorMessage = result.data ? result.data.message : result.error;
        showErrorToast(errorMessage || 'システム設定の読み込みに失敗しました');
      }
    } catch (error) {
      console.error('システム設定読み込みエラー:', error);
      showErrorToast('システム設定の読み込み中にエラーが発生しました');
    }
  }
  
  // システム設定表示の更新
  function updateSystemSettingsDisplay() {
    if (!state.systemSettings) return;
    
    const settings = state.systemSettings;
    
    if (maintenanceModeToggle) {
      maintenanceModeToggle.checked = settings.maintenanceMode || false;
    }
    
    if (maintenanceMessageInput) {
      maintenanceMessageInput.value = settings.maintenanceMessage || '';
    }
    
    // Remove invitation codes toggle - they are always required
    if (requireInvitationCodesToggle) {
      requireInvitationCodesToggle.checked = true;
      requireInvitationCodesToggle.disabled = true; // Disable the toggle
      const toggleContainer = requireInvitationCodesToggle.parentElement;
      if (toggleContainer) {
        const label = toggleContainer.querySelector('label');
        if (label && !label.textContent.includes('常時有効')) {
          label.innerHTML += ' <small class="text-muted">(常時有効)</small>';
        }
      }
    }
    
    if (allowOpenRegistrationToggle) {
      allowOpenRegistrationToggle.checked = false; // Always false since invitation codes are required
      allowOpenRegistrationToggle.disabled = true; // Disable the toggle
      const toggleContainer = allowOpenRegistrationToggle.parentElement;
      if (toggleContainer) {
        const label = toggleContainer.querySelector('label');
        if (label && !label.textContent.includes('招待コード必須')) {
          label.innerHTML += ' <small class="text-muted">(招待コード必須のため無効)</small>';
        }
      }
    }
  }
  
  // システム状態表示の更新
  function updateSystemStatusDisplay() {
    if (!state.systemSettings) return;
    
    const settings = state.systemSettings;
    
    if (maintenanceStatusEl) {
      const isMaintenanceMode = settings.maintenanceMode;
      maintenanceStatusEl.textContent = isMaintenanceMode ? 'メンテナンス中' : '正常稼働中';
      maintenanceStatusEl.className = isMaintenanceMode ? 'status-maintenance' : 'status-active';
    }
    
    if (registrationStatusEl) {
      const requiresInvitation = settings.requireInvitationCodes;
      const allowsRegistration = settings.allowOpenRegistration !== false;
      
      if (!allowsRegistration) {
        registrationStatusEl.textContent = '登録停止中';
        registrationStatusEl.className = 'status-error';
      } else if (requiresInvitation) {
        registrationStatusEl.textContent = '招待コード必須';
        registrationStatusEl.className = 'status-inactive';
      } else {
        registrationStatusEl.textContent = 'オープン登録';
        registrationStatusEl.className = 'status-active';
      }
    }
  }
  
  // システム設定フォームの送信
  if (systemSettingsForm) {
    systemSettingsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!state.user || !state.user.isSuperAdmin) {
        showErrorToast('この操作にはオーナー権限が必要です');
        return;
      }
      
      const submitBtn = systemSettingsForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      
      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>保存中...';
        
        const settings = {
          maintenanceMode: maintenanceModeToggle.checked,
          maintenanceMessage: maintenanceMessageInput.value.trim(),
          // Invitation codes and open registration are fixed server-side
          requireInvitationCodes: true, 
          allowOpenRegistration: false
        };
        
        const response = await fetch('/api/system-settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
        
        const result = await safeParseJSON(response);
        
        if (result.success) {
          state.systemSettings = { ...state.systemSettings, ...settings };
          updateSystemStatusDisplay();
          showSuccessToast('システム設定を保存しました');
        } else {
          const errorMessage = result.data ? result.data.message : result.error;
          showErrorToast(errorMessage || 'システム設定の保存に失敗しました');
        }
      } catch (error) {
        console.error('システム設定保存エラー:', error);
        showErrorToast('システム設定の保存中にエラーが発生しました');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }
  
  // オーナー権限移譲フォームの送信
  if (ownershipTransferForm) {
    ownershipTransferForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      if (!state.user || !state.user.isSuperAdmin) {
        showErrorToast('この操作にはオーナー権限が必要です');
        return;
      }
      
      const newOwnerEmail = newOwnerEmailInput.value.trim();
      const confirmEmail = confirmOwnerEmailInput.value.trim();
      const confirmed = transferConfirmationCheckbox.checked;
      
      if (!newOwnerEmail || !confirmEmail) {
        showErrorToast('全ての項目を入力してください');
        return;
      }
      
      if (newOwnerEmail !== confirmEmail) {
        showErrorToast('メールアドレスが一致しません');
        return;
      }
      
      if (!confirmed) {
        showErrorToast('移譲の確認にチェックを入れてください');
        return;
      }
      
      if (newOwnerEmail === state.user.email) {
        showErrorToast('自分自身に権限を移譲することはできません');
        return;
      }
      
      // 最終確認
      const confirmTransfer = confirm(
        `本当にオーナー権限を ${newOwnerEmail} に移譲しますか？\n\n` +
        'この操作は取り消すことができません。\n' +
        'あなたは管理者に降格されます。'
      );
      
      if (!confirmTransfer) return;
      
      const submitBtn = ownershipTransferForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.innerHTML;
      
      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-right: 8px;"></i>移譲中...';
        
        const response = await fetch('/api/system-settings/transfer-ownership', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newOwnerEmail: newOwnerEmail,
            confirmEmail: confirmEmail
          })
        });
        
        const result = await safeParseJSON(response);
        
        if (result.success) {
          showSuccessToast('オーナー権限の移譲が完了しました。ページを再読み込みします。');
          
          // フォームをリセット
          ownershipTransferForm.reset();
          
          // 5秒後にページを再読み込み
          setTimeout(() => {
            window.location.reload();
          }, 5000);
        } else {
          const errorMessage = result.data ? result.data.message : result.error;
          showErrorToast(errorMessage || 'オーナー権限の移譲に失敗しました');
        }
      } catch (error) {
        console.error('オーナー権限移譲エラー:', error);
        showErrorToast('オーナー権限の移譲中にエラーが発生しました');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
      }
    });
  }
  
  // パネル切り替え時にシステム設定を読み込む
  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const target = e.target.dataset.target;
      if (target === 'panel-system-settings' && state.user && state.user.isSuperAdmin) {
        setTimeout(() => {
          loadSystemSettings();
        }, 100);
      }
    });
  });
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
  
  // Check system settings to update invitation code field visibility
  checkSystemSettings();
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