// 🔌 นำ URL และ Key จากหน้า Supabase มาใส่วางในเครื่องหมายคำพูดตามนี้เลยครับ
const SUPABASE_URL = "https://xviotthylkwyiiwrhoxd.supabase.co";
const SUPABASE_KEY = "sb_publishable_kZ_g9Q2yA_DbNvOHBYTIsQ_1C0djXgv";
const DEPOSIT_DATE_FIELD = 'deposit_date';
const AUTO_DELETE_AFTER_DAYS = 30;
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

function normalizeQueueSearch(value) {
    const compactValue = String(value || '').trim().replace(/\s+/g, '').toLowerCase();
    const match = compactValue.match(/^(em|rep|rap)(\d+)$/);
    if (!match) return null;

    const prefix = match[1] === 'em' ? 'em' : 'rep';
    return `${prefix}${Number(match[2])}`;
}

function getNormalizedQueueId(queueId) {
    return normalizeQueueSearch(queueId);
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
    const usedNumbers = new Set();

    (items || []).forEach((item) => {
        const queueId = item?.queue_id;
        if (!queueId) return;

        const parsed = parseQueueNumber(queueId);
        if (parsed === null) return;

        const queuePrefix = String(queueId).trim().split(/\s+/)[0]?.toUpperCase();
        if (queuePrefix && queuePrefix !== prefix) return;

        usedNumbers.add(parsed);
    });

    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) {
        nextNumber += 1;
    }
    return nextNumber;
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

function updateJobStatusOptions() {
    const jobTypeSelect = document.getElementById('jobType');
    const statusSelect = document.getElementById('jobStatus');
    if (!jobTypeSelect || !statusSelect) return;

    const statusByJobType = {
        Em: [
            { value: 'ยังไม่ได้ปัก', label: '❌ ยังไม่ได้ปัก' },
            { value: 'ปักแล้ว', label: '🧵 ปักแล้ว' }
        ],
        Rep: [
            { value: 'รอเย็บ', label: '🪡 รอเย็บ' },
            { value: 'เย็บเรียบร้อยแล้ว', label: '✨ เย็บเรียบร้อยแล้ว' },
            { value: 'รอเลาะ', label: '✂️ รอเลาะ' },
            { value: 'เลาะแล้ว', label: '🧹 เลาะแล้ว' }
        ]
    };

    const options = statusByJobType[jobTypeSelect.value] || statusByJobType.Em;
    statusSelect.innerHTML = '';
    options.forEach((option) => {
        const statusOption = document.createElement('option');
        statusOption.value = option.value;
        statusOption.textContent = option.label;
        statusSelect.appendChild(statusOption);
    });
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
    document.getElementById('resDelivery').className = 'delivery-badge ' + getDeliveryClass(item.delivery);
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
        button.addEventListener('click', () => {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = item.queue_id || '';
            clearSearchSuggestions();
            displayQueueResult(item);
        });
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
            const normalizedQueueInput = normalizeQueueSearch(currentInput);
            const normalizedDate = normalizeDateToISO(currentInput);

            const matches = (data || []).filter((item) => {
                const queueId = String(item.queue_id || '').toLowerCase();
                const normalizedQueueId = getNormalizedQueueId(item.queue_id);
                const customerName = String(item.customer_name || '').toLowerCase();
                const depositValue = String(item[DEPOSIT_DATE_FIELD] || '').toLowerCase();
                const displayDate = formatISODateForDisplay(item[DEPOSIT_DATE_FIELD]).toLowerCase();

                return (normalizedQueueInput
                    ? normalizedQueueId === normalizedQueueInput
                    : queueId.includes(normalizedInput)) ||
                    customerName.startsWith(normalizedInput) ||
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

function getDeliveryClass(delivery) {
    if (!delivery) return 'delivery-pending';

    const normalized = String(delivery).trim().toLowerCase();
    if (normalized === 'ส่งแล้ว' || normalized === 'ส่งเรียบร้อยแล้ว') {
        return 'delivery-sent';
    }
    return 'delivery-pending';
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
                alert(`บันทึกไม่สำเร็จ\nเนื่องจากนโยบาย Row Level Security ของ Supabase\nกรุณาตั้งค่า policy ให้ตาราง "nidashop_puksuay" อนุญาต INSERT จากผู้ใช้ Anonymous/anon หรือปิด RLS สำหรับตารางนี้`);
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

    console.log('Deleting', id);
    // try delete by numeric id first
    let response = await fetch(`${SUPABASE_URL}/rest/v1/nidashop_puksuay?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`
        }
    });

    if (!response.ok) {
        // try delete by queue_id
        console.warn('Delete by id failed, trying queue_id');
        response = await fetch(`${SUPABASE_URL}/rest/v1/nidashop_puksuay?queue_id=eq.${encodeURIComponent(id)}`, {
            method: 'DELETE',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
    }

    if (response.ok) {
        alert(`ลบคิวที่ ${id} เรียบร้อยแล้ว`);
        loadAdminTable();
    } else {
        const errorText = await response.text();
        alert(`ไม่สามารถลบข้อมูลได้ กรุณาลองใหม่\n${errorText}`);
    }
}

// ลบงานที่เพิ่มเข้ามาเกินจำนวนวันที่กำหนด
async function deleteExpiredQueues() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - AUTO_DELETE_AFTER_DAYS);

    try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/nidashop_puksuay?select=id,queue_id,created_at`, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });

        if (!response.ok) return;
        const data = await response.json();
        const expiredItems = (data || []).filter((item) => {
            return item.created_at && new Date(item.created_at) < cutoffDate;
        });

        let deletedCount = 0;
        for (const item of expiredItems) {
            const filter = item.id
                ? `id=eq.${encodeURIComponent(item.id)}`
                : `queue_id=eq.${encodeURIComponent(item.queue_id)}`;
            const deleteResponse = await fetch(`${SUPABASE_URL}/rest/v1/nidashop_puksuay?${filter}`, {
                method: 'DELETE',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`
                }
            });
            if (deleteResponse.ok) deletedCount += 1;
        }

        if (deletedCount > 0) {
            showAdminMessage(`ลบงานที่เกิน ${AUTO_DELETE_AFTER_DAYS} วันแล้ว ${deletedCount} รายการ`, true);
        }
    } catch (error) {
        console.error('ลบงานที่ครบกำหนดไม่สำเร็จ:', error);
    }
}

// ฟังก์ชันดึงคิวงานทั้งหมดมาโชว์ในตารางแอดมิน
async function loadAdminTable() {
    await deleteExpiredQueues();
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

    const sortedData = [...data].sort((firstItem, secondItem) => {
        const firstPrefix = getJobTypePrefix(String(firstItem.queue_id || '').split(/\s+/)[0]);
        const secondPrefix = getJobTypePrefix(String(secondItem.queue_id || '').split(/\s+/)[0]);

        if (firstPrefix !== secondPrefix) {
            return firstPrefix === 'Em' ? -1 : 1;
        }

        return (parseQueueNumber(firstItem.queue_id) || 0) - (parseQueueNumber(secondItem.queue_id) || 0);
    });

    let currentJobType = '';
    sortedData.forEach(item => {
        const jobType = getJobTypePrefix(String(item.queue_id || '').split(/\s+/)[0]);
        if (jobType !== currentJobType) {
            const groupRow = document.createElement('tr');
            groupRow.className = `job-group-heading job-group-${jobType.toLowerCase()}`;
            const groupCell = document.createElement('td');
            groupCell.colSpan = 8;
            groupCell.innerText = jobType === 'Rep' ? 'งานซ่อมผ้า (Rep)' : 'งานปักเสื้อนักเรียน (Em)';
            groupRow.appendChild(groupCell);
            tbody.appendChild(groupRow);
            currentJobType = jobType;
        }

        const tr = document.createElement('tr');
        tr.className = `job-row job-row-${jobType.toLowerCase()}`;

        // คอลัมน์รหัสคิว
        const tdId = document.createElement('td');
        tdId.innerText = item.queue_id || '-';
        tr.appendChild(tdId);

        // คอลัมน์ชื่อลูกค้า
        const tdName = document.createElement('td');
        tdName.innerText = item.customer_name || '-';
        tr.appendChild(tdName);

        // คอลัมน์วันที่
        const tdDate = document.createElement('td');
        tdDate.innerText = formatISODateForDisplay(item[DEPOSIT_DATE_FIELD]) || '-';
        tr.appendChild(tdDate);

        // คอลัมน์สถานะ (คลิกเพื่อแก้ไข)
        const tdStatus = document.createElement('td');
        const spanStatus = document.createElement('span');
        spanStatus.innerText = item.status || '-';
        spanStatus.className = 'status-badge ' + getStatusClass(item.status);
        spanStatus.style.cursor = 'pointer';
        spanStatus.addEventListener('click', () => {
            const options = jobType === 'Rep'
                ? [
                    { value: 'รอเย็บ', label: '🪡 รอเย็บ' },
                    { value: 'เย็บเรียบร้อยแล้ว', label: '✨ เย็บเรียบร้อยแล้ว' },
                    { value: 'รอเลาะ', label: '✂️ รอเลาะ' },
                    { value: 'เลาะแล้ว', label: '🧹 เลาะแล้ว' }
                ]
                : [
                    { value: 'ยังไม่ได้ปัก', label: '❌ ยังไม่ได้ปัก' },
                    { value: 'ปักแล้ว', label: '🧵 ปักแล้ว' }
                ];
            makeEditableSelect(tdStatus, item.queue_id || item.id, 'status', options, item.status);
        });
        tdStatus.appendChild(spanStatus);
        tr.appendChild(tdStatus);

        // คอลัมน์การเงิน
        const tdPayment = document.createElement('td');
        const spanPayment = document.createElement('span');
        spanPayment.innerText = item.payment || '-';
        spanPayment.className = 'payment-badge ' + getPaymentClass(item.payment);
        spanPayment.style.cursor = 'pointer';
        spanPayment.addEventListener('click', () => {
            const options = [
                { value: 'ยังไม่ชำระเงิน', label: '🔴 ยังไม่ชำระเงิน' },
                { value: 'จ่ายเงินแล้ว', label: '🟢 จ่ายเงินแล้ว' }
            ];
            makeEditableSelect(tdPayment, item.queue_id || item.id, 'payment', options, item.payment);
        });
        tdPayment.appendChild(spanPayment);
        tr.appendChild(tdPayment);

        // คอลัมน์การส่งงาน
        const tdDelivery = document.createElement('td');
        const spanDelivery = document.createElement('span');
        spanDelivery.innerText = item.delivery || '-';
        spanDelivery.className = 'delivery-badge ' + getDeliveryClass(item.delivery);
        spanDelivery.style.cursor = 'pointer';
        spanDelivery.addEventListener('click', () => {
            const options = [
                { value: 'ยังไม่ส่ง', label: '❌ ยังไม่ส่ง' },
                { value: 'ส่งแล้ว', label: '✅ ส่งแล้ว' }
            ];
            makeEditableSelect(tdDelivery, item.queue_id || item.id, 'delivery', options, item.delivery);
        });
        tdDelivery.appendChild(spanDelivery);
        tr.appendChild(tdDelivery);

        // คอลัมน์ผู้ส่งงาน
        const tdEmployee = document.createElement('td');
        const spanEmp = document.createElement('span');
        spanEmp.innerText = item.employee_name || '-';
        spanEmp.className = 'employee-badge';
        spanEmp.style.cursor = 'pointer';
        spanEmp.addEventListener('click', () => {
            makeEditableEmployee(tdEmployee, item.queue_id || item.id, item.employee_name);
        });
        tdEmployee.appendChild(spanEmp);
        tr.appendChild(tdEmployee);

        // ปุ่มลบ และปุ่มบันทึก (ซ่อนจนมีการแก้ไข)
        const tdAction = document.createElement('td');
        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerText = 'ลบ';
        delBtn.addEventListener('click', () => deleteQueue(item.id));

        const saveBtn = document.createElement('button');
        saveBtn.className = 'save-btn';
        saveBtn.innerText = 'บันทึก';
        saveBtn.style.display = 'none';
        saveBtn.addEventListener('click', async () => {
            const pending = tr._pendingUpdates || {};
            if (!pending || Object.keys(pending).length === 0) return;
            saveBtn.disabled = true;

            // Prefer to find the record by queue_id first (if available) to obtain the true numeric id
            let identifier = null;
            const queueId = item.queue_id || null;
            console.log('Saving row start', { itemId: item.id, queueId, pending });

            if (queueId) {
                const found = await findRecordByQueueId(queueId);
                if (found && found.id) {
                    identifier = found.id;
                    console.log('Found record by queue_id', found);
                } else {
                    // If we couldn't find by queue_id, try using provided item.id as fallback
                    identifier = item.id || null;
                }
            } else {
                identifier = item.id || null;
            }

            let res = null;
            if (identifier) {
                res = await updateQueue(identifier, pending);
                // if update didn't change anything and we have a queueId, try again with queueId filter
                if ((!res || !res.ok) && queueId) {
                    const found = await findRecordByQueueId(queueId);
                    if (found && found.id && String(found.id) !== String(identifier)) {
                        res = await updateQueue(found.id, pending);
                    }
                }
            } else {
                res = await updateQueue(queueId, pending);
            }

            if (res && res.ok) {
                tr._pendingUpdates = {};
                saveBtn.style.display = 'none';
            } else {
                showAdminMessage('บันทึกไม่สำเร็จ โปรดตรวจสอบคอนโซล', false);
                saveBtn.disabled = false;
            }
            loadAdminTable();
        });

        tdAction.appendChild(saveBtn);
        tdAction.appendChild(delBtn);
        tr.appendChild(tdAction);

        tbody.appendChild(tr);
    });
}

// สร้าง select แก้ไขแบบ in-place และอัปเดตทันทีเมื่อเปลี่ยนค่า
function makeEditableSelect(containerTd, id, field, options, currentValue) {
    containerTd.innerHTML = '';
    const select = document.createElement('select');
    select.className = 'admin-select';
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.text = opt.label;
        if (String(opt.value) === String(currentValue)) o.selected = true;
        select.appendChild(o);
    });

    select.addEventListener('change', () => {
        const selected = select.options[select.selectedIndex];
        const oldText = currentValue || '-';
        const newText = selected ? selected.text : oldText;
        // แสดงข้อความใหม่ทันที
        containerTd.innerHTML = '';
        const span = document.createElement('span');
        span.innerText = newText;
        span.style.opacity = '0.9';
        containerTd.appendChild(span);

        // บันทึกทันทีเมื่อเลือกค่าใหม่
        updateQueueField(id, field, select.value);

        // ให้ span สามารถคลิกเพื่อแก้ใหม่ได้
        span.style.cursor = 'pointer';
        span.addEventListener('click', () => makeEditableSelect(containerTd, id, field, options, select.value));
    });

    // ถ้าคลิกออกโดยไม่เปลี่ยน ให้กลับเป็นข้อความเดิม
    select.addEventListener('blur', () => {
        // ถ้ายังมี select (ผู้ใช้ยังไม่ได้เปลี่ยน) ให้คืนค่าเดิม
        if (containerTd.contains(select)) {
            containerTd.innerHTML = '';
            const span = document.createElement('span');
            span.innerText = currentValue || '-';
            span.style.cursor = 'pointer';
            span.addEventListener('click', () => makeEditableSelect(containerTd, id, field, options, currentValue));
            containerTd.appendChild(span);
        }
    });

    containerTd.appendChild(select);
    select.focus();
}

// สร้าง UI แก้ไขผู้ส่งงาน: เลือกหรือพิมพ์ชื่อเอง
function makeEditableEmployee(containerTd, id, currentValue) {
    containerTd.innerHTML = '';
    const select = document.createElement('select');
    select.className = 'admin-select';
    const names = ['', 'อัสมี่', 'ฮุสนา', 'นูรนา', 'ฮาน่า', 'ยาซีมีน', 'นาซีฮะ', 'วิมันตรา', 'custom'];
    names.forEach(n => {
        const o = document.createElement('option');
        o.value = n;
        o.text = n === '' ? '-- ผู้ส่งงาน --' : (n === 'custom' ? '⊕ อื่น (ระบุชื่อเอง)' : n);
        if (n === currentValue) o.selected = true;
        select.appendChild(o);
    });

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'admin-table-input';
    input.placeholder = 'พิมพ์ชื่อผู้ส่งงาน';
    input.style.display = (currentValue && !names.includes(currentValue)) ? 'block' : 'none';
    input.value = (currentValue && !names.includes(currentValue)) ? currentValue : '';

    select.addEventListener('change', () => {
        if (select.value === 'custom') {
            input.style.display = 'block';
            input.focus();
        } else {
            input.style.display = 'none';
            const v = select.value || '';
            containerTd.innerHTML = '';
            const span = document.createElement('span');
            span.innerText = v || '-';
            span.style.opacity = '0.9';
            containerTd.appendChild(span);
            const row = containerTd.closest('tr');
            if (row) {
                updateQueueField(id, 'employee_name', v || '');
            }
            span.style.cursor = 'pointer';
            span.addEventListener('click', () => makeEditableEmployee(containerTd, id, currentValue));
        }
    });

    input.addEventListener('blur', () => {
        const v = input.value.trim();
        if (v) {
            containerTd.innerHTML = '';
            const span = document.createElement('span');
            span.innerText = v;
            span.style.opacity = '0.9';
            containerTd.appendChild(span);
            const row = containerTd.closest('tr');
            if (row) {
                updateQueueField(id, 'employee_name', v);
            }
            span.style.cursor = 'pointer';
            span.addEventListener('click', () => makeEditableEmployee(containerTd, id, currentValue));
        } else {
            // ถ้าว่าง ให้เปลี่ยนกลับเป็น placeholder
            containerTd.innerHTML = '';
            const span = document.createElement('span');
            span.innerText = '-';
            span.style.cursor = 'pointer';
            span.addEventListener('click', () => makeEditableEmployee(containerTd, id, ''));
            containerTd.appendChild(span);
        }
    });

    containerTd.appendChild(select);
    containerTd.appendChild(input);
    select.focus();
}

// ส่ง PATCH ไปยัง Supabase เพื่ออัปเดตฟิลด์ของรายการ
async function updateQueue(id, updates, expectedField, expectedValue) {
    if (!id) return;
    try {
        console.log('Updating', id, updates);

        // ถ้าได้รับรหัสคิว ให้ค้นหา id จริงของแถวก่อนอัปเดต
        let recordId = id;
        if (/^(Em|Rep)\s+\d+$/i.test(String(id).trim())) {
            const record = await findRecordByQueueId(id);
            if (record && record.id) {
                recordId = record.id;
            }
        }

// แสดง debug panel บนหน้า adminSection
function showDebugPanel(info) {
    const adminSection = document.getElementById('adminSection');
    if (!adminSection) return;
    let panel = document.getElementById('adminDebugPanel');
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'adminDebugPanel';
        panel.innerHTML = '<button id="adminDebugClose">×</button><div id="adminDebugContent"></div>';
        adminSection.style.position = 'relative';
        adminSection.appendChild(panel);
        document.getElementById('adminDebugClose').addEventListener('click', () => panel.remove());
    }
    const content = document.getElementById('adminDebugContent');
    if (!content) return;
    const time = new Date().toLocaleTimeString();
    if (info.stage === 'request') {
        content.innerText = `[${time}] REQUEST\nURL: ${info.url}\nBODY: ${JSON.stringify(info.body)}\n`;
    } else if (info.stage === 'response') {
        content.innerText = `[${time}] RESPONSE\nURL: ${info.url}\nSTATUS: ${info.status}\nBODY: ${JSON.stringify(info.body)}\n`;
    } else if (info.stage === 'error') {
        content.innerText = `[${time}] ERROR\n${info.error}`;
    }
}

// แสดงข้อความสถานะเล็ก ๆ ในหน้าจอแอดมิน
function showAdminMessage(message, isSuccess) {
    let container = document.getElementById('adminMessage');
    if (!container) {
        const adminSection = document.getElementById('adminSection');
        if (!adminSection) return;

        container = document.createElement('div');
        container.id = 'adminMessage';
        container.style.position = 'absolute';
        container.style.right = '18px';
        container.style.top = '12px';
        container.style.zIndex = 3000;
        adminSection.style.position = 'relative';
        adminSection.appendChild(container);
    }
    container.innerText = message;
    container.style.padding = '8px 12px';
    container.style.borderRadius = '8px';
    container.style.color = '#fff';
    container.style.background = isSuccess ? 'rgba(39, 174, 96, 0.95)' : 'rgba(231, 76, 60, 0.95)';
    setTimeout(() => { if (container) container.innerText = ''; }, 2500);
}

        // Try update by numeric id first
        let urlById = `${SUPABASE_URL}/rest/v1/nidashop_puksuay?id=eq.${encodeURIComponent(recordId)}`;
        console.log('Request URL (by id):', urlById);
        console.log('Request body:', JSON.stringify(updates));
        let response = await fetch(urlById, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(updates)
        });

        let bodyText = await response.text();
        let parsed = null;
        try { parsed = JSON.parse(bodyText); } catch (e) { parsed = bodyText; }

        if (!response.ok) {
            // If update by id didn't work, try using queue_id (for cases where primary key is different)
            console.warn('Update by id failed, trying queue_id. Response:', response.status, parsed);
            let urlByQueue = `${SUPABASE_URL}/rest/v1/nidashop_puksuay?queue_id=eq.${encodeURIComponent(String(id).trim())}`;
            console.log('Request URL (by queue_id):', urlByQueue);
            response = await fetch(urlByQueue, {
                method: 'PATCH',
                headers: {
                    'apikey': SUPABASE_KEY,
                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=minimal'
                },
                body: JSON.stringify(updates)
            });

            bodyText = await response.text();
            try { parsed = JSON.parse(bodyText); } catch (e) { parsed = bodyText; }
        }

        // show response of final attempt
        if (response.ok) {
            console.log('Update success', parsed);
            // ถ้ามี expectedField ตรวจสอบว่าค่าใน response ตรงกับค่าที่เราคาดหวัง
            let updatedOk = true;
            if (expectedField && parsed) {
                const first = Array.isArray(parsed) ? parsed[0] : parsed;
                if (!first || String(first[expectedField]) !== String(expectedValue)) {
                    updatedOk = false;
                }
            }

            if (updatedOk) {
                showAdminMessage('อัปเดตข้อมูลเรียบร้อย', true);
            } else {
                const snippet = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
                showAdminMessage(`อัปเดตสำเร็จ แต่ค่าไม่เปลี่ยน (response: ${String(snippet).slice(0,160)})`, false);
                console.warn('Update returned but value mismatch', { id, updates, expectedField, expectedValue, parsed });
            }
            // ยังคงรีเฟรชตารางเพื่อซิงค์ข้อมูลจากเซิร์ฟเวอร์
            loadAdminTable();
            return { ok: true, parsed };
        } else {
            console.error('Update failed', response.status, parsed);
            const snippet = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
            showAdminMessage(`อัปเดตไม่สำเร็จ (status ${response.status}) ${String(snippet).slice(0,160)}`, false);
            console.info('ตรวจสอบ Network tab เพื่อดูรายละเอียด request/response');
            return { ok: false, parsed, status: response.status };
        }
    } catch (err) {
        console.error('Update failed:', err);
        showAdminMessage('เกิดข้อผิดพลาดขณะอัปเดตข้อมูล', false);
        return { ok: false, error: err };
    }
}

function updateQueueField(id, field, value) {
    const payload = {};
    payload[field] = value;
    return updateQueue(id, payload, field, value);
}

function handleRowEmployeeChange(id, value) {
    const input = document.getElementById(`emp-input-${id}`);
    if (!input) return;
    if (value === 'custom') {
        input.style.display = 'block';
        input.value = '';
        setTimeout(() => input.focus(), 50);
    } else {
        input.style.display = 'none';
        updateQueueField(id, 'employee_name', value);
    }
}

function updateEmployeeFromInput(id) {
    const input = document.getElementById(`emp-input-${id}`);
    if (!input) return;
    const v = input.value.trim();
    if (v) {
        updateQueueField(id, 'employee_name', v);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                searchQueue();
            }
        });
    }

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
            updateJobStatusOptions();
            refreshQueueNumberField();
        });
        updateJobStatusOptions();
    }

    refreshQueueNumberField();
});

// ทำให้การคลิก/โฟกัสช่องวันที่เปิด native picker บนเดสก์ท็อป (fallback สำหรับเบราว์เซอร์ Chromium)
document.addEventListener('DOMContentLoaded', () => {
    const dateInput = document.getElementById('custDate');
    if (!dateInput) return;

    // ถ้าเบราว์เซอร์รองรับ showPicker ให้เรียกเมื่อคลิกหรือโฟกัส
    const tryShowPicker = (ev) => {
        try {
            if (typeof dateInput.showPicker === 'function') {
                dateInput.showPicker();
            }
        } catch (e) {
            // ignore
        }
    };

    dateInput.addEventListener('click', tryShowPicker);
    dateInput.addEventListener('focus', tryShowPicker);
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

// หาเรคคอร์ดโดย queue_id (คืน object แถวแรก หรือ null)
async function findRecordByQueueId(queueId) {
    if (!queueId) return null;
    try {
        // First try exact match
        let url = `${SUPABASE_URL}/rest/v1/nidashop_puksuay?select=*&queue_id=eq.${encodeURIComponent(queueId)}`;
        console.log('Finding record by queue_id (exact), GET', url);
        let response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        let data = await response.json();
        if (Array.isArray(data) && data.length > 0) return data[0];

        // If not found, try a case-insensitive partial match using ilike
        // Replace spaces with % to be more flexible
        const escaped = String(queueId).replace(/\s+/g, '%');
        url = `${SUPABASE_URL}/rest/v1/nidashop_puksuay?select=*&queue_id=ilike.%25${encodeURIComponent(escaped)}%25`;
        console.log('Finding record by queue_id (ilike), GET', url);
        response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
            }
        });
        data = await response.json();
        if (Array.isArray(data) && data.length > 0) return data[0];
        return null;
    } catch (e) {
        console.error('findRecordByQueueId failed', e);
        return null;
    }
}
