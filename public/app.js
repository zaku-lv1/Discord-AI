document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // DOM Elements
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterFormLink = document.getElementById('show-register-form-link');
    const showLoginFormLink = document.getElementById('show-login-form-link');
    const registerBtn = document.getElementById('register-btn');
    const generateInviteCodeBtn = document.getElementById('generate-invite-code-btn');
    const inviteCodeGeneratorSection = document.getElementById('invite-code-generator-section');
    const inviteCodeDisplay = document.getElementById('invite-code-display');
    const newInviteCodeInput = document.getElementById('new-invite-code');
    const copyInviteCodeBtn = document.getElementById('copy-invite-code-btn');
    const nicknamesListContainer = document.getElementById('nicknames-list-container');
    const addNicknameBtn = document.getElementById('add-nickname-btn');
    const adminsListContainer = document.getElementById('admins-list-container');
    const addAdminBtn = document.getElementById('add-admin-btn');
    const adminSettingsSection = document.getElementById('admin-settings-section');
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

    // UIの状態を管理するための変数
    let state = {
        admins: [],
        isSuperAdmin: false
    };
    
    // --- ログイン/登録フォームの切り替え ---
    showRegisterFormLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        statusMessage.textContent = '';
    });
    showLoginFormLink.addEventListener('click', (e) => {
        e.preventDefault();
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';
        statusMessage.textContent = '';
    });

    // --- 新規登録処理 ---
    registerBtn.addEventListener('click', async () => {
        const inviteCode = document.getElementById('register-invite-code').value.trim();
        const displayName = document.getElementById('register-display-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        
        statusMessage.textContent = '登録中...';
        registerBtn.disabled = true;
        try {
            const res = await fetch('/api/register-with-invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteCode, displayName, email, password })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || '登録に失敗しました。');
            
            statusMessage.textContent = result.message;
            document.getElementById('register-form').reset();
            showLoginFormLink.click();

        } catch (err) {
            statusMessage.textContent = `エラー: ${err.message}`;
        } finally {
            registerBtn.disabled = false;
        }
    });

    auth.onAuthStateChanged(user => {
        if (user) {
            authContainer.style.display = 'none';
            mainContent.style.display = 'block';
            fetchSettings(user);
        } else {
            authContainer.style.display = 'block';
            mainContent.style.display = 'none';
            loginForm.style.display = 'block';
            registerForm.style.display = 'none';
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

    // --- 招待コード生成 ---
    generateInviteCodeBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;
        generateInviteCodeBtn.disabled = true;
        statusMessage.textContent = '招待コードを生成中...';
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/generate-invite-code', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'コードの生成に失敗しました。');
            newInviteCodeInput.value = result.code;
            inviteCodeDisplay.style.display = 'flex';
            statusMessage.textContent = '新しい招待コードを生成しました。';
        } catch (err) {
            statusMessage.textContent = `エラー: ${err.message}`;
        } finally {
            generateInviteCodeBtn.disabled = false;
        }
    });
    copyInviteCodeBtn.addEventListener('click', () => {
        newInviteCodeInput.select();
        document.execCommand('copy');
        statusMessage.textContent = '招待コードをコピーしました！';
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
    function renderAdminList() {
        adminsListContainer.innerHTML = '';
        state.admins.forEach((admin, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'admin-entry';
            entryDiv.setAttribute('draggable', state.isSuperAdmin);
            entryDiv.dataset.index = index;
            let html = `
                <input type="text" class="admin-name" data-field="name" placeholder="表示名" value="${admin.name || ''}">
                <input type="email" class="admin-email" data-field="email" placeholder="管理者メールアドレス" value="${admin.email || ''}">
            `;
            if (index === 0) {
                entryDiv.classList.add('super-admin');
                html += `<span class="super-admin-label">👑</span>`;
            }
            html += `<button type="button" class="delete-admin-btn">削除</button>`;
            entryDiv.innerHTML = html;
            adminsListContainer.appendChild(entryDiv);
        });
    }
    addAdminBtn.addEventListener('click', () => {
        if (!state.isSuperAdmin) return;
        state.admins.push({ name: '', email: '' });
        renderAdminList();
    });
    adminsListContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-admin-btn')) {
            if (!state.isSuperAdmin) return;
            const entry = e.target.closest('.admin-entry');
            const index = parseInt(entry.dataset.index, 10);
            state.admins.splice(index, 1);
            renderAdminList();
        }
    });
    adminsListContainer.addEventListener('input', (e) => {
        const input = e.target;
        if (input.classList.contains('admin-name') || input.classList.contains('admin-email')) {
            const entry = input.closest('.admin-entry');
            const index = parseInt(entry.dataset.index, 10);
            const field = input.dataset.field;
            if (state.admins[index]) {
                state.admins[index][field] = input.value;
            }
        }
    });
    let draggedIndex = null;
    adminsListContainer.addEventListener('dragstart', (e) => { /* ... */ });
    adminsListContainer.addEventListener('dragend', (e) => { /* ... */ });
    adminsListContainer.addEventListener('drop', (e) => { /* ... */ });
    adminsListContainer.addEventListener('dragover', (e) => { /* ... */ });
    function getDragAfterElement(container, y) { /* ... */ }

    // --- 設定の読み込みと保存 ---
    async function fetchSettings(user) {
        statusMessage.textContent = '読込中...';
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/settings/toka', { headers: { 'Authorization': `Bearer ${token}` } });
            
            nicknamesListContainer.innerHTML = ''; 
            adminsListContainer.innerHTML = '';
            inviteCodeDisplay.style.display = 'none';

            if (res.status === 404) {
                statusMessage.textContent = '設定はまだありません。保存すると最初の管理者として登録されます。';
                baseUserIdInput.value = '';
                promptTextarea.value = '';
                nameRecognitionCheckbox.checked = true;
                state.admins = [{ name: '（自動登録）', email: user.email }];
                state.isSuperAdmin = true;
                userEmailEl.textContent = '（自動登録）';
                renderAdminList();
                return;
            }
            if (res.status === 403 || res.status === 401) {
                // ...
            }
            if (!res.ok) throw new Error('設定の読み込みに失敗しました');

            const data = await res.json();
            baseUserIdInput.value = data.baseUserId || '';
            promptTextarea.value = data.systemPrompt || '';
            nameRecognitionCheckbox.checked = data.enableNameRecognition ?? true;

            if (data.userNicknames) { /* ... */ }
            
            const currentUserAdminInfo = (data.admins || []).find(admin => admin.email === user.email);
            const displayName = currentUserAdminInfo && currentUserAdminInfo.name ? currentUserAdminInfo.name : user.email;
            userEmailEl.textContent = displayName;
            
            state.admins = data.admins || [];
            state.isSuperAdmin = data.currentUser && data.currentUser.isSuperAdmin;
            
            renderAdminList();

            const inviteGenerator = document.getElementById('invite-code-generator-section');
            const adminControlsSection = document.getElementById('admin-settings-section');
            if(state.isSuperAdmin){
                inviteGenerator.style.display = 'block';
                adminControlsSection.querySelectorAll('input, button').forEach(el => el.disabled = false);
            } else {
                inviteGenerator.style.display = 'none';
                adminControlsSection.querySelectorAll('input, button').forEach(el => el.disabled = true);
            }

            statusMessage.textContent = '設定を読み込みました';
        } catch (err) { statusMessage.textContent = `エラー: ${err.message}`; }
    }

    saveBtn.addEventListener('click', async () => {
        // ... (この関数は変更なし)
    });
});