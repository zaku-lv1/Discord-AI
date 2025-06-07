firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const provider = new firebase.auth.GoogleAuthProvider();

const loginScreen = document.getElementById('login-screen');
const mainContent = document.getElementById('main-content');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const saveBtn = document.getElementById('save-btn');
const userEmailEl = document.getElementById('user-email');
const promptTextarea = document.getElementById('prompt-textarea');
const statusMessage = document.getElementById('status-message');

auth.onAuthStateChanged(user => {
    if (user) {
        loginScreen.style.display = 'none';
        mainContent.style.display = 'block';
        userEmailEl.textContent = user.email;
        fetchSettings(user);
    } else {
        loginScreen.style.display = 'block';
        mainContent.style.display = 'none';
    }
});

loginBtn.addEventListener('click', () => auth.signInWithPopup(provider).catch(err => console.error(err)));
logoutBtn.addEventListener('click', () => auth.signOut());

async function fetchSettings(user) {
    statusMessage.textContent = '読込中...';
    try {
        const token = await user.getIdToken();
        const res = await fetch('/admin/api/settings/toka', { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error(res.status === 404 ? '設定未作成' : '読込失敗');
        const data = await res.json();
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
        const res = await fetch('/admin/api/settings/toka', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ systemPrompt: promptTextarea.value })
        });
        if (!res.ok) throw new Error('保存失敗');
        const result = await res.json();
        statusMessage.textContent = result.message;
    } catch (err) { statusMessage.textContent = `エラー: ${err.message}`; }
    finally { saveBtn.disabled = false; }
});