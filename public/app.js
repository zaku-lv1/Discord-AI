document.addEventListener('DOMContentLoaded', () => {
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();

    // DOM Elements
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const showRegisterFormLink = document.getElementById('show-register-form-link');
    const showLoginFormLink = document.getElementById('show-login-form-link');
    const registerBtn = document.getElementById('register-btn');
    const authContainer = document.getElementById('auth-container');
    const mainContent = document.getElementById('main-content');
    const userEmailEl = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');
    const statusMessage = document.getElementById('status-message');
    const forgotPasswordLink = document.getElementById('forgot-password-link');
    const navLinks = document.querySelectorAll('.nav-link');
    const panels = document.querySelectorAll('.dashboard-panel');
    const adminNavItem = document.getElementById('nav-item-admin');
    
    // Toka Panel Elements
    const baseUserIdInput = document.getElementById('base-user-id-input');
    const promptTextarea = document.getElementById('prompt-textarea');
    const nameRecognitionCheckbox = document.getElementById('name-recognition-checkbox');
    const nicknamesListContainer = document.getElementById('nicknames-list-container');
    const addNicknameBtn = document.getElementById('add-nickname-btn');
    const saveTokaBtn = document.getElementById('save-toka-btn');
    
    // Schedule Panel Elements
    const remindersEnabledCheckbox = document.getElementById('reminders-enabled-checkbox');
    const reminderTimeInput = document.getElementById('reminder-time-input');
    const googleSheetIdInput = document.getElementById('google-sheet-id-input');
    const reminderGuildIdInput = document.getElementById('reminder-guild-id-input');
    const reminderRoleIdInput = document.getElementById('reminder-role-id-input');
    const serviceAccountJsonTextarea = document.getElementById('service-account-json-textarea');
    const saveScheduleBtn = document.getElementById('save-schedule-btn');
    const scheduleItemsContainer = document.getElementById('schedule-items-container');
    const addScheduleItemBtn = document.getElementById('add-schedule-item-btn');
    const saveScheduleItemsBtn = document.getElementById('save-schedule-items-btn');

    // Admin Panel Elements
    const inviteCodeGeneratorSection = document.getElementById('invite-code-generator-section');
    const generateInviteCodeBtn = document.getElementById('generate-invite-code-btn');
    const inviteCodeDisplay = document.getElementById('invite-code-display');
    const newInviteCodeInput = document.getElementById('new-invite-code');
    const copyInviteCodeBtn = document.getElementById('copy-invite-code-btn');
    const adminsListContainer = document.getElementById('admins-list-container');
    const addAdminBtn = document.getElementById('add-admin-btn');
    const saveAdminsBtn = document.getElementById('save-admins-btn');

    // UI State
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
            document.getElementById(targetId).style.display = 'block';
            if (targetId === 'panel-schedule') {
                fetchScheduleItems();
            }
        });
    });

    // --- Auth & Registration Logic ---
    auth.onAuthStateChanged(user => { /* ... */ });
    loginBtn.addEventListener('click', () => { /* ... */ });
    logoutBtn.addEventListener('click', () => auth.signOut());
    forgotPasswordLink.addEventListener('click', (e) => { /* ... */ });
    showRegisterFormLink.addEventListener('click', (e) => { /* ... */ });
    showLoginFormLink.addEventListener('click', (e) => { /* ... */ });
    registerBtn.addEventListener('click', async () => { /* ... */ });
    generateInviteCodeBtn.addEventListener('click', async () => { /* ... */ });
    copyInviteCodeBtn.addEventListener('click', () => { /* ... */ });
    
    // --- Nickname UI Functions ---
    function renderNicknameList(nicknames = {}) { /* ... */ }
    function createNicknameEntry(id = '', name = '') { /* ... */ }
    addNicknameBtn.addEventListener('click', () => createNicknameEntry());
    nicknamesListContainer.addEventListener('click', (e) => { /* ... */ });
    
    // --- Admin UI Functions ---
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
    function getDragAfterElement(container, y) { /* ... */ }

    // --- Schedule Items UI Functions ---
    function renderScheduleList() {
        scheduleItemsContainer.innerHTML = '';
        state.scheduleItems.forEach((item, index) => {
            const entryDiv = document.createElement('div');
            entryDiv.className = 'schedule-item-entry';
            entryDiv.dataset.index = index;
            entryDiv.innerHTML = `
                <input type="text" class="item-type" data-field="0" placeholder="種別" value="${item[0] || ''}">
                <input type="text" class="item-task" data-field="1" placeholder="内容" value="${item[1] || ''}">
                <input type="text" class="item-due" data-field="2" placeholder="期限" value="${item[2] || ''}">
                <button type="button" class="delete-schedule-item-btn">削除</button>
            `;
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
            if (state.scheduleItems[index]) {
                state.scheduleItems[index][fieldIndex] = input.value;
            }
        }
    });


    // --- Data Fetching & Saving ---
    async function fetchSettings(user) { /* ... (The full version from previous answer) ... */ }
    
    async function fetchScheduleItems() {
        statusMessage.textContent = '予定リストを読み込み中...';
        try {
            const user = auth.currentUser;
            if (!user) return;
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

    saveTokaBtn.addEventListener('click', async () => { /* ... */ });
    saveScheduleBtn.addEventListener('click', async () => { /* ... */ });
    saveAdminsBtn.addEventListener('click', async () => { /* ... */ });
    
    saveScheduleItemsBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;
        statusMessage.textContent = '予定リストをシートに保存中...';
        saveScheduleItemsBtn.disabled = true;
        try {
            const token = await user.getIdToken();
            const itemsToSave = state.scheduleItems.filter(item => (item[1] && item[1].trim() !== '') || (item[0] && item[0].trim() !== '') || (item[2] && item[2].trim() !== ''));
            const res = await fetch('/api/schedule/items', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ items: itemsToSave })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || '保存に失敗しました');
            statusMessage.textContent = result.message;
            await fetchScheduleItems();
        } catch (err) { 
            statusMessage.textContent = `エラー: ${err.message}`; 
        } finally { 
            saveScheduleItemsBtn.disabled = false; 
        }
    });
});