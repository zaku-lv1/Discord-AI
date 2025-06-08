document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // DOM Elements
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const userEmailEl = document.getElementById('user-email');
    const statusMessage = document.getElementById('status-message');

    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const baseUserIdInput = document.getElementById('base-user-id-input');
    const promptTextarea = document.getElementById('prompt-textarea');
    
    // Buttons
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const saveBtn = document.getElementById('save-btn');
    const forgotPasswordLink = document.getElementById('forgot-password-link');

    // Auth state observer
    auth.onAuthStateChanged(user => {
        if (user) {
            authContainer.style.display = 'none';
            mainContent.style.display = 'block';
            userEmailEl.textContent = user.email;
            fetchSettings(user);
        } else {
            authContainer.style.display = 'block';
            mainContent.style.display = 'none';
            userEmailEl.textContent = '';
        }
    });

    // Login event
    loginBtn.addEventListener('click', () => {
        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        statusMessage.textContent = "";
        auth.signInWithEmailAndPassword(email, password)
            .catch(err => {
                statusMessage.textContent = `ログインエラー: IDまたはパスワードが違います。`;
            });
    });

    // Logout event
    logoutBtn.addEventListener('click', () => auth.signOut());

    // **NEW**: Forgot password event
    forgotPasswordLink.addEventListener('click', (e) => {
        e.preventDefault();
        const email = loginEmailInput.value;
        if (!email) {
            statusMessage.textContent = 'パスワードをリセットするために、メールアドレスを入力してください。';
            return;
        }
        
        statusMessage.textContent = '送信中...';
        auth.sendPasswordResetEmail(email)
            .then(() => {
                statusMessage.textContent = `${email} にパスワード再設定用のメールを送信しました。`;
            })
            .catch(err => {
                statusMessage.textContent = `エラー: ${err.message}`;
            });
    });


    // Fetch settings from server
    async function fetchSettings(user) {
        statusMessage.textContent = '読込中...';
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/settings/toka', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.status === 404) {
                statusMessage.textContent = '設定はまだありません。';
                baseUserIdInput.value = '';
                promptTextarea.value = '';
                return;
            }
            if (!res.ok) throw new Error('設定の読み込みに失敗しました');
            const data = await res.json();
            baseUserIdInput.value = data.baseUserId || '';
            promptTextarea.value = data.systemPrompt || '';
            statusMessage.textContent = '設定を読み込みました';
        } catch (err) { statusMessage.textContent = `エラー: ${err.message}`; }
    }

    // Save settings to server
    saveBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;
        
        statusMessage.textContent = '保存中...';
        saveBtn.disabled = true;
        
        try {
            const token = await user.getIdToken();
            const settings = {
                baseUserId: baseUserIdInput.value,
                systemPrompt: promptTextarea.value
            };
            const res = await fetch('/api/settings/toka', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(settings)
            });
            if (!res.ok) throw new Error('保存に失敗しました');
            const result = await res.json();
            statusMessage.textContent = result.message || '保存しました！';
        } catch (err) { 
            statusMessage.textContent = `エラー: ${err.message}`; 
        } finally { 
            saveBtn.disabled = false; 
        }
    });
});