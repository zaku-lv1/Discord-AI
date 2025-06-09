document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // --- DOM Elements ---
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterFormLink = document.getElementById('show-register-form-link');
    const showLoginFormLink = document.getElementById('show-login-form-link');
    const registerBtn = document.getElementById('register-btn');
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const userEmailEl = document.getElementById('user-email');
    const statusMessage = document.getElementById('status-message');
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    
    // Dashboard Nav
    const navLinks = document.querySelectorAll('.nav-link');
    const panels = document.querySelectorAll('.dashboard-panel');
    const adminNavItem = document.getElementById('nav-item-admin');
    
    // Toka Panel
    const baseUserIdInput = document.getElementById('base-user-id-input');
    const promptTextarea = document.getElementById('prompt-textarea');
    const nameRecognitionCheckbox = document.getElementById('name-recognition-checkbox');
    const nicknamesListContainer = document.getElementById('nicknames-list-container');
    const addNicknameBtn = document.getElementById('add-nickname-btn');
    const saveTokaBtn = document.getElementById('save-toka-btn');
    
    // Schedule Panel
    const remindersEnabledCheckbox = document.getElementById('reminders-enabled-checkbox');
    const googleSheetIdInput = document.getElementById('google-sheet-id-input');
    const reminderGuildIdInput = document.getElementById('reminder-guild-id-input');
    const reminderRoleIdInput = document.getElementById('reminder-role-id-input');
    const serviceAccountJsonTextarea = document.getElementById('service-account-json-textarea');
    const saveScheduleBtn = document.getElementById('save-schedule-btn');

    // Admin Panel
    const inviteCodeGeneratorSection = document.getElementById('invite-code-generator-section');
    const generateInviteCodeBtn = document.getElementById('generate-invite-code-btn');
    const inviteCodeDisplay = document.getElementById('invite-code-display');
    const newInviteCodeInput = document.getElementById('new-invite-code');
    const copyInviteCodeBtn = document.getElementById('copy-invite-code-btn');
    const adminsListContainer = document.getElementById('admins-list-container');
    const addAdminBtn = document.getElementById('add-admin-btn');
    const saveAdminsBtn = document.getElementById('save-admins-btn');

    // UIの状態を管理するための変数
    let state = {
        admins: [],
        isSuperAdmin: false
    };

    // --- ナビゲーションロジック ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.dataset.target;
            navLinks.forEach(l => l.classList.remove('active'));
            panels.forEach(p => p.style.display = 'none');
            link.classList.add('active');
            document.getElementById(targetId).style.display = 'block';
        });
    });

    // --- 認証関連 ---
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
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        auth.signInWithEmailAndPassword(email, password).catch(err => { statusMessage.textContent = `ログインエラー: ${err.message}`; });
    });

    logoutBtn.addEventListener('click', () => auth.signOut());

    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        if (!email) { statusMessage.textContent = 'メールアドレスを入力してください。'; return; }
        auth.sendPasswordResetEmail(email)
            .then(() => { statusMessage.textContent = `${email} にパスワード再設定用のメールを送信しました。`; })
            .catch(err => { statusMessage.textContent = `エラー: ${err.message}`; });
    });

    // --- 新規登録と招待コード ---
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

    generateInviteCodeBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;
        generateInviteCodeBtn.disabled = true;
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/generate-invite-code', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
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


    // --- 設定全体の読み込み ---
    async function fetchSettings(user) {
        statusMessage.textContent = '読込中...';
        try {
            const token = await user.getIdToken();
            const [tokaRes, scheduleRes] = await Promise.all([
                fetch('/api/settings/toka', { headers: { 'Authorization': `Bearer ${token}` } }),
                fetch('/api/settings/schedule', { headers: { 'Authorization': `Bearer ${token}` } })
            ]);

            // エラー処理
            if (tokaRes.status === 403 || tokaRes.status === 401) {
                mainContent.innerHTML = `<h2>アクセスが拒否されました</h2><p>あなたのアカウント(${user.email})には、この設定パネルを閲覧・編集する権限がありません。</p><button id="logout-btn-fallback">ログアウト</button>`;
                document.getElementById('logout-btn-fallback').addEventListener('click', () => auth.signOut());
                return;
            }

            // とーか設定の反映
            if (tokaRes.ok) {
                const data = await tokaRes.json();
                baseUserIdInput.value = data.baseUserId || '';
                promptTextarea.value = data.systemPrompt || '';
                nameRecognitionCheckbox.checked = data.enableNameRecognition ?? true;
                
                nicknamesListContainer.innerHTML = '';
                if(data.userNicknames) {
                    for (const [id, name] of Object.entries(data.userNicknames)) {
                        createNicknameEntry(id, name);
                    }
                }
                
                const currentUserAdminInfo = (data.admins || []).find(admin => admin.email === user.email);
                const displayName = currentUserAdminInfo ? (currentUserAdminInfo.name || user.email) : user.email;
                userEmailEl.textContent = displayName;
                
                state.admins = data.admins || [];
                state.isSuperAdmin = data.currentUser && data.currentUser.isSuperAdmin;

                adminNavItem.style.display = state.isSuperAdmin ? 'block' : 'none';
                renderAdminList();
            } else if (tokaRes.status === 404) {
                 // とーか初回設定
                userEmailEl.textContent = user.displayName || user.email;
                state.admins = [{ name: user.displayName || '管理者', email: user.email }];
                state.isSuperAdmin = true;
                adminNavItem.style.display = 'block';
                renderAdminList();
            }

            // スケジュール設定の反映
            if (scheduleRes.ok) {
                const data = await scheduleRes.json();
                remindersEnabledCheckbox.checked = data.remindersEnabled ?? false;
                googleSheetIdInput.value = data.googleSheetId || '';
                reminderGuildIdInput.value = data.reminderGuildId || '';
                reminderRoleIdInput.value = data.reminderRoleId || '';
                serviceAccountJsonTextarea.value = data.googleServiceAccountJson || '';
            }

            statusMessage.textContent = '設定を読み込みました';
        } catch (err) {
            statusMessage.textContent = `エラー: ${err.message}`;
        }
    }

    // --- 各種保存ボタンの処理 ---
    saveTokaBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user || saveTokaBtn.disabled) return;
        statusMessage.textContent = 'とーか設定を保存中...';
        saveTokaBtn.disabled = true;
        try {
            const token = await user.getIdToken();
            const nicknamesObject = {};
            document.querySelectorAll('.nickname-entry').forEach(entry => {
                const id = entry.querySelector('.nickname-id').value.trim();
                const name = entry.querySelector('.nickname-name').value.trim();
                if (id) nicknamesObject[id] = name;
            });
            const settings = {
                baseUserId: baseUserIdInput.value,
                systemPrompt: promptTextarea.value,
                enableNameRecognition: nameRecognitionCheckbox.checked,
                userNicknames: nicknamesObject,
            };
            const res = await fetch('/api/settings/toka', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(settings)
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

    saveScheduleBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user || saveScheduleBtn.disabled) return;
        statusMessage.textContent = 'スケジュール設定を保存中...';
        saveScheduleBtn.disabled = true;
        try {
            const token = await user.getIdToken();
            const settings = {
                remindersEnabled: remindersEnabledCheckbox.checked,
                googleSheetId: googleSheetIdInput.value,
                reminderGuildId: reminderGuildIdInput.value,
                reminderRoleId: reminderRoleIdInput.value,
                googleServiceAccountJson: serviceAccountJsonTextarea.value,
            };
            const res = await fetch('/api/settings/schedule', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(settings)
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);
            statusMessage.textContent = result.message;
        } catch (err) {
            statusMessage.textContent = `エラー: ${err.message}`;
        } finally {
            saveScheduleBtn.disabled = false;
        }
    });

    saveAdminsBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user || saveAdminsBtn.disabled) return;
        statusMessage.textContent = '管理者リストを保存中...';
        saveAdminsBtn.disabled = true;
        try {
            const token = await user.getIdToken();
            const adminsArray = state.admins.filter(admin => admin.email && admin.name);
            const res = await fetch('/api/settings/admins', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ admins: adminsArray })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);
            statusMessage.textContent = result.message;
        } catch (err) {
            statusMessage.textContent = `エラー: ${err.message}`;
        } finally {
            saveAdminsBtn.disabled = false;
        }
    });

    // --- 動的リストのUI関数 ---
    function createNicknameEntry(id = '', name = '') { /* ... */ }
    addNicknameBtn.addEventListener('click', () => createNicknameEntry());
    nicknamesListContainer.addEventListener('click', (e) => { /* ... */ });
    
    function renderAdminList() { /* ... */ }
    addAdminBtn.addEventListener('click', () => { /* ... */ });
    adminsListContainer.addEventListener('click', (e) => { /* ... */ });
    adminsListContainer.addEventListener('input', (e) => { /* ... */ });
    
    // Drag & Drop
    let draggedIndex = null;
    adminsListContainer.addEventListener('dragstart', (e) => { /* ... */ });
    adminsListContainer.addEventListener('dragend', (e) => { /* ... */ });
    adminsListContainer.addEventListener('drop', (e) => { /* ... */ });
    adminsListContainer.addEventListener('dragover', (e) => { /* ... */ });
});