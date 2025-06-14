// =================================================================================
// アプリケーションの状態管理
// =================================================================================
let state = {
  admins: [],
  isSuperAdmin: false,
  scheduleItems: [],
  aiCharacters: [],
  currentUser: null,
  lastSync: null
};

// =================================================================================
// ユーティリティ関数とエラー処理
// =================================================================================
class APIError extends Error {
  constructor(message, status, retryable = false) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.retryable = retryable;
  }
}

function showStatusMessage(message, type = "info") {
  const statusElement = document.getElementById("status-message");
  if (!statusElement) return;

  statusElement.textContent = message;
  statusElement.className = `status-message ${type}`;

  if (type !== "error") {
    setTimeout(() => {
      if (statusElement.textContent === message) {
        statusElement.textContent = "";
      }
    }, 3000);
  }
}

const handleError = (error, context = '') => {
  console.error(`${context}エラー:`, error);
  let message = 'エラーが発生しました';
  
  if (error.code === 'permission-denied') {
    message = 'アクセス権限がありません';
  } else if (error.code === 'not-found') {
    message = '要求されたリソースが見つかりません';
  } else if (error.message) {
    message = error.message;
  }
  
  showStatusMessage(`${message}`, 'error');
};

async function retryOperation(operation, maxRetries = 3, delay = 2000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      if (error instanceof APIError && !error.retryable) {
        throw error;
      }
      
      if (i < maxRetries - 1) {
        console.log(`リトライ ${i + 1}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

// =================================================================================
// Firebase初期化
// =================================================================================
const initializeFirebase = () => {
  try {
    if (!firebase) {
      throw new Error('Firebase SDKが読み込まれていません');
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    if (!auth || !db) {
      throw new Error('Firebaseサービスの初期化に失敗しました');
    }

    // Firestoreの設定
    db.settings({
      cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
    });
    db.enablePersistence()
      .catch((err) => {
        if (err.code === 'failed-precondition') {
          console.warn('複数タブでの永続化に失敗しました');
        } else if (err.code === 'unimplemented') {
          console.warn('ブラウザが永続化に対応していません');
        }
      });

    return { auth, db };
  } catch (error) {
    console.error('Firebase初期化エラー:', error);
    showStatusMessage('システムの初期化に失敗しました', 'error');
    throw error;
  }
};

// =================================================================================
// APIリクエストの共通処理
// =================================================================================
// =================================================================================
// アプリケーションの状態管理
// =================================================================================
let state = {
  admins: [],
  isSuperAdmin: false,
  scheduleItems: [],
  aiCharacters: [],
  currentUser: null,
  lastSync: new Date("2025-06-14 04:31:42"),
  serverTime: new Date("2025-06-14 04:31:42")
};

// =================================================================================
// ユーティリティ関数とエラー処理
// =================================================================================
class APIError extends Error {
  constructor(message, status, retryable = false) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.retryable = retryable;
    this.timestamp = new Date("2025-06-14 04:31:42");
  }
}

function showStatusMessage(message, type = "info") {
  const statusElement = document.getElementById("status-message");
  if (!statusElement) return;

  statusElement.textContent = message;
  statusElement.className = `status-message ${type}`;

  if (type !== "error") {
    setTimeout(() => {
      if (statusElement.textContent === message) {
        statusElement.textContent = "";
      }
    }, 3000);
  }
}

const handleError = (error, context = '') => {
  console.error(`${context}エラー [${new Date("2025-06-14 04:31:42").toISOString()}]:`, error);
  let message = 'エラーが発生しました';
  
  if (error.code === 'permission-denied') {
    message = 'アクセス権限がありません。管理者に連絡してください。';
  } else if (error.code === 'not-found') {
    message = '要求されたリソースが見つかりません';
  } else if (error.message) {
    message = error.message;
  }
  
  showStatusMessage(`${message}`, 'error');
};

async function retryOperation(operation, maxRetries = 3, delay = 2000) {
  let lastError;
  
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.log(`[${new Date("2025-06-14 04:31:42").toISOString()}] 操作失敗 (${i + 1}/${maxRetries}):`, error.message);
      
      if (error instanceof APIError && !error.retryable) {
        throw error;
      }
      
      if (i < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
      }
    }
  }
  
  throw lastError;
}

// =================================================================================
// Firebase初期化
// =================================================================================
const initializeFirebase = () => {
  try {
    if (!firebase) {
      throw new Error('Firebase SDKが読み込まれていません');
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    const auth = firebase.auth();
    const db = firebase.firestore();

    if (!auth || !db) {
      throw new Error('Firebaseサービスの初期化に失敗しました');
    }

    // Firestoreの設定
    db.settings({
      cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED
    });
    db.enablePersistence({
      synchronizeTabs: true
    }).catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn('複数タブでの永続化に失敗しました');
      } else if (err.code === 'unimplemented') {
        console.warn('ブラウザが永続化に対応していません');
      }
    });

    return { auth, db };
  } catch (error) {
    console.error('Firebase初期化エラー:', error);
    showStatusMessage('システムの初期化に失敗しました', 'error');
    throw error;
  }
};

// =================================================================================
// APIリクエストの共通処理
// =================================================================================
async function fetchWithAuth(endpoint, options = {}) {
  try {
    const user = firebase.auth().currentUser;
    if (!user) {
      throw new APIError('認証されていません', 401, false);
    }

    // トークンの強制更新
    const token = await user.getIdToken(true);
    const response = await fetch(endpoint, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        'X-Request-Time': new Date("2025-06-14 04:31:42").toISOString()
      }
    });

    if (response.status === 502) {
      throw new APIError('サーバーが一時的に利用できません。しばらく待ってから再試行してください。', 502, true);
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      throw new APIError('サーバーが正しく応答していません（HTMLが返されました）', 500, true);
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new APIError(
        errorData.message || `APIエラー (${response.status})`, 
        response.status,
        response.status >= 500
      );
    }

    return await response.json();
  } catch (error) {
    console.error('API呼び出しエラー:', error);
    throw error;
  }
}

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
          baseUserId: "仮のID",
          systemPrompt: "デフォルトのプロンプトです。後で編集してください。",
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

        // 新しく作成したカードを自動的に編集モードにする
        const newCard = aiList.querySelector(
          `[data-ai-id="${savedCharacter.id}"]`
        );
        if (newCard) {
          toggleAIEditForm(newCard);
        }
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
      if (target.classList.contains("copy-command-btn")) {
        const commandText = target.previousElementSibling.textContent;
        try {
          await navigator.clipboard.writeText(commandText);
          showStatusMessage("コマンドをコピーしました", "success");
        } catch (err) {
          showStatusMessage("コマンドのコピーに失敗しました", "error");
        }
        return;
      }
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

  // ステータスメッセージの表示
  function showStatusMessage(message, type = "info") {
    const statusElement = document.getElementById("status-message");
    if (!statusElement) {
      console.error("ステータスメッセージ要素が見つかりません");
      return;
    }

    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;

    if (type !== "error") {
      setTimeout(() => {
        if (statusElement.textContent === message) {
          statusElement.textContent = "";
        }
      }, 3000);
    }
  }
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
