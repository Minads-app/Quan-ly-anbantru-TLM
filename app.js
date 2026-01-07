// --- 1. CẤU HÌNH FIREBASE (THAY THẾ BẰNG KEY CỦA BẠN) ---
const firebaseConfig = {
  apiKey: "AIzaSyAKmHgrchZwCYaZW0ky831Oj6qQrUS2HuI",
  authDomain: "quan-ly-ban-tru-tlm.firebaseapp.com",
  projectId: "quan-ly-ban-tru-tlm",
  storageBucket: "quan-ly-ban-tru-tlm.firebasestorage.app",
  messagingSenderId: "22398649576",
  appId: "1:22398649576:web:89f0323537781697adf55d"
};

// Khởi tạo
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// --- 2. BIẾN TOÀN CỤC & STATE ---
let currentUser = null;
let currentRole = null;
let systemSettings = {
    schoolName: "Trường THPT ...",
    address: "Địa chỉ ...",
    phone: "...",
    mealPrice: 30000 
};
let lastReceiptData = null; // Để in phiếu vừa tạo

// --- 3. QUẢN LÝ AUTH & PHÂN QUYỀN ---

// Lắng nghe trạng thái đăng nhập
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('login-overlay').classList.add('d-none');
        document.getElementById('main-app').classList.remove('d-none');
        
        // Lấy thông tin Role & Settings
        await fetchUserRole(user.uid);
        await loadSettings();
        
        document.getElementById('user-display').innerText = user.email;
        loadReceipts('manage'); // Load dữ liệu ban đầu
    } else {
        currentUser = null;
        document.getElementById('login-overlay').classList.remove('d-none');
        document.getElementById('main-app').classList.add('d-none');
    }
});

// Xử lý Login Form
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert("Lỗi: " + err.message));
});

function logout() {
    auth.signOut();
    window.location.reload();
}

// Lấy Role từ Firestore
async function fetchUserRole(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) {
            currentRole = doc.data().role; // admin, accountant, staff
        } else {
            currentRole = 'staff'; // Mặc định nếu chưa set
        }
        document.getElementById('role-display').innerText = currentRole.toUpperCase();
        applyPermissons(currentRole);
    } catch (e) { console.error(e); }
}

// Ẩn hiện nút theo quyền
function applyPermissons(role) {
    const adminEls = document.querySelectorAll('.admin-only');
    const accEls = document.querySelectorAll('.accountant-only'); // Dành cho nút Sửa/Xóa (nếu có)
    
    // Reset
    adminEls.forEach(e => e.style.display = 'none');
    
    if (role === 'admin') {
        adminEls.forEach(e => e.style.display = 'block');
    }
    // Accountant logic có thể thêm ở đây
}

// --- 4. CẤU HÌNH & SETTINGS ---
async function loadSettings() {
    try {
        const doc = await db.collection('settings').doc('general').get();
        if (doc.exists) {
            // Merge dữ liệu mới vào settings (để tránh mất field classList nếu db cũ chưa có)
            systemSettings = { ...systemSettings, ...doc.data() };
        }

        // 1. Điền vào form Cấu hình
        document.getElementById('set-name').value = systemSettings.schoolName;
        document.getElementById('set-address').value = systemSettings.address;
        document.getElementById('set-phone').value = systemSettings.phone;
        document.getElementById('set-price').value = systemSettings.mealPrice;
        
        // MỚI: Hiển thị danh sách lớp ra Textarea (nối bằng dấu phẩy)
        const classes = systemSettings.classList || [];
        document.getElementById('set-classes').value = classes.join(', ');

        // 2. Cập nhật Dropdown Lớp ở màn hình Lập phiếu thu
        updateClassSelect(classes);

        // 3. Cập nhật giá lên Form Nhập
        updatePriceDisplay();
    } catch (e) { console.log("Lỗi load settings hoặc chưa có cấu hình: ", e); }
}

// Hàm phụ trợ: Render danh sách lớp vào thẻ Select
function updateClassSelect(classList) {
    const selectEl = document.getElementById('inp-class');
    // Giữ lại option mặc định đầu tiên
    selectEl.innerHTML = '<option value="">-- Chọn lớp --</option>';
    
    if (classList && classList.length > 0) {
        classList.forEach(className => {
            const opt = document.createElement('option');
            opt.value = className;
            opt.innerText = className;
            selectEl.appendChild(opt);
        });
    } else {
        // Nếu chưa có lớp nào, thêm 1 option báo lỗi
        const opt = document.createElement('option');
        opt.innerText = "Chưa cấu hình lớp!";
        opt.disabled = true;
        selectEl.appendChild(opt);
    }
}

document.getElementById('form-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (currentRole !== 'admin') return alert("Bạn không có quyền!");
    
    // Xử lý danh sách lớp: Tách dấu phẩy -> Xóa khoảng trắng thừa -> Lọc rỗng
    const rawClasses = document.getElementById('set-classes').value;
    const classArray = rawClasses.split(',').map(c => c.trim()).filter(c => c !== "");

    const newSettings = {
        schoolName: document.getElementById('set-name').value,
        address: document.getElementById('set-address').value,
        phone: document.getElementById('set-phone').value,
        mealPrice: parseInt(document.getElementById('set-price').value),
        classList: classArray // MỚI: Lưu mảng lớp
    };
    
    try {
        await db.collection('settings').doc('general').set(newSettings);
        alert("Đã lưu cấu hình và cập nhật danh sách lớp!");
        loadSettings(); // Reload lại để áp dụng ngay
    } catch (err) {
        alert("Lỗi lưu: " + err.message);
    }
});

// --- 5. LOGIC LẬP PHIẾU THU ---

function updatePriceDisplay() {
    const price = systemSettings.mealPrice;
    document.getElementById('inp-price-display').value = formatMoney(price);
    calculateTotal();
}

function calculateTotal() {
    const meals = parseInt(document.getElementById('inp-meals').value) || 0;
    const total = meals * systemSettings.mealPrice;
    document.getElementById('inp-amount-hidden').value = total;
    document.getElementById('inp-amount-display').value = formatMoney(total);
}

document.getElementById('inp-meals').addEventListener('input', calculateTotal);

document.getElementById('form-receipt').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseInt(document.getElementById('inp-amount-hidden').value);
    
    // VALIDATION
    if (amount <= 0) return alert("Số tiền phải lớn hơn 0");
    if (amount % systemSettings.mealPrice !== 0) return alert("Lỗi: Tiền không chẵn theo đơn giá!");

    const receiptData = {
        studentName: document.getElementById('inp-name').value,
        studentClass: document.getElementById('inp-class').value,
        mealCount: parseInt(document.getElementById('inp-meals').value),
        unitPrice: systemSettings.mealPrice,
        amount: amount,
        reason: document.getElementById('inp-reason').value,
        paymentMethod: document.getElementById('inp-method').value,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        createdBy: currentUser.email,
        receiptCode: "PT" + Date.now().toString().slice(-6) // Mã phiếu đơn giản
    };

    try {
        await db.collection('receipts').add(receiptData);
        alert("Lưu phiếu thành công!");
        lastReceiptData = receiptData;
        lastReceiptData.createdAtDate = new Date(); // Fix lỗi hiển thị ngày khi vừa tạo
        
        document.getElementById('btn-print-recent').disabled = false;
        loadRecentReceipts(); // Update list nhỏ bên phải
        resetForm(false);
    } catch (err) {
        alert("Lỗi lưu: " + err.message);
    }
});

function resetForm(full = true) {
    if(full) document.getElementById('form-receipt').reset();
    updatePriceDisplay();
    document.getElementById('inp-name').focus();
}

// List nhỏ bên tab nhập
async function loadRecentReceipts() {
    const snap = await db.collection('receipts').orderBy('createdAt', 'desc').limit(5).get();
    const tbody = document.getElementById('tbody-recent');
    tbody.innerHTML = '';
    snap.forEach(doc => {
        const d = doc.data();
        tbody.innerHTML += `<tr>
            <td>${d.createdAt ? new Date(d.createdAt.seconds*1000).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'}) : '...'}</td>
            <td>${d.studentName}</td>
            <td>${d.studentClass}</td>
            <td>${formatMoney(d.amount)}</td>
        </tr>`;
    });
}

// --- 6. QUẢN LÝ & BÁO CÁO (Logic dùng chung) ---

async function loadReceipts(mode = 'manage') {
    const filterTime = document.getElementById(`filter-time-${mode}`).value;
    const tbody = document.getElementById(mode === 'manage' ? 'tbody-manage' : 'tbody-report');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Đang tải...</td></tr>';

    // Xử lý ngày tháng
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
        startDate = new Date(2020, 0, 1); // Rất xa
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
        
        // Search Client-side (đơn giản) cho mode manage
        if (mode === 'manage') {
            const search = document.getElementById('search-manage').value.toLowerCase();
            if (search && !d.studentName.toLowerCase().includes(search) && !d.studentClass.toLowerCase().includes(search)) return;
        }

        const dateStr = d.createdAt ? new Date(d.createdAt.seconds*1000).toLocaleString('vi-VN') : '';
        totalMoney += d.amount;
        totalMeals += d.mealCount;
        count++;

        // Nút xóa chỉ hiện cho admin/kế toán
        const deleteBtn = (currentRole === 'admin' || currentRole === 'accountant') 
            ? `<button class="btn btn-sm btn-danger" onclick="deleteReceipt('${id}')"><i class="fas fa-trash"></i></button>` : '';

        const row = `<tr>
            <td>${mode === 'report' ? count : dateStr}</td>
            <td>${mode === 'report' ? dateStr : d.receiptCode}</td>
            <td>${d.studentName}</td>
            <td>${d.studentClass}</td>
            <td class="fw-bold">${formatMoney(d.amount)}</td>
            <td>${mode === 'report' ? d.mealCount : d.createdBy}</td>
            <td>
                ${mode === 'manage' ? deleteBtn : d.paymentMethod}
                ${mode === 'manage' ? `<button class="btn btn-sm btn-secondary" onclick="rePrint('${id}')"><i class="fas fa-print"></i></button>` : ''}
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

// Xóa phiếu
async function deleteReceipt(id) {
    if(!confirm("Bạn chắc chắn muốn xóa phiếu này? Hành động không thể hoàn tác.")) return;
    try {
        await db.collection('receipts').doc(id).delete();
        alert("Đã xóa");
        loadReceipts('manage');
    } catch (e) { alert("Lỗi: " + e.message); }
}

// --- 7. IN ẤN & UTILS ---

// Helper định dạng tiền
function formatMoney(num) {
    return num.toLocaleString('vi-VN');
}

// Helper đọc số tiền (Đơn giản)
function docSoThanhChu(number) {
    // Đây là placeholder. Để code ngắn gọn, ta dùng ví dụ. 
    // Thực tế bạn nên dùng thư viện 'vietnamese-number-reader'
    return number.toLocaleString('vi-VN') + " đồng"; 
}

// Chuẩn bị dữ liệu để in
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

// In phiếu vừa tạo
function printLastReceipt() {
    if (!lastReceiptData) return;
    preparePrintData(lastReceiptData);
    document.body.classList.add('print-receipt-mode');
    window.print();
    document.body.classList.remove('print-receipt-mode');
}

// In lại phiếu từ danh sách
async function rePrint(id) {
    const doc = await db.collection('receipts').doc(id).get();
    lastReceiptData = doc.data();
    printLastReceipt();
}

// In báo cáo
function printReport() {
    document.body.classList.add('print-report-mode');
    window.print();
    document.body.classList.remove('print-report-mode');
}

// Xuất Excel
function exportExcel() {
    const table = document.getElementById("table-report");
    const wb = XLSX.utils.table_to_book(table, {sheet: "BaoCao"});
    XLSX.writeFile(wb, "BaoCao_DoanhThu.xlsx");

}
// --- 8. CHỨC NĂNG TẠO USER (Dành cho Admin) ---

const formCreateUser = document.getElementById('form-create-user');
const msgBox = document.getElementById('create-msg');

if (formCreateUser) {
    formCreateUser.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Kiểm tra quyền Admin lần cuối ở client (Database Rules sẽ chặn nếu gian lận)
        if (currentRole !== 'admin') {
            alert("Bạn không có quyền thực hiện chức năng này!");
            return;
        }

        const email = document.getElementById('new-user-email').value;
        const password = document.getElementById('new-user-pass').value;
        const role = document.getElementById('new-user-role').value;
        const btn = document.getElementById('btn-create-user');

        if (password.length < 6) {
            alert("Mật khẩu phải từ 6 ký tự trở lên!");
            return;
        }

        try {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang tạo...';
            msgBox.innerText = "";

            // KỸ THUẬT QUAN TRỌNG: Secondary App
            // Tạo một instance firebase phụ để tạo user mà không làm Admin bị logout
            const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
            
            // 1. Tạo Authentication User trên app phụ
            const userCredential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
            const newUid = userCredential.user.uid;

            // 2. Ghi Role vào Firestore (Dùng App chính - db của Admin để có quyền ghi)
            await db.collection('users').doc(newUid).set({
                email: email,
                role: role,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // 3. Xóa app phụ để dọn dẹp bộ nhớ
            await secondaryApp.delete();

            alert(`Đã tạo thành công user: ${email} với quyền ${role.toUpperCase()}`);
            formCreateUser.reset();

        } catch (error) {
            console.error(error);
            let message = error.message;
            if (error.code === 'auth/email-already-in-use') {
                message = "Email này đã được sử dụng!";
            }
            alert("Lỗi: " + message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-user-plus"></i> Tạo User';
        }
    });
}

