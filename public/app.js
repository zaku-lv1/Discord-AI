document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // DOM要素の取得
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const userEmailEl = document.getElementById('user-email');
    const statusMessage = document.getElementById('status-message');

    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const saveBtn = document.getElementById('save-btn');

    const baseUserIdInput = document.getElementById('base-user-id-input');
    const promptTextarea = document.getElementById('prompt-textarea');

    // 認証状態の監視
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

    // ログイン処理
    loginBtn.addEventListener('click', () => {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        statusMessage.textContent = ""; // エラーメッセージをリセット
        auth.signInWithEmailAndPassword(email, password)
            .catch(err => {
                console.error("Login Error:", err);
                statusMessage.textContent = `ログインエラー: IDまたはパスワードが違います。`;
            });
    });

    // ログアウト処理
    logoutBtn.addEventListener('click', () => auth.signOut());

    // 設定の読み書き
    async function fetchSettings(user) {
        statusMessage.textContent = '読込中...';
        try {
            const token = await user.getIdToken();
            const res = await fetch('/admin/api/settings/toka', { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.status === 404) {
                statusMessage.textContent = '設定はまだありません。';
                baseUserIdInput.value = '';
                promptTextarea.value = '';
                return;
            }
            if (!res.ok) throw new Error('読込失敗');
            const data = await res.json();
            baseUserIdInput.value = data.baseUserId || '';
            promptTextarea.value = data.systemPrompt || '';
            statusMessage.textContent = '読込完了';
        } catch (err) { statusMessage.textContent = `エラー: ${err.message}`; }
    }

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
            const res = await fetch('/admin/api/settings/toka', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(settings)
            });
            if (!res.ok) throw new Error('保存失敗');
            const result = await res.json();
            statusMessage.textContent = result.message;
        } catch (err) { statusMessage.textContent = `エラー: ${err.message}`; }
        finally { saveBtn.disabled = false; }
    });
});