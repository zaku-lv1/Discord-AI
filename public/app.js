document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // DOM Elements
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
        admins: [], // {name: string, email: string} の配列
        isSuperAdmin: false
    };

    auth.onAuthStateChanged(user => {
        if (user) {
            authContainer.style.display = 'none';
            mainContent.style.display = 'block';
            // ▼▼▼ ログイン直後のメールアドレス表示を削除し、fetchSettingsに処理を移譲 ▼▼▼
            // userEmailEl.textContent = user.email; 
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
                const label = document.createElement('span');
                label.className = 'super-admin-label';
                label.innerHTML = '👑';
                html += label.outerHTML;
            }
            
            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'delete-admin-btn';
            deleteBtn.textContent = '削除';

            entryDiv.innerHTML = html + deleteBtn.outerHTML;
            adminsListContainer.appendChild(entryDiv);
        });

        if (state.isSuperAdmin) {
            adminSettingsSection.style.display = 'block';
        } else {
            // 一般管理者の場合も、セクション自体は表示しておく（中身で権限を制御）
            adminSettingsSection.style.display = 'block';
            // ただし、全てのコントロールを無効化
            const adminControls = adminSettingsSection.querySelectorAll('input, button');
            adminControls.forEach(control => {
                control.disabled = true;
            });
            // ドラッグも無効化
            adminsListContainer.querySelectorAll('.admin-entry').forEach(entry => entry.draggable = false);
        }
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

    // --- ドラッグ＆ドロップ関連の処理 ---
    let draggedIndex = null;
    adminsListContainer.addEventListener('dragstart', (e) => {
        if (!state.isSuperAdmin || !e.target.classList.contains('admin-entry')) return;
        draggedIndex = parseInt(e.target.dataset.index, 10);
        setTimeout(() => e.target.classList.add('dragging'), 0);
    });
    adminsListContainer.addEventListener('dragend', (e) => {
        if (!e.target.classList.contains('admin-entry')) return;
        e.target.classList.remove('dragging');
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
                
                state.admins = [{ name: '（自動登録）', email: user.email }];
                state.isSuperAdmin = true;
                userEmailEl.textContent = '（自動登録）'; // 表示名をセット
                renderAdminList();
                return;
            }
            if (res.status === 403) {
                statusMessage.textContent = 'エラー: このページへのアクセス権がありません。';
                mainContent.innerHTML = `<h2>アクセスが拒否されました</h2><p>あなたのアカウント(${user.email})には、この設定パネルを閲覧・編集する権限がありません。最高管理者に連絡してください。</p><button id="logout-btn-fallback">ログアウト</button>`;
                document.getElementById('logout-btn-fallback').addEventListener('click', () => auth.signOut());
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

            // ▼▼▼ ここからが修正箇所 ▼▼▼
            // ログインユーザーの表示名を決定する
            const currentUserAdminInfo = (data.admins || []).find(admin => admin.email === user.email);
            const displayName = currentUserAdminInfo && currentUserAdminInfo.name ? currentUserAdminInfo.name : user.email;
            userEmailEl.textContent = displayName;
            // ▲▲▲ ここまで ▲▲▲
            
            state.admins = data.admins || [];
            state.isSuperAdmin = data.currentUser && data.currentUser.isSuperAdmin;
            renderAdminList();

            statusMessage.textContent = '設定を読み込みました';
        } catch (err) { statusMessage.textContent = `エラー: ${err.message}`; }
    }

    saveBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;
        
        statusMessage.textContent = '保存中...';
        saveBtn.disabled = true;
        
        try {
            const token = await user.getIdToken();
            
            const nicknamesObject = {};
            const nicknameEntries = document.querySelectorAll('.nickname-entry');
            nicknameEntries.forEach(entry => {
                const id = entry.querySelector('.nickname-id').value.trim();
                const name = entry.querySelector('.nickname-name').value.trim();
                if (id && name) {
                    nicknamesObject[id] = name;
                }
            });

            const adminsArray = state.admins.filter(admin => admin.email && admin.name);

            const settings = {
                baseUserId: baseUserIdInput.value,
                systemPrompt: promptTextarea.value,
                enableNameRecognition: nameRecognitionCheckbox.checked,
                userNicknames: nicknamesObject,
                admins: adminsArray
            };

            const res = await fetch('/api/settings/toka', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(settings)
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.message || '保存に失敗しました');
            }

            const result = await res.json();
            statusMessage.textContent = result.message || '保存しました！';
            
            if (result.createdUsers && result.createdUsers.length > 0) {
                statusMessage.textContent += '\n新規管理者にパスワード設定メールを送信中...';
                
                const emailPromises = result.createdUsers.map(email => {
                    return auth.sendPasswordResetEmail(email)
                        .then(() => {
                            console.log(`[情報] ${email} にパスワード設定メールを送信しました。`);
                            return email;
                        })
                        .catch(err => {
                            console.error(`[エラー] ${email} へのメール送信に失敗:`, err);
                            return null;
                        });
                });
                const sentEmails = (await Promise.all(emailPromises)).filter(Boolean);
                if (sentEmails.length > 0) {
                    statusMessage.textContent = result.message + `\n${sentEmails.join(', ')} にパスワード設定メールを送信しました。`;
                }
            }
            
            await fetchSettings(user);

        } catch (err) { 
            statusMessage.textContent = `エラー: ${err.message}`; 
        } finally { 
            saveBtn.disabled = false; 
        }
    });
});