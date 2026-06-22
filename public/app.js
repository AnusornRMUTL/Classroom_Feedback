const $ = (selector) => document.querySelector(selector);
const page = document.body.dataset.page || "home";
const studentIdKey = "student-feedback-board-student-id";
const aliasKey = "student-feedback-board-alias";

const elements = {
  sessionTitle: $("#sessionTitle"),
  connectionState: $("#connectionState"),
  aliasInput: $("#aliasInput"),
  noteInput: $("#noteInput"),
  questionForm: $("#questionForm"),
  questionText: $("#questionText"),
  imageInput: $("#imageInput"),
  imageName: $("#imageName"),
  imagePreview: $("#imagePreview"),
  clearImageButton: $("#clearImageButton"),
  studentCount: $("#studentCount"),
  okCount: $("#okCount"),
  notOkCount: $("#notOkCount"),
  pendingCount: $("#pendingCount"),
  okBar: $("#okBar"),
  okPercent: $("#okPercent"),
  questionsList: $("#questionsList"),
  feedbackList: $("#feedbackList"),
  resetButton: $("#resetButton"),
  sessionInput: $("#sessionInput"),
  saveSessionButton: $("#saveSessionButton"),
  toast: $("#toast")
};

let selectedImage = null;
let toastTimer = null;
let currentState = null;
let questionFilter = "all";
let lastStateVersion = "";

function getStudentId() {
  let id = localStorage.getItem(studentIdKey);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    localStorage.setItem(studentIdKey, id);
  }
  return id;
}

function getAlias() {
  return elements.aliasInput?.value.trim() || "ไม่ระบุชื่อ";
}

function showToast(message) {
  if (!elements.toast) return;
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function setConnection(isOnline) {
  if (!elements.connectionState) return;
  elements.connectionState.textContent = isOnline ? "ออนไลน์" : "เชื่อมต่อไม่ได้";
  elements.connectionState.classList.toggle("online", isOnline);
  elements.connectionState.classList.toggle("offline", !isOnline);
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "request failed");
  }
  return data;
}



function formatTime(value) {
  return new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function escapeText(value) {
  const div = document.createElement("div");
  div.textContent = value || "";
  return div.innerHTML;
}

function renderState(state) {
  currentState = state;
  lastStateVersion = state.updatedAt || lastStateVersion;
  if (elements.sessionTitle) elements.sessionTitle.textContent = state.sessionTitle;
  if (elements.sessionInput) elements.sessionInput.placeholder = state.sessionTitle;

  if (page !== "teacher") return;

  const pending = state.questions.filter((item) => !item.isAnswered).length;
  elements.studentCount.textContent = state.totals.students;
  elements.okCount.textContent = state.totals.ok;
  elements.notOkCount.textContent = state.totals.notOk;
  elements.pendingCount.textContent = pending;
  elements.okBar.style.width = `${state.totals.okPercent}%`;
  elements.okPercent.textContent = state.totals.students
    ? `OK ${state.totals.okPercent}% จากผู้ตอบล่าสุด ${state.totals.students} คน`
    : "ยังไม่มีข้อมูล";
  renderQuestions(state.questions);
  renderFeedback(state.latestFeedback);
}

function filteredQuestions(questions) {
  if (questionFilter === "pending") return questions.filter((item) => !item.isAnswered);
  if (questionFilter === "answered") return questions.filter((item) => item.isAnswered);
  return questions;
}

function renderQuestions(questions) {
  const visibleQuestions = filteredQuestions(questions);
  if (!visibleQuestions.length) {
    elements.questionsList.className = "question-list empty";
    elements.questionsList.textContent = questionFilter === "all" ? "ยังไม่มีคำถาม" : "ไม่มีคำถามในตัวกรองนี้";
    return;
  }

  elements.questionsList.className = "question-list";
  elements.questionsList.innerHTML = visibleQuestions.map((item) => {
    const status = item.isAnswered ? "ตอบแล้ว" : "รอตอบ";
    const image = item.image
      ? `<img class="question-image" src="${item.image}" alt="รูปที่นักศึกษาแนบ">`
      : "";
    return `
      <article class="question-item ${item.isAnswered ? "answered" : ""}">
        <div class="item-meta">
          <span>${escapeText(item.alias)} · ${formatTime(item.createdAt)}</span>
          <strong>${status}</strong>
        </div>
        ${item.text ? `<div class="question-text">${escapeText(item.text)}</div>` : ""}
        ${image}
        <button class="toggle-answer ${item.isAnswered ? "answered-button" : "pending-button"}" type="button" data-question-id="${item.id}">
          ${item.isAnswered ? "ตอบแล้ว" : "รอตอบ"}
        </button>
      </article>
    `;
  }).join("");
}

function renderFeedback(feedback) {
  if (!feedback.length) {
    elements.feedbackList.className = "feedback-list empty";
    elements.feedbackList.textContent = "ยังไม่มีการกด OK/Not OK";
    return;
  }

  elements.feedbackList.className = "feedback-list";
  elements.feedbackList.innerHTML = feedback.map((item) => {
    const isOk = item.status === "ok";
    return `
      <article class="feedback-item">
        <div class="item-meta">
          <span>${escapeText(item.alias)} · ${formatTime(item.createdAt)}</span>
          <span class="feedback-pill ${isOk ? "ok" : "not-ok"}">${isOk ? "OK" : "Not OK"}</span>
        </div>
        ${item.note ? `<div>${escapeText(item.note)}</div>` : ""}
      </article>
    `;
  }).join("");
}



async function sendFeedback(status) {
  const note = elements.noteInput.value.trim();
  await postJson("/api/feedback", {
    studentId: getStudentId(),
    alias: getAlias(),
    status,
    note
  });
  elements.noteInput.value = "";
  showToast(status === "ok" ? "ส่ง OK แล้ว" : "ส่ง Not OK แล้ว");
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("อ่านรูปไม่สำเร็จ"));
    reader.readAsDataURL(file);
  });
}

function clearImage() {
  selectedImage = null;
  elements.imageInput.value = "";
  elements.imageName.textContent = "ยังไม่ได้เลือกรูป";
  elements.imagePreview.removeAttribute("src");
  elements.imagePreview.style.display = "none";
}



async function refreshState() {
  if (page === "home") return;
  try {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("state fetch failed");
    const state = await response.json();
    if (state.updatedAt !== lastStateVersion) {
      renderState(state);
    }
    setConnection(true);
  } catch {
    setConnection(false);
  }
}

function initStudent() {
  elements.aliasInput.value = localStorage.getItem(aliasKey) || "";
  elements.aliasInput.addEventListener("input", () => {
    localStorage.setItem(aliasKey, elements.aliasInput.value.trim());
  });

  document.addEventListener("click", async (event) => {
    const statusButton = event.target.closest("[data-status]");
    if (!statusButton) return;
    try {
      await sendFeedback(statusButton.dataset.status);
    } catch (error) {
      showToast(`ส่งไม่สำเร็จ: ${error.message}`);
    }
  });

  elements.imageInput.addEventListener("change", async () => {
    const file = elements.imageInput.files[0];
    if (!file) {
      clearImage();
      return;
    }
    if (!file.type.startsWith("image/")) {
      showToast("เลือกได้เฉพาะไฟล์รูปภาพ");
      clearImage();
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast("รูปใหญ่เกิน 5 MB");
      clearImage();
      return;
    }

    try {
      selectedImage = await readImage(file);
      elements.imageName.textContent = file.name;
      elements.imagePreview.src = selectedImage;
      elements.imagePreview.style.display = "block";
    } catch (error) {
      showToast(error.message);
      clearImage();
    }
  });

  elements.clearImageButton.addEventListener("click", clearImage);

  elements.questionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = elements.questionText.value.trim();
    if (!text && !selectedImage) {
      showToast("พิมพ์คำถามหรือแนบรูปอย่างน้อย 1 อย่าง");
      return;
    }

    try {
      await postJson("/api/questions", {
        alias: getAlias(),
        text,
        image: selectedImage
      });
      elements.questionText.value = "";
      clearImage();
      showToast("ส่งคำถามแล้ว");
    } catch (error) {
      showToast(`ส่งคำถามไม่สำเร็จ: ${error.message}`);
    }
  });
}

function initTeacher() {
  document.addEventListener("click", async (event) => {
    const toggleButton = event.target.closest("[data-question-id]");
    if (toggleButton) {
      try {
        await postJson(`/api/questions/${toggleButton.dataset.questionId}/toggle`, {});
      } catch (error) {
        showToast(`อัปเดตไม่สำเร็จ: ${error.message}`);
      }
      return;
    }

    const filterButton = event.target.closest("[data-filter]");
    if (filterButton) {
      questionFilter = filterButton.dataset.filter;
      document.querySelectorAll("[data-filter]").forEach((button) => {
        button.classList.toggle("active", button === filterButton);
      });
      if (currentState) renderQuestions(currentState.questions);
    }
  });

  elements.saveSessionButton.addEventListener("click", async () => {
    const sessionTitle = elements.sessionInput.value.trim();
    if (!sessionTitle) {
      showToast("กรอกชื่อหัวข้อก่อน");
      return;
    }
    try {
      await postJson("/api/session", { sessionTitle });
      elements.sessionInput.value = "";
      showToast("ตั้งชื่อหัวข้อแล้ว");
    } catch (error) {
      showToast(`ตั้งชื่อไม่สำเร็จ: ${error.message}`);
    }
  });

  elements.resetButton.addEventListener("click", async () => {
    const confirmed = confirm("ล้างคำถามและสถานะทั้งหมดเพื่อเริ่มรอบใหม่?");
    if (!confirmed) return;
    try {
      await postJson("/api/reset", {});
      showToast("เริ่มรอบใหม่แล้ว");
    } catch (error) {
      showToast(`ล้างข้อมูลไม่สำเร็จ: ${error.message}`);
    }
  });


}

if (page === "student") initStudent();
if (page === "teacher") initTeacher();

if (page !== "home") {
  refreshState();
  setInterval(refreshState, 2000);
}
