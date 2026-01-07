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
let recentListenerUnsubscribe = null; // Quản lý Realtime

let systemSettings = {
    schoolName: "Trường THPT ...",
    address: "Địa chỉ ...",
    phone: "...",
    mealPrice: 35000,
    classList: [] 
};

// ==========================================
// 3. QUẢN LÝ AUTH (ĐĂNG NHẬP / ĐĂNG XUẤT)
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
        
        setTodayForInput();
        
        // Kích hoạt Realtime danh sách phiếu trong ngày
        setupRealtimeRecentList(); 
        
    } else {
        currentUser = null;
        document.getElementById('login-overlay').classList.remove('d-none');
        document.getElementById('main-app').classList.add('d-none');
    }
});

// Xử lý sự kiện bấm nút Đăng nhập
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-password').value;
        auth.signInWithEmailAndPassword(email, pass)
            .catch(err => alert("Lỗi đăng nhập: " + err.message));
    });
}

function logout() {
    auth.signOut().then(() => window.location.reload());
}

async function fetchUserRole(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        currentRole = doc.exists ? doc.data().role : 'staff';
        document.getElementById('role-display').innerText = currentRole.toUpperCase();
        
        // Phân quyền UI
        const adminEls = document.querySelectorAll('.admin-only');
        adminEls.forEach(e => e.style.display = currentRole === 'admin' ? 'block' : 'none');
    } catch (e) { console.error(e); }
}

function setTodayForInput() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    const inpDate = document.getElementById('inp-date');
    if(inpDate) inpDate.value = now.toISOString().slice(0, 16);
}

// ==========================================
// 4. CẤU HÌNH SETTINGS
// ==========================================
async function loadSettings() {
    try {
        const doc = await db.collection('settings').doc('general').get();
        if (doc.exists) systemSettings = { ...systemSettings, ...doc.data() };
        
        document.getElementById('set-name').value = systemSettings.schoolName;
        document.getElementById('set-address').value = systemSettings.address;
        document.getElementById('set-phone').value = systemSettings.phone;
        document.getElementById('set-price').value = systemSettings.mealPrice;
        
        const classes = systemSettings.classList || [];
        document.getElementById('set-classes').value = classes.join(', ');

        updateClassDatalist(classes);
        updatePriceDisplay();
    } catch (e) { console.log(e); }
}

function updateClassDatalist(classList) {
    const dataList = document.getElementById('list-classes');
    if (!dataList) return;
    dataList.innerHTML = '';
    
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
    } catch (err) { alert("Lỗi: " + err.message); }
});

// ==========================================
// 5. XỬ LÝ ẢNH (GLOBAL PASTE & UPLOAD)
// ==========================================
const imgPreview = document.getElementById('img-preview');
const placeholder = document.getElementById('paste-placeholder');
const btnRemoveImg = document.getElementById('btn-remove-img');
const inpImgBase64 = document.getElementById('inp-img-base64');
const inpFileUpload = document.getElementById('inp-file-upload');

// Xử lý khi chọn file từ máy
function handleFileUpload(input) {
    if (input.files && input.files[0]) {
        processImage(input.files[0]);
    }
}

// Bắt sự kiện Paste toàn cục
window.addEventListener('paste', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.type.indexOf('image') !== -1) {
            e.preventDefault();
            const blob = item.getAsFile();
            processImage(blob);
            break;
        }
    }
});

function processImage(file) {
    if (!file.type.match('image.*')) return alert("Chỉ chấp nhận file ảnh!");
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const MAX_WIDTH = 800;
            if (width > MAX_WIDTH) {
                height *= MAX_WIDTH / width;
                width = MAX_WIDTH;
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
            showImagePreview(dataUrl);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function showImagePreview(base64) {
    if(imgPreview) {
        imgPreview.src = base64;
        imgPreview.classList.remove('d-none');
        btnRemoveImg.classList.remove('d-none');
        placeholder.classList.add('d-none');
        inpImgBase64.value = base64;
        document.getElementById('inp-img-link').value = ""; 
    }
}

window.resetImage = function() {
    if(imgPreview) {
        imgPreview.src = "";
        imgPreview.classList.add('d-none');
        btnRemoveImg.classList.add('d-none');
        placeholder.classList.remove('d-none');
        inpImgBase64.value = "";
        if(inpFileUpload) inpFileUpload.value = ""; 
    }
}

// ==========================================
// 6. LOGIC LẬP PHIẾU THU & REALTIME LIST
// ==========================================

// --- REALTIME LIST MỚI ---
function setupRealtimeRecentList() {
    const startoday = new Date();
    startoday.setHours(0, 0, 0, 0);

    if (recentListenerUnsubscribe) recentListenerUnsubscribe();

    const query = db.collection('receipts')
        .where('createdAt', '>=', startoday)
        .orderBy('createdAt', 'desc');

    recentListenerUnsubscribe = query.onSnapshot((snapshot) => {
        const tbody = document.getElementById('tbody-recent');
        if(!tbody) return;
        
        tbody.innerHTML = '';
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Hôm nay chưa có phiếu nào</td></tr>';
            return;
        }

        snapshot.forEach(doc => {
            const d = doc.data();
            const timeStr = d.createdAt ? new Date(d.createdAt.seconds * 1000).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}) : '...';
            tbody.innerHTML += `
                <tr>
                    <td>${timeStr}</td>
                    <td>${d.studentName}</td>
                    <td>${d.studentClass}</td>
                    <td class="fw-bold text-success">${formatMoney(d.amount)}</td>
                </tr>
            `;
        });
    }, (error) => console.error("Realtime Error:", error));
}

function updatePriceDisplay() {
    const price = systemSettings.mealPrice;
    document.getElementById('inp-price-display').value = formatMoney(price);
    calculateTotalFromMeals();
}

function calculateTotalFromMeals() {
    const meals = parseFloat(document.getElementById('inp-meals').value) || 0;
    const total = meals * systemSettings.mealPrice;
    document.getElementById('inp-amount-hidden').value = total;
    document.getElementById('inp-amount-display').value = formatMoney(total);
}

function calculateMealsFromAmount() {
    const amountInput = document.getElementById('inp-amount-display');
    const mealsInput = document.getElementById('inp-meals');
    const hiddenAmount = document.getElementById('inp-amount-hidden');
    let rawAmount = amountInput.value.replace(/[^0-9]/g, '');
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

function formatAmountDisplay() {
    const amountInput = document.getElementById('inp-amount-display');
    let rawVal = amountInput.value.replace(/[^0-9]/g, '');
    if(rawVal) amountInput.value = formatMoney(parseInt(rawVal));
}

document.getElementById('inp-meals').addEventListener('input', calculateTotalFromMeals);

// SUBMIT FORM PHIẾU THU
document.getElementById('form-receipt').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseInt(document.getElementById('inp-amount-hidden').value);
    const meals = parseFloat(document.getElementById('inp-meals').value);
    
    if (amount <= 0) return alert("Số tiền phải lớn hơn 0");

    const dateInputVal = document.getElementById('inp-date').value;
    const paymentDate = dateInputVal ? new Date(dateInputVal) : new Date();

    const receiptData = {
        studentName: document.getElementById('inp-name').value,
        studentClass: document.getElementById('inp-class').value,
        mealCount: meals,
        unitPrice: systemSettings.mealPrice,
        amount: amount,
        reason: document.getElementById('inp-reason').value,
        paymentMethod: document.getElementById('inp-method').value,
        paymentDate: paymentDate,
        proofImage: document.getElementById('inp-img-base64').value || "",
        proofLink: document.getElementById('inp-img-link').value || ""
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
            document.getElementById('btn-print-recent').disabled = false;
            // alert("Lưu thành công!"); // Có thể bỏ alert nếu muốn nhanh
        }

        resetForm(true);
        // Không cần loadRecentReceipts() nữa vì đã có Realtime
        loadReceipts('manage'); 
    } catch (err) { alert("Lỗi lưu: " + err.message); }
});

function resetForm(full = true) {
    if(full) {
        document.getElementById('form-receipt').reset();
        resetImage();
        setTodayForInput();
        
        editingReceiptId = null;
        const btnSubmit = document.querySelector('#form-receipt button[type="submit"]');
        btnSubmit.innerHTML = "Lưu Phiếu";
        btnSubmit.classList.replace('btn-success', 'btn-primary'); 
        document.getElementById('btn-print-recent').disabled = true;
    }
    updatePriceDisplay();
    document.getElementById('inp-name').focus();
}

// ==========================================
// 7. QUẢN LÝ & BÁO CÁO
// ==========================================
async function loadReceipts(mode = 'manage') {
    const filterTime = document.getElementById(`filter-time-${mode}`).value;
    const tbody = document.getElementById(mode === 'manage' ? 'tbody-manage' : 'tbody-report');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Đang tải...</td></tr>';

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
        .where('paymentDate', '>=', startDate)
        .where('paymentDate', '<=', endDate)
        .orderBy('paymentDate', 'desc');

    try {
        const snap = await query.get();
        tbody.innerHTML = '';
        let totalMoney = 0, totalMeals = 0, count = 0;

        snap.forEach(doc => {
            const d = doc.data();
            const id = doc.id;
            
            if (mode === 'manage') {
                const search = document.getElementById('search-manage').value.toLowerCase();
                const name = d.studentName ? d.studentName.toLowerCase() : "";
                const cls = d.studentClass ? d.studentClass.toLowerCase() : "";
                if (search && !name.includes(search) && !cls.includes(search)) return;
            }

            const dateStr = d.paymentDate ? new Date(d.paymentDate.seconds*1000).toLocaleString('vi-VN') : '';
            totalMoney += d.amount;
            totalMeals += d.mealCount;
            count++;

            let imgCell = '<span class="text-muted small">--</span>';
            if (d.proofImage) {
                imgCell = `<a href="#" onclick="viewImage('${id}'); return false;">Xem ảnh</a>`;
            } else if (d.proofLink) {
                imgCell = `<a href="${d.proofLink}" target="_blank">Xem Link</a>`;
            }

            let actionBtns = '';
            if ((currentRole === 'admin' || currentRole === 'accountant') && mode === 'manage') {
                actionBtns = `
                    <button class="btn btn-sm btn-warning me-1" onclick="editReceipt('${id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-sm btn-danger" onclick="deleteReceipt('${id}')"><i class="fas fa-trash"></i></button>
                `;
            }

            const row = `<tr>
                <td>${mode === 'report' ? count : dateStr}</td>
                <td>${mode === 'report' ? dateStr : (d.receiptCode || '...')}</td>
                <td>${d.studentName}</td>
                <td>${d.studentClass}</td>
                <td class="fw-bold">${formatMoney(d.amount)}</td>
                <td>${mode === 'manage' ? imgCell : (d.proofLink || d.reason)}</td>
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
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="7" class="text-danger text-center">Lỗi: Cần tạo Index cho paymentDate (Xem console)</td></tr>`;
    }
}

function viewImage(id) {
    db.collection('receipts').doc(id).get().then(doc => {
        if(doc.exists && doc.data().proofImage) {
            const win = window.open();
            win.document.write(`<img src="${doc.data().proofImage}" style="max-width:100%">`);
        }
    });
}

// ==========================================
// 8. UTILS & IN ẤN
// ==========================================
async function deleteReceipt(id) {
    if(!confirm("Bạn chắc chắn muốn xóa?")) return;
    await db.collection('receipts').doc(id).delete();
    loadReceipts('manage');
}

async function editReceipt(id) {
    try {
        const doc = await db.collection('receipts').doc(id).get();
        if (!doc.exists) return;
        const d = doc.data();
        
        if (d.paymentDate) {
            const dt = new Date(d.paymentDate.seconds * 1000);
            dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
            document.getElementById('inp-date').value = dt.toISOString().slice(0, 16);
        }

        document.getElementById('inp-name').value = d.studentName;
        document.getElementById('inp-class').value = d.studentClass;
        document.getElementById('inp-meals').value = d.mealCount;
        document.getElementById('inp-reason').value = d.reason;
        document.getElementById('inp-method').value = d.paymentMethod;
        document.getElementById('inp-amount-hidden').value = d.amount;
        document.getElementById('inp-amount-display').value = formatMoney(d.amount);
        
        if (d.proofImage) showImagePreview(d.proofImage);
        else resetImage();
        
        if (d.proofLink) document.getElementById('inp-img-link').value = d.proofLink;

        editingReceiptId = id;
        const btnSubmit = document.querySelector('#form-receipt button[type="submit"]');
        btnSubmit.innerHTML = "Cập nhật Phiếu";
        btnSubmit.classList.replace('btn-primary', 'btn-success');
        new bootstrap.Tab(document.querySelector('button[data-bs-target="#tab-phieuthu"]')).show();

    } catch (e) { alert("Lỗi: " + e.message); }
}

function formatMoney(num) { return num ? num.toLocaleString('vi-VN') : '0'; }
function docSoThanhChu(n) { return formatMoney(n) + " đồng"; }

function preparePrintData(data) {
    document.getElementById('p-school-name').innerText = systemSettings.schoolName;
    document.getElementById('p-school-addr').innerText = systemSettings.address;
    
    const dateObj = data.paymentDate ? new Date(data.paymentDate.seconds * 1000) : new Date();
    document.getElementById('p-date').innerText = dateObj.toLocaleDateString('vi-VN');

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
    const doc = await db.collection('receipts').doc(id).get();
    if(doc.exists) { lastReceiptData = doc.data(); printLastReceipt(); }
}
function printReport() { document.body.classList.add('print-report-mode'); window.print(); document.body.classList.remove('print-report-mode'); }
function exportExcel() { const wb = XLSX.utils.table_to_book(document.getElementById("table-report"), {sheet: "BaoCao"}); XLSX.writeFile(wb, "BaoCao_DoanhThu.xlsx"); }

// Tạo User (Admin Only)
const formCreateUser = document.getElementById('form-create-user');
if (formCreateUser) {
    formCreateUser.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('new-user-email').value;
        const password = document.getElementById('new-user-pass').value;
        const role = document.getElementById('new-user-role').value;
        const btn = document.getElementById('btn-create-user');
        
        try {
            btn.innerHTML = 'Đang tạo...'; btn.disabled = true;
            const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
            const uc = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
            await db.collection('users').doc(uc.user.uid).set({ email, role, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            await secondaryApp.delete();
            alert("Tạo User thành công!"); formCreateUser.reset();
        } catch (error) { alert("Lỗi: " + error.message); }
        finally { btn.innerHTML = 'Tạo User'; btn.disabled = false; }
    });
}
