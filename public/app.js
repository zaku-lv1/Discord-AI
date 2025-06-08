document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // (DOM Elements, Auth observer, Login, Logout, Forgot Password の各処理は変更なし)
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
    auth.onAuthStateChanged(user => { /* ... */ });
    loginBtn.addEventListener('click', () => { /* ... */ });
    logoutBtn.addEventListener('click', () => auth.signOut());
    forgotPasswordLink.addEventListener('click', (e) => { /* ... */ });

    // Fetch settings from server (プロンプト表示を元に戻す)
    async function fetchSettings(user) {
        statusMessage.textContent = '読込中...';
        try {
            const token = await user.getIdToken();
            const res = await fetch('/api/settings/toka', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.status === 404) {
                statusMessage.textContent = '設定はまだありません。';
                baseUserIdInput.value = '';
                promptTextarea.value = ''; // 空にする
                nameRecognitionCheckbox.checked = true;
                return;
            }
            if (!res.ok) throw new Error('設定の読み込みに失敗しました');
            const data = await res.json();
            baseUserIdInput.value = data.baseUserId || '';
            promptTextarea.value = data.systemPrompt || ''; // DBのプロンプトを表示
            nameRecognitionCheckbox.checked = data.enableNameRecognition ?? true; 
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
            // ▼▼▼ 保存データに systemPrompt を復活させる ▼▼▼
            const settings = {
                baseUserId: baseUserIdInput.value,
                systemPrompt: promptTextarea.value, // この行を復活させる
                enableNameRecognition: nameRecognitionCheckbox.checked
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