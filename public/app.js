document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // DOM Elements
    const nicknamesListContainer = document.getElementById('nicknames-list-container');
    const addNicknameBtn = document.getElementById('add-nickname-btn');
    const adminsListContainer = document.getElementById('admins-list-container');
    const addAdminBtn = document.getElementById('add-admin-btn');
    const adminSettingsSection = document.getElementById('admin-settings-section'); // 管理者設定セクション
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const userEmailEl = document.getElementById('user-email');
    const statusMessage = document.getElementById('status-message');
    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const baseUserIdInput = document.getElementById('base-user-id-input');
    const promptTextarea = document.getElementById('prompt-textarea');
    const nameRecognitionCheckbox = document.getElementById('name-recognition-checkbox');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const saveBtn = document.getElementById('save-btn');
    const forgotPasswordLink = document.getElementById('forgot-password-link');

    auth.onAuthStateChanged(user => {
        if (user) {
            authContainer.style.display = 'none';
            mainContent.style.display = 'block';
            userEmailEl.textContent = user.email;
            fetchSettings(user);
        } else {
            authContainer.style.display = 'block';
            mainContent.style.display = 'none';
        }
    });

    loginBtn.addEventListener('click', () => {
        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        statusMessage.textContent = "";
        auth.signInWithEmailAndPassword(email, password)
            .catch(err => { statusMessage.textContent = `ログインエラー: IDまたはパスワードが違います。`; });
    });

    logoutBtn.addEventListener('click', () => auth.signOut());

    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        const email = loginEmailInput.value;
        if (!email) {
            statusMessage.textContent = 'パスワードをリセットするために、メールアドレスを入力してください。';
            return;
        }
        statusMessage.textContent = '送信中...';
        auth.sendPasswordResetEmail(email)
            .then(() => { statusMessage.textContent = `${email} にパスワード再設定用のメールを送信しました。`; })
            .catch(err => { statusMessage.textContent = `エラー: ${err.message}`; });
    });

    // --- ニックネームUI関連の関数 ---
    function createNicknameEntry(id = '', name = '') {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'nickname-entry';
        entryDiv.innerHTML = `
            <input type="text" class="nickname-id" placeholder="ユーザーID" value="${id}">
            <input type="text" class="nickname-name" placeholder="ニックネーム" value="${name}">
            <button type="button" class="delete-nickname-btn">削除</button>
        `;
        nicknamesListContainer.appendChild(entryDiv);
    }

    addNicknameBtn.addEventListener('click', () => createNicknameEntry());

    nicknamesListContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-nickname-btn')) {
            e.target.closest('.nickname-entry').remove();
        }
    });

    // --- 管理者UI関連の関数 ---
    function renderAdminList(emails = [], isSuperAdmin) {
        adminsListContainer.innerHTML = '';
        emails.forEach((email, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'admin-entry';
            
            let html = `<input type="email" class="admin-email" placeholder="管理者メールアドレス" value="${email}" ${!isSuperAdmin ? 'disabled' : ''}>`;
            
            if (index === 0) {
                entryDiv.classList.add('super-admin');
                html += `<span class="super-admin-label">👑 最高管理者</span>`;
            }
            
            html += `<button type="button" class="delete-admin-btn" ${!isSuperAdmin ? 'disabled' : ''}>削除</button>`;
            
            entryDiv.innerHTML = html;
            adminsListContainer.appendChild(entryDiv);
        });
        // 「管理者を追加」ボタンも権限に応じて無効化
        addAdminBtn.disabled = !isSuperAdmin;
    }
    
    addAdminBtn.addEventListener('click', () => {
         // この関数は renderAdminList に統合されたため、ここでは空の行を追加するだけ
        const entryDiv = document.createElement('div');
        entryDiv.className = 'admin-entry';
        entryDiv.innerHTML = `
            <input type="email" class="admin-email" placeholder="管理者メールアドレス" value="">
            <button type="button" class="delete-admin-btn">削除</button>
        `;
        adminsListContainer.appendChild(entryDiv);
    });
    
    adminsListContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-admin-btn')) {
            e.target.closest('.admin-entry').remove();
            // 削除後にリストを再描画して、最高管理者の表示を更新
            const currentEmails = Array.from(adminsListContainer.querySelectorAll('.admin-email')).map(input => input.value);
            const isSuperAdmin = !addAdminBtn.disabled; // 現在の権限状態を維持
            renderAdminList(currentEmails, isSuperAdmin);
        }
    });

    // (ドラッグ＆ドロップ関連の処理は変更なし)
    let draggedItem = null;
    // ...

    // --- 設定の読み込みと保存 ---
    async function fetchSettings(user) {
        statusMessage.textContent = '読込中...';
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/settings/toka', { headers: { 'Authorization': `Bearer ${token}` } });
            
            nicknamesListContainer.innerHTML = ''; 
            adminsListContainer.innerHTML = '';

            if (res.status === 404) {
                statusMessage.textContent = '設定はまだありません。';
                baseUserIdInput.value = '';
                promptTextarea.value = '';
                nameRecognitionCheckbox.checked = true;
                renderAdminList([user.email], true); // 初回は自分自身を最高管理者として表示
                return;
            }

            if (res.status === 403) {
                statusMessage.textContent = 'エラー: このページへのアクセス権がありません。';
                mainContent.innerHTML = '<h2>アクセスが拒否されました</h2>';
                return;
            }
            if (!res.ok) throw new Error('設定の読み込みに失敗しました');

            const data = await res.json();
            baseUserIdInput.value = data.baseUserId || '';
            promptTextarea.value = data.systemPrompt || '';
            nameRecognitionCheckbox.checked = data.enableNameRecognition ?? true;

            if (data.userNicknames) {
                for (const [id, name] of Object.entries(data.userNicknames)) {
                    createNicknameEntry(id, name);
                }
            }
            
            const isSuperAdmin = data.currentUser && data.currentUser.isSuperAdmin;
            renderAdminList(data.admins || [], isSuperAdmin);

            statusMessage.textContent = '設定を読み込みました';
        } catch (err) { statusMessage.textContent = `エラー: ${err.message}`; }
    }

    // (saveBtnの処理は変更なし)
    saveBtn.addEventListener('click', async () => { /* ... */ });
});