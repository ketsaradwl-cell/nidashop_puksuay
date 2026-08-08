// 🔌 นำ URL และ Key จากหน้า Supabase มาใส่วางในเครื่องหมายคำพูดตามนี้เลยครับ
const SUPABASE_URL = "https://xviotthylkwyiiwrhoxd.supabase.co";
const SUPABASE_KEY = "sb_publishable_kZ_g9Q2yA_DbNvOHBYTIsQ_1C0djXgv";
const DEPOSIT_DATE_FIELD = 'deposit_date';
let searchDebounceTimer = null;
let activeSearchRequestId = 0;
let queueCatalogCache = [];

function normalizeDateToISO(value) {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const isoPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
    const slashPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;

    let year, month, day;

    const isoMatch = isoPattern.exec(trimmed);
    if (isoMatch) {
        year = Number(isoMatch[1]);
        month = Number(isoMatch[2]);
        day = Number(isoMatch[3]);
    } else {
        const slashMatch = slashPattern.exec(trimmed);
        if (!slashMatch) return null;

        day = Number(slashMatch[1]);
        month = Number(slashMatch[2]);
        year = Number(slashMatch[3]);

        if (String(slashMatch[3]).length === 2) {
            year = year < 30 ? 2000 + year : 2500 + year - 543;
        }
    }

    if (month < 1 || month > 12 || day < 1) return null;
    const maxDay = new Date(year, month, 0).getDate();
    if (day > maxDay) return null;

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatISODateForDisplay(value) {
    if (!value) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) return value;

    const day = match[3];
    const month = match[2];
    const year = match[1];
    return `${day}/${month}/${year}`;
}

function getJobTypePrefix(jobType) {
    return jobType === 'Rep' ? 'Rep' : 'Em';
}

function buildQueueId(jobType, queueNumber) {
    const prefix = getJobTypePrefix(jobType);
    return `${prefix} ${String(queueNumber)}`;
}

function parseQueueNumber(queueId) {
    if (!queueId) return null;
    const trimmed = String(queueId).trim();
    const match = trimmed.match(/^(Em|Rep)\s+(\d+)$/i);
    if (match) {
        return Number(match[2]);
    }

    const numericMatch = trimmed.match(/^(\d+)$/);
    if (numericMatch) {
        return Number(numericMatch[1]);
    }

    return null;
}

function getNextQueueNumber(items, jobType) {
    const prefix = getJobTypePrefix(jobType).toUpperCase();
    let highest = 0;

    (items || []).forEach((item) => {
        const queueId = item?.queue_id;
        if (!queueId) return;

        const parsed = parseQueueNumber(queueId);
        if (parsed === null) return;

        const queuePrefix = String(queueId).trim().split(/\s+/)[0]?.toUpperCase();
        if (queuePrefix && queuePrefix !== prefix) return;

        if (parsed > highest) {
            highest = parsed;
        }
    });

    return highest + 1;
}

async function refreshQueueNumberField() {
    const queueInput = document.getElementById('queueNumber');
    const jobTypeSelect = document.getElementById('jobType');
    if (!queueInput || !jobTypeSelect) return;

    const jobType = jobTypeSelect.value;

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/nidashop_puksuay?select=queue_id`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        const data = await response.json();
        queueCatalogCache = Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Failed to refresh queue number:', error);
        queueCatalogCache = [];
    }

    const nextQueueNumber = getNextQueueNumber(queueCatalogCache, jobType);
    queueInput.value = buildQueueId(jobType, nextQueueNumber);
    queueInput.readOnly = true;
}

function handleEmployeeChange() {
    const employeeSelect = document.getElementById('employeeName');
    const customInput = document.getElementById('customEmployeeName');
    
    if (employeeSelect.value === 'custom') {
        customInput.style.display = 'block';
        customInput.focus();
    } else {
        customInput.style.display = 'none';
        customInput.value = '';
    }
}

async function saveData() {
    await addNewQueue();
}

function clearSearchSuggestions() {
    const suggestions = document.getElementById('searchSuggestions');
    if (suggestions) {
        suggestions.innerHTML = '';
        suggestions.style.display = 'none';
    }
}

function displayQueueResult(item) {
    if (!item) return;

    const resultCard = document.getElementById('resultCard');
    const noResult = document.getElementById('noResult');
    const statusSpan = document.getElementById('resStatus');
    const paymentSpan = document.getElementById('resPayment');

    document.getElementById('resId').innerText = item.queue_id || '-';
    document.getElementById('resName').innerText = item.customer_name || '-';
    document.getElementById('resDate').innerText = formatISODateForDisplay(item[DEPOSIT_DATE_FIELD]) || '-';
    document.getElementById('resDelivery').innerText = item.delivery || '-';
    document.getElementById('resEmployee').innerText = item.employee_name || '-';

    statusSpan.innerText = item.status || '-';
    statusSpan.className = 'status-badge ' + getStatusClass(item.status);

    paymentSpan.innerText = item.payment || '-';
    paymentSpan.className = 'payment-badge ' + getPaymentClass(item.payment);

    resultCard.style.display = 'block';
    noResult.style.display = 'none';
}

function renderSearchSuggestions(matches) {
    const suggestions = document.getElementById('searchSuggestions');
    if (!suggestions) return;

    suggestions.innerHTML = '';
    if (!matches || matches.length === 0) {
        suggestions.style.display = 'none';
        return;
    }

    const visibleMatches = matches.slice(0, 8);
    visibleMatches.forEach((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'search-suggestion-item';

        const mainText = document.createElement('span');
        mainText.className = 'search-suggestion-main';
        mainText.textContent = `${item.queue_id || '-'} · ${item.customer_name || '-'}`;

        const subText = document.createElement('span');
        subText.className = 'search-suggestion-sub';
        subText.textContent = `${formatISODateForDisplay(item[DEPOSIT_DATE_FIELD]) || '-'} · ${item.status || '-'}`;

        button.appendChild(mainText);
        button.appendChild(subText);
        button.addEventListener('click', () => displayQueueResult(item));
        suggestions.appendChild(button);
    });

    suggestions.style.display = 'flex';
}

// ฟังก์ชันหลักในการค้นหาข้อมูลคิวงาน
async function searchQueue() {
    const searchInput = document.getElementById('searchInput').value.trim();
    const resultCard = document.getElementById('resultCard');
    const noResult = document.getElementById('noResult');

    if (searchInput === '') {
        clearTimeout(searchDebounceTimer);
        activeSearchRequestId += 1;
        clearSearchSuggestions();
        resultCard.style.display = 'none';
        noResult.style.display = 'none';
        return;
    }

    const requestId = ++activeSearchRequestId;
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(async () => {
        try {
            const response = await fetch(`${SUPABASE_URL}/rest/v1/nidashop_puksuay?select=*`, {
                method: 'GET',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });

            const data = await response.json();
            const currentInput = document.getElementById('searchInput').value.trim();
            if (requestId !== activeSearchRequestId || currentInput === '') {
                return;
            }

            const normalizedInput = currentInput.toLowerCase();
            const normalizedDate = normalizeDateToISO(currentInput);

            const matches = (data || []).filter((item) => {
                const queueId = String(item.queue_id || '').toLowerCase();
                const customerName = String(item.customer_name || '').toLowerCase();
                const depositValue = String(item[DEPOSIT_DATE_FIELD] || '').toLowerCase();
                const displayDate = formatISODateForDisplay(item[DEPOSIT_DATE_FIELD]).toLowerCase();

                return queueId.includes(normalizedInput) ||
                    customerName.includes(normalizedInput) ||
                    displayDate.includes(normalizedInput) ||
                    depositValue.includes(normalizedInput) ||
                    (normalizedDate && depositValue === normalizedDate);
            });

            if (requestId !== activeSearchRequestId || currentInput === '') {
                return;
            }

            if (matches.length > 0) {
                if (matches.length === 1) {
                    displayQueueResult(matches[0]);
                    clearSearchSuggestions();
                } else {
                    renderSearchSuggestions(matches);
                    resultCard.style.display = 'none';
                    noResult.style.display = 'none';
                }
            } else {
                clearSearchSuggestions();
                resultCard.style.display = 'none';
                noResult.innerText = '❌ ไม่พบข้อมูลคิวนี้';
                noResult.style.display = 'block';
            }
        } catch (error) {
            if (requestId !== activeSearchRequestId) {
                return;
            }
            console.error('Search failed:', error);
            clearSearchSuggestions();
            resultCard.style.display = 'none';
            noResult.style.display = 'none';
        }
    }, 180);
}

function getStatusClass(status) {
    if (!status) return 'status-neutral';

    if (status.includes('ยังไม่ได้') || status.includes('รอ')) {
        return 'status-pending';
    }

    if (status.includes('แล้ว') || status.includes('เรียบร้อย')) {
        return 'status-done';
    }

    return 'status-neutral';
}

function getPaymentClass(payment) {
    if (!payment) return 'payment-unpaid';

    if (payment.includes('จ่าย')) {
        return 'payment-paid';
    }

    return 'payment-unpaid';
}

// // ฟังก์ชันสำหรับแอดมินหลังบ้านเพิ่มคิวงานใหม่ (เวอร์ชันดึงค่าสถานะตามที่แอดมินเลือกจริง)
async function addNewQueue() {
    const jobType = document.getElementById('jobType').value;
    const custName = document.getElementById('custName').value;
    const custDate = document.getElementById('custDate').value;
    const depositDate = normalizeDateToISO(custDate);
    
    // 💡 จุดที่เพิ่มเข้ามาใหม่: ดึงค่าสถานะต่างๆ จาก index.html
    const jobStatus = document.getElementById('jobStatus').value;
    const jobPayment = document.getElementById('jobPayment').value;
    const jobDelivery = document.getElementById('jobDelivery').value || 'ยังไม่ส่ง';
    const employeeSelect = document.getElementById('employeeName');
    const customEmployeeInput = document.getElementById('customEmployeeName');
    let employeeName = employeeSelect.value === 'custom' ? customEmployeeInput.value.trim() : employeeSelect.value;
    
    if (!custName || !depositDate) {
        alert('กรุณากรอกชื่อลูกค้าและวันที่มาฝากด้วยครับ');
        return;
    }

    const fullQueueId = buildQueueId(jobType, getNextQueueNumber(queueCatalogCache, jobType));

    const newOrder = {
        queue_id: fullQueueId,
        customer_name: custName,
        [DEPOSIT_DATE_FIELD]: depositDate,
        status: jobStatus,      // ใช้ค่าตามที่แอดมินเลือก
        payment: jobPayment,    // ใช้ค่าตามที่แอดมินเลือก
        delivery: jobDelivery,
        employee_name: employeeName,
        created_at: new Date().toISOString()
    };

    try {
        // ส่งข้อมูลไปบันทึกบน Supabase ออนไลน์คลาวด์
        const response = await fetch(`${SUPABASE_URL}/rest/v1/nidashop_puksuay`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(newOrder)
        });

        const responseText = await response.text();
        let errorDetail = responseText;

        try {
            const parsed = JSON.parse(responseText);
            errorDetail = parsed?.message || JSON.stringify(parsed);
        } catch (e) {
            // ใช้ข้อความดิบจาก Supabase หากไม่ใช่ JSON
        }

        if (response.ok) {
            alert('💾 บันทึกข้อมูลคิวใหม่ลงฐานข้อมูล Supabase เรียบร้อยแล้ว!');
            queueCatalogCache = [...queueCatalogCache, { queue_id: fullQueueId }];
            const queueInput = document.getElementById('queueNumber');
            if (queueInput) {
                queueInput.value = buildQueueId(jobType, getNextQueueNumber(queueCatalogCache, jobType));
            }
            document.getElementById('custName').value = '';
            document.getElementById('custDate').value = '';
            document.getElementById('jobDelivery').value = 'ยังไม่ส่ง';
            document.getElementById('employeeName').value = '';
            loadAdminTable(); // อัปเดตตารางหลังบ้าน
        } else {
            console.error('Supabase insert failed:', response.status, errorDetail);
            if (response.status === 401 || response.status === 403 || errorDetail.includes('row-level security')) {
                alert(`บันทึกไม่สำเร็จ\nเนื่องจากนโยบาย Row Level Security ของ Supabase\nกรุณาตั้งค่า policy ให้ตาราง \"nidashop_puksuay\" อนุญาต INSERT จากผู้ใช้ Anonymous/anon หรือปิด RLS สำหรับตารางนี้`);
            } else {
                alert(`บันทึกไม่สำเร็จ\nสถานะ: ${response.status}\n${errorDetail}`);
            }
        }
    } catch (error) {
        console.error('Save failed:', error);
        alert(`บันทึกไม่สำเร็จ เนื่องจากเกิดข้อผิดพลาดในการเชื่อมต่อ\n${error.message || error}`);
    }
}

async function deleteQueue(id) {
    const confirmation = confirm(`ยืนยันลบคิวที่ ${id} ?`);
    if (!confirmation) return;

    const response = await fetch(`${SUPABASE_URL}/rest/v1/nidashop_puksuay?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    if (response.ok) {
        alert(`ลบคิวที่ ${id} เรียบร้อยแล้ว`);
        loadAdminTable();
    } else {
        const errorText = await response.text();
        alert(`ไม่สามารถลบข้อมูลได้ กรุณาลองใหม่\n${errorText}`);
    }
}

// ฟังก์ชันดึงคิวงานทั้งหมดมาโชว์ในตารางแอดมิน
async function loadAdminTable() {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/nidashop_puksuay?order=created_at.desc`, {
        method: 'GET',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    const data = await response.json();
    const tbody = document.getElementById('adminTableBody');
    if(!tbody) return;
    tbody.innerHTML = '';

    data.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${item.queue_id}</td>
            <td>${item.customer_name}</td>
            <td>${formatISODateForDisplay(item[DEPOSIT_DATE_FIELD]) || '-'}</td>
            <td><span class="status-badge">${item.status}</span></td>
            <td>${item.payment}</td>
            <td>${item.delivery || '-'}</td>
            <td>${item.employee_name || '-'}</td>
            <td><button class="delete-btn" onclick="deleteQueue(${item.id})">ลบ</button></td>
        `;
        tbody.appendChild(tr);
    });
}


document.addEventListener('DOMContentLoaded', () => {
    const passwordInput = document.getElementById('adminPasswordInput');
    if (passwordInput) {
        passwordInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                checkAdminPassword();
            }
        });
    }

    const jobTypeSelect = document.getElementById('jobType');
    if (jobTypeSelect) {
        jobTypeSelect.addEventListener('change', () => {
            refreshQueueNumberField();
        });
    }

    refreshQueueNumberField();
});

// ✅ แก้ไขให้ .style มีแค่อันเดียวเรียบร้อยแล้ว
function loginAdmin() {
    const passwordArea = document.getElementById('passwordArea');
    const passwordInput = document.getElementById('adminPasswordInput');

    if (passwordArea) {
        passwordArea.style.display = 'flex';
    }

    if (passwordInput) {
        passwordInput.value = '';
        setTimeout(() => passwordInput.focus(), 50);
    }
}

function closePasswordModal() {
    const passwordArea = document.getElementById('passwordArea');
    if (passwordArea) {
        passwordArea.style.display = 'none';
    }
}

// ฟังก์ชันตรวจสอบรหัสผ่านเมื่อกดปุ่มตกลงสีเขียว
function checkAdminPassword() {
    const passwordMaster = "1234"; // 🔑 รหัสผ่านของร้าน
    const userPassword = document.getElementById('adminPasswordInput').value;

    if (userPassword === passwordMaster) {
        document.getElementById('passwordArea').style.display = 'none'; // ซ่อนกล่องรหัส
        document.getElementById('adminPasswordInput').value = ''; // ล้างรหัสที่พิมพ์ค้างไว้
        document.getElementById('adminSection').style.display = 'block'; // เปิดหลังร้าน
        loadAdminTable();
    } else {
        alert("❌ รหัสผ่านไม่ถูกต้อง! ไม่สามารถเข้าสู่ระบบได้");
    }
}

function logoutAdmin() {
    document.getElementById('adminSection').style.display = 'none';
    const passArea = document.getElementById('passwordArea');
    if (passArea) passArea.style.display = 'none';
}