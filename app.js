// ==========================================
// 1. CẤU HÌNH FIREBASE
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAKmHgrchZwCYaZW0ky831Oj6qQrUS2HuI",
  authDomain: "quan-ly-ban-tru-tlm.firebaseapp.com",
  projectId: "quan-ly-ban-tru-tlm",
  storageBucket: "quan-ly-ban-tru-tlm.firebasestorage.app",
  messagingSenderId: "22398649576",
  appId: "1:22398649576:web:89f0323537781697adf55d"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ==========================================
// 2. BIẾN TOÀN CỤC (STATE)
// ==========================================
let currentUser = null;
let currentRole = null; 
let editingReceiptId = null; 
let lastReceiptData = null; 

let systemSettings = {
    schoolName: "Trường THPT ...",
    address: "Địa chỉ ...",
    phone: "...",
    mealPrice: 35000,
    classList: [] 
};

// ==========================================
// 3. QUẢN LÝ AUTH
// ==========================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-overlay').classList.add('d-none');
        document.getElementById('main-app').classList.remove('d-none');
        await fetchUserRole(user.uid);
        await loadSettings();
        document.getElementById('user-display').innerText = user.email;
        loadReceipts('manage'); 
    } else {
        currentUser = null;
        document.getElementById('login-overlay').classList.remove('d-none');
        document.getElementById('main-app').classList.add('d-none');
    }
});

document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert("Lỗi: " + err.message));
});

function logout() {
    auth.signOut().then(() => window.location.reload());
}

async function fetchUserRole(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        currentRole = doc.exists ? doc.data().role : 'staff';
        document.getElementById('role-display').innerText = currentRole.toUpperCase();
        applyPermissons(currentRole);
    } catch (e) { console.error(e); }
}

function applyPermissons(role) {
    const adminEls = document.querySelectorAll('.admin-only');
    adminEls.forEach(e => e.style.display = 'none');
    if (role === 'admin') {
        adminEls.forEach(e => e.style.display = 'block');
    }
}

// ==========================================
// 4. CẤU HÌNH & DATALIST (LOGIC MỚI)
// ==========================================

async function loadSettings() {
    try {
        const doc = await db.collection('settings').doc('general').get();
        if (doc.exists) {
            systemSettings = { ...systemSettings, ...doc.data() };
        }
        
        document.getElementById('set-name').value = systemSettings.schoolName;
        document.getElementById('set-address').value = systemSettings.address;
        document.getElementById('set-phone').value = systemSettings.phone;
        document.getElementById('set-price').value = systemSettings.mealPrice;
        
        const classes = systemSettings.classList || [];
        document.getElementById('set-classes').value = classes.join(', ');

        // MỚI: Cập nhật Datalist thay vì Select
        updateClassDatalist(classes);

        updatePriceDisplay();
    } catch (e) { console.log(e); }
}

// HÀM ĐÃ ĐƯỢC NÂNG CẤP ĐỂ KHÔNG GÂY LỖI MÀN HÌNH TRẮNG
function updateClassDatalist(classList) {
    const dataList = document.getElementById('list-classes');
    
    // NẾU KHÔNG TÌM THẤY THẺ HTML -> DỪNG LẠI (KHÔNG CRASH APP)
    if (!dataList) {
        console.warn("Chưa có thẻ <datalist id='list-classes'> trong HTML!");
        return; 
    }

    dataList.innerHTML = ''; // Xóa cũ
    
    if (classList && classList.length > 0) {
        classList.forEach(className => {
            const opt = document.createElement('option');
            opt.value = className;
            dataList.appendChild(opt);
        });
    }
}

document.getElementById('form-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (currentRole !== 'admin') return alert("Bạn không có quyền!");
    
    const rawClasses = document.getElementById('set-classes').value;
    const classArray = rawClasses.split(',').map(c => c.trim()).filter(c => c !== "");

    const newSettings = {
        schoolName: document.getElementById('set-name').value,
        address: document.getElementById('set-address').value,
        phone: document.getElementById('set-phone').value,
        mealPrice: parseInt(document.getElementById('set-price').value),
        classList: classArray
    };
    
    try {
        await db.collection('settings').doc('general').set(newSettings);
        alert("Đã lưu cấu hình!");
        loadSettings(); 
    } catch (err) {
        alert("Lỗi lưu: " + err.message);
    }
});

// ==========================================
// 5. LOGIC LẬP PHIẾU THU (CORE)
// ==========================================

function updatePriceDisplay() {
    const price = systemSettings.mealPrice;
    document.getElementById('inp-price-display').value = formatMoney(price);
    calculateTotalFromMeals(); 
}

// Nhập số suất -> Tính tiền
function calculateTotalFromMeals() {
    const meals = parseFloat(document.getElementById('inp-meals').value) || 0;
    const total = meals * systemSettings.mealPrice;
    
    document.getElementById('inp-amount-hidden').value = total;
    document.getElementById('inp-amount-display').value = formatMoney(total);
}

// Nhập tiền -> Tính suất (LOGIC CHẶT CHẼ HƠN)
function calculateMealsFromAmount() {
    const amountInput = document.getElementById('inp-amount-display');
    const mealsInput = document.getElementById('inp-meals');
    const hiddenAmount = document.getElementById('inp-amount-hidden');
    
    // 1. Chỉ lấy số (đã chặn chữ ở HTML, nhưng lọc lại cho chắc)
    let rawAmount = amountInput.value.replace(/[^0-9]/g, '');
    
    // 2. Nếu trống thì coi như 0
    if (rawAmount === '') rawAmount = 0;
    
    if (systemSettings.mealPrice > 0 && rawAmount > 0) {
        let meals = rawAmount / systemSettings.mealPrice;
        mealsInput.value = Math.round(meals * 100) / 100; 
        hiddenAmount.value = rawAmount;
    } else {
        mealsInput.value = 0;
        hiddenAmount.value = 0;
    }
}

// Format lại hiển thị tiền khi click ra ngoài (Blur)
function formatAmountDisplay() {
    const amountInput = document.getElementById('inp-amount-display');
    let rawVal = amountInput.value.replace(/[^0-9]/g, ''); // Lấy số thô
    if(rawVal) {
        amountInput.value = formatMoney(parseInt(rawVal)); // Format đẹp (có chấm)
    } else {
        amountInput.value = "";
    }
}

document.getElementById('inp-meals').addEventListener('input', calculateTotalFromMeals);

// Submit Form
document.getElementById('form-receipt').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseInt(document.getElementById('inp-amount-hidden').value);
    const meals = parseFloat(document.getElementById('inp-meals').value);
    
    if (amount <= 0) return alert("Số tiền phải lớn hơn 0");

    const receiptData = {
        studentName: document.getElementById('inp-name').value,
        studentClass: document.getElementById('inp-class').value, // Lấy từ input list
        mealCount: meals,
        unitPrice: systemSettings.mealPrice,
        amount: amount,
        reason: document.getElementById('inp-reason').value,
        paymentMethod: document.getElementById('inp-method').value
    };

    try {
        if (editingReceiptId) {
            receiptData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            receiptData.updatedBy = currentUser.email;
            await db.collection('receipts').doc(editingReceiptId).update(receiptData);
            alert("Đã cập nhật phiếu!");
        } else {
            receiptData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            receiptData.createdBy = currentUser.email;
            receiptData.receiptCode = "PT" + Date.now().toString().slice(-6);
            await db.collection('receipts').add(receiptData);
            
            lastReceiptData = receiptData;
            lastReceiptData.createdAtDate = new Date();
            document.getElementById('btn-print-recent').disabled = false;
            alert("Lưu phiếu thành công!");
        }

        resetForm(true);
        loadRecentReceipts();
        loadReceipts('manage'); 
    } catch (err) {
        alert("Lỗi lưu dữ liệu: " + err.message);
    }
});

function resetForm(full = true) {
    if(full) {
        document.getElementById('form-receipt').reset();
        editingReceiptId = null;
        const btnSubmit = document.querySelector('#form-receipt button[type="submit"]');
        btnSubmit.innerHTML = "Lưu Phiếu";
        btnSubmit.classList.replace('btn-success', 'btn-primary'); 
        document.getElementById('btn-print-recent').disabled = true;
    }
    updatePriceDisplay();
    document.getElementById('inp-name').focus();
}

async function loadRecentReceipts() {
    const snap = await db.collection('receipts').orderBy('createdAt', 'desc').limit(5).get();
    const tbody = document.getElementById('tbody-recent');
    tbody.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        const timeStr = d.createdAt ? new Date(d.createdAt.seconds*1000).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'}) : '...';
        tbody.innerHTML += `<tr>
            <td>${timeStr}</td>
            <td>${d.studentName}</td>
            <td>${d.studentClass}</td>
            <td>${formatMoney(d.amount)}</td>
        </tr>`;
    });
}

// ==========================================
// 6. QUẢN LÝ & BÁO CÁO
// ==========================================

async function loadReceipts(mode = 'manage') {
    const filterTime = document.getElementById(`filter-time-${mode}`).value;
    const tbody = document.getElementById(mode === 'manage' ? 'tbody-manage' : 'tbody-report');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Đang tải dữ liệu...</td></tr>';

    let startDate = new Date();
    let endDate = new Date();
    startDate.setHours(0,0,0,0); endDate.setHours(23,59,59,999);

    if (filterTime === 'this_month') {
        startDate.setDate(1);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);
    } else if (filterTime === 'last_month') {
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setDate(1);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);
    } else if (filterTime === 'all') {
        startDate = new Date(2020, 0, 1);
    }

    let query = db.collection('receipts')
        .where('createdAt', '>=', startDate)
        .where('createdAt', '<=', endDate)
        .orderBy('createdAt', 'desc');

    const snap = await query.get();
    tbody.innerHTML = '';
    
    let totalMoney = 0;
    let totalMeals = 0;
    let count = 0;

    snap.forEach(doc => {
        const d = doc.data();
        const id = doc.id;
        
        if (mode === 'manage') {
            const search = document.getElementById('search-manage').value.toLowerCase();
            const name = d.studentName ? d.studentName.toLowerCase() : "";
            const cls = d.studentClass ? d.studentClass.toLowerCase() : "";
            if (search && !name.includes(search) && !cls.includes(search)) return;
        }

        const dateStr = d.createdAt ? new Date(d.createdAt.seconds*1000).toLocaleString('vi-VN') : '';
        totalMoney += d.amount;
        totalMeals += d.mealCount;
        count++;

        let actionBtns = '';
        if ((currentRole === 'admin' || currentRole === 'accountant') && mode === 'manage') {
            actionBtns = `
                <button class="btn btn-sm btn-warning me-1" onclick="editReceipt('${id}')" title="Sửa"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm btn-danger" onclick="deleteReceipt('${id}')" title="Xóa"><i class="fas fa-trash"></i></button>
            `;
        }

        const row = `<tr>
            <td>${mode === 'report' ? count : dateStr}</td>
            <td>${mode === 'report' ? dateStr : (d.receiptCode || '...')}</td>
            <td>${d.studentName}</td>
            <td>${d.studentClass}</td>
            <td class="fw-bold">${formatMoney(d.amount)}</td>
            <td>${mode === 'report' ? d.mealCount : d.createdBy}</td>
            <td>
                ${mode === 'manage' ? actionBtns : d.paymentMethod}
                ${mode === 'manage' ? `<button class="btn btn-sm btn-secondary ms-1" onclick="rePrint('${id}')"><i class="fas fa-print"></i></button>` : ''}
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });

    if (mode === 'report') {
        document.getElementById('rpt-total-money').innerText = formatMoney(totalMoney);
        document.getElementById('rpt-total-meals').innerText = totalMeals;
        document.getElementById('rpt-count').innerText = count;
    }
}

async function deleteReceipt(id) {
    if(!confirm("Bạn chắc chắn muốn xóa phiếu này?")) return;
    try {
        await db.collection('receipts').doc(id).delete();
        alert("Đã xóa thành công!");
        loadReceipts('manage');
        loadRecentReceipts();
    } catch (e) { alert("Lỗi: " + e.message); }
}

async function editReceipt(id) {
    try {
        const doc = await db.collection('receipts').doc(id).get();
        if (!doc.exists) return alert("Không tìm thấy phiếu!");

        const d = doc.data();
        
        document.getElementById('inp-name').value = d.studentName;
        document.getElementById('inp-class').value = d.studentClass; // Datalist input nhận value bình thường
        document.getElementById('inp-meals').value = d.mealCount;
        document.getElementById('inp-reason').value = d.reason;
        document.getElementById('inp-method').value = d.paymentMethod;
        
        document.getElementById('inp-amount-hidden').value = d.amount;
        document.getElementById('inp-amount-display').value = formatMoney(d.amount);

        editingReceiptId = id;
        
        const btnSubmit = document.querySelector('#form-receipt button[type="submit"]');
        btnSubmit.innerHTML = "Cập nhật Phiếu";
        btnSubmit.classList.replace('btn-primary', 'btn-success');

        const tabTrigger = new bootstrap.Tab(document.querySelector('button[data-bs-target="#tab-phieuthu"]'));
        tabTrigger.show();

    } catch (e) {
        alert("Lỗi tải dữ liệu: " + e.message);
    }
}

// ==========================================
// 7. IN ẤN & UTILS
// ==========================================

function formatMoney(num) {
    return num ? num.toLocaleString('vi-VN') : '0';
}

function docSoThanhChu(number) {
    return formatMoney(number) + " đồng"; 
}

function preparePrintData(data) {
    document.getElementById('p-school-name').innerText = systemSettings.schoolName;
    document.getElementById('p-school-addr').innerText = "ĐC: " + systemSettings.address;
    document.getElementById('p-school-phone').innerText = systemSettings.phone;
    
    document.getElementById('p-code').innerText = data.receiptCode || '...';
    document.getElementById('p-name').innerText = data.studentName;
    document.getElementById('p-class').innerText = data.studentClass;
    document.getElementById('p-reason').innerText = data.reason;
    document.getElementById('p-meals').innerText = data.mealCount;
    document.getElementById('p-amount').innerText = formatMoney(data.amount);
    document.getElementById('p-text-money').innerText = docSoThanhChu(data.amount);
    document.getElementById('p-method').innerText = data.paymentMethod;
    document.getElementById('p-creator').innerText = data.createdBy;
}

function printLastReceipt() {
    if (!lastReceiptData) return;
    preparePrintData(lastReceiptData);
    document.body.classList.add('print-receipt-mode');
    window.print();
    document.body.classList.remove('print-receipt-mode');
}

async function rePrint(id) {
    try {
        const doc = await db.collection('receipts').doc(id).get();
        if(doc.exists) {
            lastReceiptData = doc.data();
            printLastReceipt();
        }
    } catch(e) { console.error(e); }
}

function printReport() {
    document.body.classList.add('print-report-mode');
    window.print();
    document.body.classList.remove('print-report-mode');
}

function exportExcel() {
    const table = document.getElementById("table-report");
    const wb = XLSX.utils.table_to_book(table, {sheet: "BaoCao"});
    XLSX.writeFile(wb, "BaoCao_DoanhThu.xlsx");
}

// ==========================================
// 8. TẠO USER
// ==========================================
const formCreateUser = document.getElementById('form-create-user');
if (formCreateUser) {
    formCreateUser.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (currentRole !== 'admin') return alert("Bạn không có quyền!");

        const email = document.getElementById('new-user-email').value;
        const password = document.getElementById('new-user-pass').value;
        const role = document.getElementById('new-user-role').value;
        const btn = document.getElementById('btn-create-user');

        try {
            btn.disabled = true;
            btn.innerHTML = 'Đang tạo...';
            
            const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
            const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
            
            await db.collection('users').doc(userCredential.user.uid).set({
                email: email, role: role, createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await secondaryApp.delete();
            alert(`Tạo thành công User: ${email}`);
            formCreateUser.reset();
        } catch (error) {
            alert("Lỗi: " + error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Tạo User';
        }
    });
}

