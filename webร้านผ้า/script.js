const statusOptions = [
  "ยังไม่ได้ปัก",
  "ปักแล้ว",
  "รอเย็บ",
  "เย็บเรียบร้อยแล้ว",
  "รอเลาะ",
  "เลาะแล้ว",
];
const paymentOptions = ["จ่ายแล้ว", "จ่ายตอนรับ"];
const STORAGE_KEY = "repairQueueJobs";
let jobs = [];
let currentFilter = "all";
let isStaff = false;

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const filterButtons = document.querySelectorAll(".filter-btn");
const jobsTableBody = document.querySelector("#jobsTable tbody");
const staffToggle = document.getElementById("staffToggle");
const staffArea = document.getElementById("staffArea");
const addJobBtn = document.getElementById("addJobBtn");
const jobType = document.getElementById("jobType");
const queueNumber = document.getElementById("queueNumber");
const customerName = document.getElementById("customerName");
const customerPhone = document.getElementById("customerPhone");
const statusSelect = document.getElementById("statusSelect");
const paymentSelect = document.getElementById("paymentSelect");
const delivererName = document.getElementById("delivererName");

const statusClassMap = {
  "ยังไม่ได้ปัก": "status-pending",
  "ปักแล้ว": "status-complete",
  "รอเย็บ": "status-waiting",
  "เย็บเรียบร้อยแล้ว": "status-complete",
  "รอเลาะ": "status-delayed",
  "เลาะแล้ว": "status-complete",
};

function renderStatusTag(status) {
  const className = statusClassMap[status] || "status-default";
  return `<span class="status-badge ${className}">${status}</span>`;
}

function createSelectOptions(selectElement, options) {
  selectElement.innerHTML = options
    .map((option) => `<option value="${option}">${option}</option>`)
    .join("");
}

function loadJobs() {
  const raw = localStorage.getItem(STORAGE_KEY);
  jobs = raw ? JSON.parse(raw) : [];
}

function saveJobs() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
}

function getQueueLabel(type, numberInput) {
  const prefix = type === "Em" ? "Em" : "Rep";
  const value = String(numberInput).trim();
  if (value) {
    return `${prefix} ${value}`;
  }

  const existingNumbers = jobs
    .filter((job) => job.type === type)
    .map((job) => {
      const parts = job.queue.split(" ");
      return Number(parts[1]) || 0;
    });
  const nextNumber = existingNumbers.length ? Math.max(...existingNumbers) + 1 : 1;
  return `${prefix} ${nextNumber}`;
}

function renderJobs() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = jobs.filter((job) => {
    const matchesType = currentFilter === "all" || job.type === currentFilter;
    const matchesSearch =
      !query ||
      job.queue.toLowerCase().includes(query) ||
      job.name.toLowerCase().includes(query) ||
      job.phone.toLowerCase().includes(query);
    return matchesType && matchesSearch;
  });

  jobsTableBody.innerHTML = filtered
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((job) => {
      return `
        <tr>
          <td>${job.queue}</td>
          <td><span class="tag ${job.type}">${job.type}</span></td>
          <td>${job.name}</td>
          <td>${job.phone}</td>
          <td>${isStaff ? renderStatusControl(job) : renderStatusTag(job.status)}</td>
          <td>${isStaff ? renderPaymentControl(job) : job.payment}</td>
          <td>${isStaff ? renderDelivererControl(job) : job.deliverer || "-"}</td>
          <td>${isStaff ? renderActionButtons(job) : "-"}</td>
        </tr>
      `;
    })
    .join("");
}

function renderStatusControl(job) {
  const options = statusOptions
    .map(
      (status) =>
        `<option value="${status}" ${status === job.status ? "selected" : ""}>${status}</option>`
    )
    .join("");
  return `<select data-id="${job.id}" data-field="status" class="inline-select">${options}</select>`;
}

function renderPaymentControl(job) {
  const options = paymentOptions
    .map(
      (payment) =>
        `<option value="${payment}" ${payment === job.payment ? "selected" : ""}>${payment}</option>`
    )
    .join("");
  return `<select data-id="${job.id}" data-field="payment" class="inline-select">${options}</select>`;
}

function renderDelivererControl(job) {
  return `<input type="text" data-id="${job.id}" data-field="deliverer" value="${job.deliverer || ""}" class="inline-input" placeholder="ชื่อผู้ส่งงาน" />`;
}

function renderActionButtons(job) {
  return `<button class="secondary-btn delete-btn" data-id="${job.id}">ลบ</button>`;
}

function handleTableChange(event) {
  const target = event.target;
  const id = target.dataset.id;
  const field = target.dataset.field;
  if (!id || !field) return;

  const job = jobs.find((item) => item.id === id);
  if (!job) return;

  job[field] = target.value;
  saveJobs();
  renderJobs();
}

function handleDeleteClick(event) {
  const target = event.target;
  if (!target.classList.contains("delete-btn")) return;
  const id = target.dataset.id;
  jobs = jobs.filter((item) => item.id !== id);
  saveJobs();
  renderJobs();
}

function addNewJob() {
  const type = jobType.value;
  const queue = getQueueLabel(type, queueNumber.value);
  const name = customerName.value.trim();
  const phone = customerPhone.value.trim();
  const status = statusSelect.value;
  const payment = paymentSelect.value;
  const deliverer = delivererName.value.trim();

  if (!name || !phone) {
    alert("กรุณากรอกชื่อและเบอร์โทรศัพท์ก่อนเพิ่มคิว");
    return;
  }

  const duplicate = jobs.some((job) => job.queue === queue);
  if (duplicate) {
    alert("มีคิวนี้อยู่แล้ว กรุณาเปลี่ยนเลขคิวหรือเว้นว่างให้ระบบสร้างใหม่");
    return;
  }

  jobs.push({
    id: `${type}-${Date.now()}`,
    queue,
    type,
    name,
    phone,
    status,
    payment,
    deliverer,
    createdAt: Date.now(),
  });

  saveJobs();
  resetForm();
  renderJobs();
}

function resetForm() {
  queueNumber.value = "";
  customerName.value = "";
  customerPhone.value = "";
  delivererName.value = "";
  statusSelect.value = statusOptions[0];
  paymentSelect.value = paymentOptions[0];
}

function setActiveFilter(button) {
  filterButtons.forEach((btn) => btn.classList.remove("active"));
  button.classList.add("active");
  currentFilter = button.dataset.type;
  renderJobs();
}

function toggleStaffArea() {
  if (!isStaff) {
    const password = prompt("กรุณาใส่รหัสพนักงานเพื่อเข้าถึงโหมดแก้ไข:");
    if (password !== "admin123") {
      alert("รหัสไม่ถูกต้อง หรือคุณยังไม่ได้สิทธิ์แก้ไข");
      return;
    }
    isStaff = true;
    staffArea.classList.remove("hidden");
    staffToggle.textContent = "ออกจากโหมดพนักงาน";
  } else {
    isStaff = false;
    staffArea.classList.add("hidden");
    staffToggle.textContent = "เข้าสู่ระบบพนักงาน";
  }
  renderJobs();
}

function init() {
  createSelectOptions(statusSelect, statusOptions);
  createSelectOptions(paymentSelect, paymentOptions);
  loadJobs();
  renderJobs();

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => setActiveFilter(button));
  });

  searchInput.addEventListener("input", renderJobs);
  searchBtn.addEventListener("click", renderJobs);
  staffToggle.addEventListener("click", toggleStaffArea);
  addJobBtn.addEventListener("click", addNewJob);
  jobsTableBody.addEventListener("change", handleTableChange);
  jobsTableBody.addEventListener("click", handleDeleteClick);
}

init();
