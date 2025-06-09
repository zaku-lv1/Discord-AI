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
    function renderAdminList(emails = []) {
        adminsListContainer.innerHTML = '';
        emails.forEach((email, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'admin-entry';
            entryDiv.setAttribute('draggable', true);

            if (index === 0) {
                entryDiv.classList.add('super-admin');
                entryDiv.innerHTML = `
                    <input type="email" class="admin-email" placeholder="管理者メールアドレス" value="${email}">
                    <span class="super-admin-label">👑 最高管理者</span>
                    <button type="button" class="delete-admin-btn">削除</button>
                `;
            } else {
                entryDiv.innerHTML = `
                    <input type="email" class="admin-email" placeholder="管理者メールアドレス" value="${email}">
                    <button type="button" class="delete-admin-btn">削除</button>
                `;
            }
            adminsListContainer.appendChild(entryDiv);
        });
    }

    addAdminBtn.addEventListener('click', () => {
        const newEntry = document.createElement('div');
        newEntry.className = 'admin-entry';
        newEntry.setAttribute('draggable', true);
        newEntry.innerHTML = `
            <input type="email" class="admin-email" placeholder="管理者メールアドレス" value="">
            <button type="button" class="delete-admin-btn">削除</button>
        `;
        adminsListContainer.appendChild(newEntry);
    });
    
    adminsListContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-admin-btn')) {
            e.target.closest('.admin-entry').remove();
            const currentEmails = Array.from(adminsListContainer.querySelectorAll('.admin-email')).map(input => input.value);
            renderAdminList(currentEmails);
        }
    });

    // --- ドラッグ＆ドロップ関連の処理 ---
    let draggedItem = null;

    adminsListContainer.addEventListener('dragstart', (e) => {
        if (!e.target.classList.contains('admin-entry')) return;
        draggedItem = e.target;
        setTimeout(() => e.target.classList.add('dragging'), 0);
    });

    adminsListContainer.addEventListener('dragend', (e) => {
        if (!e.target.classList.contains('admin-entry')) return;
        e.target.classList.remove('dragging');
        const currentEmails = Array.from(adminsListContainer.querySelectorAll('.admin-email')).map(input => input.value);
        renderAdminList(currentEmails);
    });

    adminsListContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(adminsListContainer, e.clientY);
        const dragging = document.querySelector('.dragging');
        if (!dragging) return;
        if (afterElement == null) {
            adminsListContainer.appendChild(dragging);
        } else {
            adminsListContainer.insertBefore(dragging, afterElement);
        }
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('.admin-entry:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
    
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
                adminSettingsSection.style.display = 'block';
                renderAdminList([user.email]);
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

            const isSuperAdmin = data.currentUser && data.currentUser.isSuperAdmin;
            
            renderAdminList(data.admins || []);

            // 最高管理者でない場合、UIを無効化
            if (!isSuperAdmin) {
                const adminControls = adminSettingsSection.querySelectorAll('input, button');
                adminControls.forEach(control => {
                    control.disabled = true;
                });
                // ドラッグも無効化
                adminSettingsSection.querySelectorAll('.admin-entry').forEach(entry => entry.draggable = false);
            }


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

            const adminsArray = Array.from(adminsListContainer.querySelectorAll('.admin-email'))
                                    .map(input => input.value.trim())
                                    .filter(email => email);

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
            
            await fetchSettings(user);

        } catch (err) { 
            statusMessage.textContent = `エラー: ${err.message}`; 
        } finally { 
            saveBtn.disabled = false; 
        }
    });
});