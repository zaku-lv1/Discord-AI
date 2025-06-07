// firebaseConfig は既に index.ejs でグローバル変数として定義されているため、
// ここで再度定義する必要はありません。

// Firebaseの初期化
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

// UI要素の取得
const loginScreen = document.getElementById('login-screen');
const mainContent = document.getElementById('main-content');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const saveBtn = document.getElementById('save-btn');
const userEmailEl = document.getElementById('user-email');
const promptTextarea = document.getElementById('prompt-textarea');
const statusMessage = document.getElementById('status-message');

// 認証状態の監視
auth.onAuthStateChanged(user => {
    if (user) {
        // ログイン状態のUI
        loginScreen.style.display = 'none';
        mainContent.style.display = 'block';
        userEmailEl.textContent = user.email;
        fetchSettings(user);
    } else {
        // ログアウト状態のUI
        loginScreen.style.display = 'block';
        mainContent.style.display = 'none';
        userEmailEl.textContent = '';
        promptTextarea.value = '';
    }
});

// ログイン処理
loginBtn.addEventListener('click', () => {
    auth.signInWithPopup(provider).catch(error => {
        console.error("Login failed:", error);
        statusMessage.textContent = `ログインに失敗しました: ${error.message}`;
        statusMessage.style.color = 'red';
    });
});

// ログアウト処理
logoutBtn.addEventListener('click', () => {
    auth.signOut();
});

// 設定をサーバーから取得する関数
async function fetchSettings(user) {
    statusMessage.textContent = '設定を読み込み中...';
    statusMessage.style.color = '#666';
    
    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/settings/toka', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            promptTextarea.value = data.systemPrompt || '';
            statusMessage.textContent = '設定を読み込みました。';
            statusMessage.style.color = 'green';
        } else if (response.status === 404) {
            promptTextarea.value = ''; // 新規作成の場合
            statusMessage.textContent = '設定がまだありません。新しいプロンプトを入力して保存してください。';
            statusMessage.style.color = '#333';
        } else {
            const errorData = await response.json();
            throw new Error(errorData.message || `サーバーエラー: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Failed to fetch settings:', error);
        statusMessage.textContent = `設定の読み込みに失敗しました: ${error.message}`;
        statusMessage.style.color = 'red';
    }
}

// 設定をサーバーに保存する関数
saveBtn.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) {
        statusMessage.textContent = '認証されていません。';
        return;
    }
    
    statusMessage.textContent = '保存中...';
    statusMessage.style.color = '#666';
    saveBtn.disabled = true;

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/settings/toka', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ systemPrompt: promptTextarea.value })
        });

        const result = await response.json();
        if (response.ok) {
            statusMessage.textContent = result.message;
            statusMessage.style.color = 'green';
        } else {
            throw new Error(result.message || '保存に失敗しました。');
        }
    } catch (error) {
        console.error('Failed to save settings:', error);
        statusMessage.textContent = `エラー: ${error.message}`;
        statusMessage.style.color = 'red';
    } finally {
        saveBtn.disabled = false;
    }
});