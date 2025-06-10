document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // --- DOM Elements ---
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const statusMessage = document.getElementById('status-message');
    const loginForm = document.getElementById('login-form');
    const loginBtn = document.getElementById('login-btn');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const registerForm = document.getElementById('register-form');
    const registerBtn = document.getElementById('register-btn');
    const showRegisterFormLink = document.getElementById('show-register-form-link');
    const showLoginFormLink = document.getElementById('show-login-form-link');
    const userEmailEl = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');
    const navLinks = document.querySelectorAll('.nav-link');
    const panels = document.querySelectorAll('.dashboard-panel');
    const adminNavItem = document.getElementById('nav-item-admin');
    const saveAllBtn = document.getElementById('save-all-btn');
    
    // Toka Panel Elements
    const baseUserIdInput = document.getElementById('base-user-id-input');
    const promptTextarea = document.getElementById('prompt-textarea');
    const nameRecognitionCheckbox = document.getElementById('name-recognition-checkbox');
    const nicknamesListContainer = document.getElementById('nicknames-list-container');
    const addNicknameBtn = document.getElementById('add-nickname-btn');
    
    // Schedule Panel Elements
    const remindersEnabledCheckbox = document.getElementById('reminders-enabled-checkbox');
    const reminderTimeInput = document.getElementById('reminder-time-input');
    const googleSheetIdInput = document.getElementById('google-sheet-id-input');
    const reminderGuildIdInput = document.getElementById('reminder-guild-id-input');
    const reminderRoleIdInput = document.getElementById('reminder-role-id-input');
    const scheduleItemsContainer = document.getElementById('schedule-items-container');
    const addScheduleItemBtn = document.getElementById('add-schedule-item-btn');
    const saveScheduleItemsBtn = document.getElementById('save-schedule-items-btn');

    // Admin Panel Elements
    const adminSettingsSection = document.getElementById('panel-admins');
    const inviteCodeGeneratorSection = document.getElementById('invite-code-generator-section');
    const generateInviteCodeBtn = document.getElementById('generate-invite-code-btn');
    const inviteCodeDisplay = document.getElementById('invite-code-display');
    const newInviteCodeInput = document.getElementById('new-invite-code');
    const copyInviteCodeBtn = document.getElementById('copy-invite-code-btn');
    const adminsListContainer = document.getElementById('admins-list-container');
    const addAdminBtn = document.getElementById('add-admin-btn');
    
    // --- UI State ---
    let state = {
        admins: [],
        isSuperAdmin: false,
        scheduleItems: []
    };

    // --- Navigation Logic ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.dataset.target;
            navLinks.forEach(l => l.classList.remove('active'));
            panels.forEach(p => p.style.display = 'none');
            link.classList.add('active');
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) targetPanel.style.display = 'block';
            if (targetId === 'panel-schedule') {
                fetchScheduleItems();
            }
        });
    });

    // --- Auth & Registration Logic ---
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
    
    showRegisterFormLink.addEventListener('click', (e) => { e.preventDefault(); loginForm.style.display = 'none'; registerForm.style.display = 'block'; statusMessage.textContent = ''; });
    showLoginFormLink.addEventListener('click', (e) => { e.preventDefault(); registerForm.style.display = 'none'; loginForm.style.display = 'block'; statusMessage.textContent = ''; });

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
        if (!user || !state.isSuperAdmin) return;
        generateInviteCodeBtn.disabled = true;
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/generate-invite-code', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message);
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


    // --- Dynamic List UI Functions ---
    function renderNicknameList(nicknames = {}) {
        nicknamesListContainer.innerHTML = '';
        Object.entries(nicknames).forEach(([id, name]) => createNicknameEntry(id, name));
    }
    function createNicknameEntry(id = '', name = '') {
        const entryDiv = document.createElement('div');
        entryDiv.className = 'nickname-entry';
        entryDiv.innerHTML = `<input type="text" class="nickname-id" placeholder="ユーザーID" value="${id}"><input type="text" class="nickname-name" placeholder="ニックネーム" value="${name}"><button type="button" class="delete-nickname-btn">削除</button>`;
        nicknamesListContainer.appendChild(entryDiv);
    }
    addNicknameBtn.addEventListener('click', () => createNicknameEntry());
    nicknamesListContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-nickname-btn')) e.target.closest('.nickname-entry').remove();
    });

    function renderAdminList() {
        adminsListContainer.innerHTML = '';
        (state.admins || []).forEach((admin, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'admin-entry';
            entryDiv.setAttribute('draggable', state.isSuperAdmin);
            entryDiv.dataset.index = index;
            let html = `<input type="text" class="admin-name" data-field="name" placeholder="表示名" value="${admin.name || ''}"><input type="email" class="admin-email" data-field="email" placeholder="管理者メールアドレス" value="${admin.email || ''}">`;
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
            if (state.admins[index]) state.admins[index][field] = input.value;
        }
    });
    let draggedIndex = null;
    adminsListContainer.addEventListener('dragstart', (e) => {
        if (!state.isSuperAdmin || !e.target.classList.contains('admin-entry')) return;
        draggedIndex = parseInt(e.target.dataset.index, 10);
        setTimeout(() => e.target.classList.add('dragging'), 0);
    });
    adminsListContainer.addEventListener('dragend', (e) => {
        if (!e.target.classList.contains('admin-entry')) return;
        e.target.classList.remove('dragging');
        if (draggedIndex !== null) renderAdminList();
        draggedIndex = null;
    });
    adminsListContainer.addEventListener('drop', (e) => {
        if (!state.isSuperAdmin || draggedIndex === null) return;
        e.preventDefault();
        const dropTarget = e.target.closest('.admin-entry');
        if (dropTarget) {
            const dropIndex = parseInt(dropTarget.dataset.index, 10);
            if (draggedIndex === dropIndex) return;
            const draggedItem = state.admins.splice(draggedIndex, 1)[0];
            state.admins.splice(dropIndex, 0, draggedItem);
            renderAdminList();
        }
    });
    adminsListContainer.addEventListener('dragover', (e) => {
        if (!state.isSuperAdmin) return;
        e.preventDefault();
    });
    
    function renderScheduleList() {
        scheduleItemsContainer.innerHTML = '';
        state.scheduleItems.forEach((item, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'schedule-item-entry';
            entryDiv.dataset.index = index;
            entryDiv.innerHTML = `<input type="text" class="item-type" data-field="0" placeholder="種別" value="${item[0] || ''}"><input type="text" class="item-task" data-field="1" placeholder="内容" value="${item[1] || ''}"><input type="text" class="item-due" data-field="2" placeholder="期限" value="${item[2] || ''}"><button type="button" class="delete-schedule-item-btn">削除</button>`;
            scheduleItemsContainer.appendChild(entryDiv);
        });
    }
    addScheduleItemBtn.addEventListener('click', () => {
        state.scheduleItems.push(['', '', '']);
        renderScheduleList();
    });
    scheduleItemsContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-schedule-item-btn')) {
            const entry = e.target.closest('.schedule-item-entry');
            const index = parseInt(entry.dataset.index, 10);
            state.scheduleItems.splice(index, 1);
            renderScheduleList();
        }
    });
    scheduleItemsContainer.addEventListener('input', (e) => {
        const input = e.target;
        if (input.classList.contains('item-type') || input.classList.contains('item-task') || input.classList.contains('item-due')) {
            const entry = input.closest('.schedule-item-entry');
            const index = parseInt(entry.dataset.index, 10);
            const fieldIndex = parseInt(input.dataset.field, 10);
            if (state.scheduleItems[index]) state.scheduleItems[index][fieldIndex] = input.value;
        }
    });


    // --- Data Fetching & Saving ---
    async function fetchSettings(user) {
        statusMessage.textContent = '読込中...';
        const token = await user.getIdToken();
        try {
            const res = await fetch('/api/settings', { headers: { 'Authorization': `Bearer ${token}` } });
            
            if (res.status === 403 || res.status === 401) {
                mainContent.innerHTML = `<h2>アクセスが拒否されました</h2><p>あなたのアカウント(${user.email})には権限がありません。</p><button id="logout-btn-fallback">ログアウト</button>`;
                document.getElementById('logout-btn-fallback').addEventListener('click', () => auth.signOut());
                return;
            }

            // 初回アクセス（404）の場合の処理
            if (res.status === 404) {
                userEmailEl.textContent = user.displayName || user.email;
                state.admins = [{ name: user.displayName || '管理者', email: user.email }];
                state.isSuperAdmin = true;
                adminNavItem.style.display = 'block';
                renderAdminList();
                statusMessage.textContent = '設定はまだありません。「保存」を押すと初期設定が作成されます。';
                return;
            }
            if (!res.ok) throw new Error('設定の読み込みに失敗しました');

            const data = await res.json();
            
            const tokaData = data.toka || {};
            baseUserIdInput.value = tokaData.baseUserId || '';
            promptTextarea.value = tokaData.systemPrompt || '';
            nameRecognitionCheckbox.checked = tokaData.enableNameRecognition ?? true;
            renderNicknameList(tokaData.userNicknames || {});
            
            const currentUserAdminInfo = (tokaData.admins || []).find(admin => admin.email === user.email);
            const displayName = currentUserAdminInfo ? (currentUserAdminInfo.name || user.email) : user.email;
            userEmailEl.textContent = displayName;
            
            state.admins = tokaData.admins || [];
            state.isSuperAdmin = tokaData.currentUser && tokaData.currentUser.isSuperAdmin;
            
            adminNavItem.style.display = 'block';
            renderAdminList();
            const adminControls = document.querySelectorAll('#panel-admins input, #panel-admins button');
            if(!state.isSuperAdmin) {
                adminControls.forEach(el => el.disabled = true);
            } else {
                adminControls.forEach(el => el.disabled = false);
            }

            const scheduleData = data.schedule || {};
            remindersEnabledCheckbox.checked = scheduleData.remindersEnabled ?? false;
            reminderTimeInput.value = scheduleData.reminderTime || '';
            googleSheetIdInput.value = scheduleData.googleSheetId || '';
            reminderGuildIdInput.value = scheduleData.reminderGuildId || '';
            reminderRoleIdInput.value = scheduleData.reminderRoleId || '';
            
            statusMessage.textContent = '設定を読み込みました';
        } catch (err) {
            statusMessage.textContent = `エラー: ${err.message}`;
        }
    }
    
    async function fetchScheduleItems() {
        const user = auth.currentUser;
        if (!user) return;
        statusMessage.textContent = '予定リストを読み込み中...';
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/schedule/items', { headers: { 'Authorization': `Bearer ${token}` } });
            if (!res.ok) {
                if(res.status === 404) {
                    state.scheduleItems = [];
                    renderScheduleList();
                    statusMessage.textContent = 'スケジュールシートが未設定か、データがありません。';
                    return;
                }
                throw new Error('予定リストの読み込みに失敗しました。');
            }
            const items = await res.json();
            state.scheduleItems = items;
            renderScheduleList();
            statusMessage.textContent = '予定リストを読み込みました。';
        } catch (err) {
            statusMessage.textContent = `エラー: ${err.message}`;
        }
    }

    saveAllBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user || saveAllBtn.disabled) return;
        statusMessage.textContent = 'すべての設定を保存中...';
        saveAllBtn.disabled = true;
        try {
            const token = await user.getIdToken();
            
            const nicknamesObject = {};
            document.querySelectorAll('.nickname-entry').forEach(entry => {
                const id = entry.querySelector('.nickname-id').value.trim();
                const name = entry.querySelector('.nickname-name').value.trim();
                if (id) nicknamesObject[id] = name;
            });
            const adminsArray = state.admins.filter(admin => admin.email && admin.name);
            const tokaSettings = {
                baseUserId: baseUserIdInput.value,
                systemPrompt: promptTextarea.value,
                enableNameRecognition: nameRecognitionCheckbox.checked,
                userNicknames: nicknamesObject,
                admins: adminsArray
            };
            const scheduleSettings = {
                remindersEnabled: remindersEnabledCheckbox.checked,
                reminderTime: reminderTimeInput.value,
                googleSheetId: googleSheetIdInput.value,
                reminderGuildId: reminderGuildIdInput.value,
                reminderRoleId: reminderRoleIdInput.value,
            };

            const res = await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ toka: tokaSettings, schedule: scheduleSettings })
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.message);
            statusMessage.textContent = result.message;
            await fetchSettings(user);
        } catch (err) { 
            statusMessage.textContent = `エラー: ${err.message}`; 
        } finally { 
            saveAllBtn.disabled = false; 
        }
    });
    
    saveScheduleItemsBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;
        statusMessage.textContent = '予定リストをシートに保存中...';
        saveScheduleItemsBtn.disabled = true;
        try {
            const token = await user.getIdToken();
            const itemsToSave = state.scheduleItems.filter(item => (item[0] || item[1] || item[2]));
            const res = await fetch('/api/schedule/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ items: itemsToSave })
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
});