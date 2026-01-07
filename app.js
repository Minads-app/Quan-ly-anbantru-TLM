// ==========================================
// 1. CẤU HÌNH FIREBASE
// ==========================================
// LƯU Ý: Hãy thay thế bằng Config của dự án bạn
const firebaseConfig = {
  apiKey: "AIzaSyAKmHgrchZwCYaZW0ky831Oj6qQrUS2HuI",
  authDomain: "quan-ly-ban-tru-tlm.firebaseapp.com",
  projectId: "quan-ly-ban-tru-tlm",
  storageBucket: "quan-ly-ban-tru-tlm.firebasestorage.app",
  messagingSenderId: "22398649576",
  appId: "1:22398649576:web:89f0323537781697adf55d"
};

// Khởi tạo Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ==========================================
// 2. BIẾN TOÀN CỤC (STATE)
// ==========================================
let currentUser = null;
let currentRole = null; // 'admin', 'accountant', 'staff'
let editingReceiptId = null; // ID phiếu đang sửa (null nếu là tạo mới)
let lastReceiptData = null; // Dữ liệu phiếu vừa lưu (để in)

// Cấu hình mặc định
let systemSettings = {
    schoolName: "Trường THPT ...",
    address: "Địa chỉ ...",
    phone: "...",
    mealPrice: 35000,
    classList: [] // Danh sách lớp
};

// ==========================================
// 3. QUẢN LÝ ĐĂNG NHẬP & PHÂN QUYỀN
// ==========================================

// Lắng nghe trạng thái đăng nhập
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-overlay').classList.add('d-none');
        document.getElementById('main-app').classList.remove('d-none');
        
        // Lấy Role & Settings
        await fetchUserRole(user.uid);
        await loadSettings();
        
        document.getElementById('user-display').innerText = user.email;
        loadReceipts('manage'); // Load dữ liệu mặc định
    } else {
        currentUser = null;
        document.getElementById('login-overlay').classList.remove('d-none');
        document.getElementById('main-app').classList.add('d-none');
    }
});

// Xử lý Form Đăng nhập
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert("Lỗi: " + err.message));
});

function logout() {
    auth.signOut().then(() => window.location.reload());
}

// Lấy quyền user từ Firestore
async function fetchUserRole(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        currentRole = doc.exists ? doc.data().role : 'staff';
        document.getElementById('role-display').innerText = currentRole.toUpperCase();
        applyPermissons(currentRole);
    } catch (e) { console.error("Lỗi lấy quyền:", e); }
}

// Ẩn/Hiện nút chức năng theo quyền
function applyPermissons(role) {
    const adminEls = document.querySelectorAll('.admin-only');
    
    // Reset ẩn hết trước
    adminEls.forEach(e => e.style.display = 'none');
    
    // Nếu là Admin thì hiện các nút admin
    if (role === 'admin') {
        adminEls.forEach(e => e.style.display = 'block');
    }
}

// ==========================================
// 4. CẤU HÌNH HỆ THỐNG (SETTINGS)
// ==========================================

async function loadSettings() {
    try {
        const doc = await db.collection('settings').doc('general').get();
        if (doc.exists) {
            systemSettings = { ...systemSettings, ...doc.data() };
        }
        
        // 1. Điền vào form Cấu hình
        document.getElementById('set-name').value = systemSettings.schoolName;
        document.getElementById('set-address').value = systemSettings.address;
        document.getElementById('set-phone').value = systemSettings.phone;
        document.getElementById('set-price').value = systemSettings.mealPrice;
        
        // 2. Điền danh sách lớp vào Textarea (Nối mảng thành chuỗi)
        const classes = systemSettings.classList || [];
        document.getElementById('set-classes').value = classes.join(', ');

        // 3. Cập nhật Dropdown Lớp ở màn hình Nhập
        updateClassSelect(classes);

        // 4. Cập nhật giá lên Form Nhập
        updatePriceDisplay();
        
    } catch (e) { console.log("Chưa có cấu hình hoặc lỗi mạng", e); }
}

// Hàm render thẻ Select chọn lớp
function updateClassSelect(classList) {
    const selectEl = document.getElementById('inp-class');
    selectEl.innerHTML = '<option value="">-- Chọn lớp --</option>';
    
    if (classList && classList.length > 0) {
        classList.forEach(className => {
            const opt = document.createElement('option');
            opt.value = className;
            opt.innerText = className;
            selectEl.appendChild(opt);
        });
    } else {
        const opt = document.createElement('option');
        opt.innerText = "Chưa cấu hình lớp (Vào tab Cấu hình)";
        opt.disabled = true;
        selectEl.appendChild(opt);
    }
}

// Lưu cấu hình (Chỉ Admin)
document.getElementById('form-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (currentRole !== 'admin') return alert("Bạn không có quyền!");
    
    // Xử lý chuỗi lớp nhập vào -> Mảng
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
        alert("Đã lưu cấu hình thành công!");
        loadSettings(); // Reload để áp dụng ngay
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
    calculateTotalFromMeals(); // Tính lại tổng tiền theo giá mới
}

// Cách 1: Nhập số suất -> Tính ra tiền
function calculateTotalFromMeals() {
    const meals = parseFloat(document.getElementById('inp-meals').value) || 0;
    const total = meals * systemSettings.mealPrice;
    
    document.getElementById('inp-amount-hidden').value = total;
    document.getElementById('inp-amount-display').value = formatMoney(total);
}

// Cách 2: Nhập tổng tiền -> Chia ngược ra số suất
function calculateMealsFromAmount() {
    const amountInput = document.getElementById('inp-amount-display');
    const mealsInput = document.getElementById('inp-meals');
    const hiddenAmount = document.getElementById('inp-amount-hidden');
    
    // Lấy số thô (bỏ dấu chấm/phẩy)
    let rawAmount = amountInput.value.replace(/\D/g, ''); 
    
    if (systemSettings.mealPrice > 0 && rawAmount > 0) {
        let meals = rawAmount / systemSettings.mealPrice;
        // Làm tròn 2 số thập phân
        mealsInput.value = Math.round(meals * 100) / 100; 
        hiddenAmount.value = rawAmount;
    } else {
        mealsInput.value = 0;
        hiddenAmount.value = 0;
    }
}

// Format lại số tiền khi người dùng nhập xong (blur)
function formatAmountDisplay() {
    const amountInput = document.getElementById('inp-amount-display');
    let rawVal = amountInput.value.replace(/\D/g, '');
    if(rawVal) {
        amountInput.value = formatMoney(parseInt(rawVal));
    }
}

// Lắng nghe sự kiện nhập liệu
document.getElementById('inp-meals').addEventListener('input', calculateTotalFromMeals);
// Sự kiện cho input tiền đã được gán trực tiếp trong HTML (oninput, onblur)

// --- XỬ LÝ LƯU PHIẾU (TẠO MỚI HOẶC SỬA) ---
document.getElementById('form-receipt').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseInt(document.getElementById('inp-amount-hidden').value);
    const meals = parseFloat(document.getElementById('inp-meals').value);
    
    // Validate
    if (amount <= 0) return alert("Số tiền phải lớn hơn 0");
    if (!Number.isInteger(meals) && meals % 0.5 !== 0) {
       // Cảnh báo nhẹ nếu số suất quá lẻ, nhưng vẫn cho lưu tùy quy định
    }

    const receiptData = {
        studentName: document.getElementById('inp-name').value,
        studentClass: document.getElementById('inp-class').value,
        mealCount: meals,
        unitPrice: systemSettings.mealPrice,
        amount: amount,
        reason: document.getElementById('inp-reason').value,
        paymentMethod: document.getElementById('inp-method').value
    };

    try {
        if (editingReceiptId) {
            // --- CẬP NHẬT (UPDATE) ---
            receiptData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
            receiptData.updatedBy = currentUser.email;
            
            await db.collection('receipts').doc(editingReceiptId).update(receiptData);
            alert("Đã cập nhật phiếu!");
        } else {
            // --- TẠO MỚI (CREATE) ---
            receiptData.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            receiptData.createdBy = currentUser.email;
            receiptData.receiptCode = "PT" + Date.now().toString().slice(-6); // Mã ngẫu nhiên
            
            await db.collection('receipts').add(receiptData);
            
            // Lưu biến tạm để in ngay
            lastReceiptData = receiptData;
            lastReceiptData.createdAtDate = new Date();
            document.getElementById('btn-print-recent').disabled = false;
            alert("Lưu phiếu thành công!");
        }

        // Reset và load lại
        resetForm(true);
        loadRecentReceipts();
        loadReceipts('manage'); 
        
    } catch (err) {
        alert("Lỗi lưu dữ liệu: " + err.message);
    }
});

// Reset Form và trạng thái nút
function resetForm(full = true) {
    if(full) {
        document.getElementById('form-receipt').reset();
        
        // Reset trạng thái "Đang sửa" về "Tạo mới"
        editingReceiptId = null;
        const btnSubmit = document.querySelector('#form-receipt button[type="submit"]');
        btnSubmit.innerHTML = "Lưu Phiếu";
        btnSubmit.classList.replace('btn-success', 'btn-primary'); 
        
        // Disable nút in cho đến khi lưu mới
        document.getElementById('btn-print-recent').disabled = true;
    }
    updatePriceDisplay();
    document.getElementById('inp-name').focus();
}

// Load danh sách 5 phiếu gần nhất bên tab Nhập
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
// 6. QUẢN LÝ & BÁO CÁO (Logic chung)
// ==========================================

async function loadReceipts(mode = 'manage') {
    const filterTime = document.getElementById(`filter-time-${mode}`).value;
    const tbody = document.getElementById(mode === 'manage' ? 'tbody-manage' : 'tbody-report');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Đang tải dữ liệu...</td></tr>';

    // Xác định khoảng thời gian lọc
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

    // Query Firestore
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
        
        // Search Client-side
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

        // Tạo nút Sửa/Xóa (Chỉ Admin/Kế toán)
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

    // Cập nhật thống kê báo cáo
    if (mode === 'report') {
        document.getElementById('rpt-total-money').innerText = formatMoney(totalMoney);
        document.getElementById('rpt-total-meals').innerText = totalMeals;
        document.getElementById('rpt-count').innerText = count;
    }
}

// --- LOGIC XÓA & SỬA ---

async function deleteReceipt(id) {
    if(!confirm("Bạn chắc chắn muốn xóa phiếu này? Hành động không thể hoàn tác.")) return;
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
        
        // 1. Đổ dữ liệu vào Form
        document.getElementById('inp-name').value = d.studentName;
        document.getElementById('inp-class').value = d.studentClass;
        document.getElementById('inp-meals').value = d.mealCount;
        document.getElementById('inp-reason').value = d.reason;
        document.getElementById('inp-method').value = d.paymentMethod;
        
        // 2. Set giá tiền
        document.getElementById('inp-amount-hidden').value = d.amount;
        document.getElementById('inp-amount-display').value = formatMoney(d.amount);

        // 3. Chuyển trạng thái Sửa
        editingReceiptId = id;
        
        // 4. Đổi tên nút Submit
        const btnSubmit = document.querySelector('#form-receipt button[type="submit"]');
        btnSubmit.innerHTML = "Cập nhật Phiếu";
        btnSubmit.classList.replace('btn-primary', 'btn-success');

        // 5. Mở Tab Lập Phiếu Thu
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
    // Placeholder đọc số (Thực tế nên dùng thư viện)
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
// 8. TẠO TÀI KHOẢN (ADMIN)
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
        const msgBox = document.getElementById('create-msg');

        if (password.length < 6) return alert("Mật khẩu phải từ 6 ký tự trở lên!");

        try {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';
            msgBox.innerText = "";

            // Tạo App phụ để không logout Admin
            const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
            const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
            
            await db.collection('users').doc(userCredential.user.uid).set({
                email: email,
                role: role,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            await secondaryApp.delete(); // Xóa app phụ

            alert(`Tạo thành công User: ${email} (${role})`);
            formCreateUser.reset();

        } catch (error) {
            console.error(error);
            alert("Lỗi: " + error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-plus"></i> Tạo User';
        }
    });
}
