const crypto = require("crypto");
const MAX_BODY_BYTES = 8 * 1024 * 1024;

// In-memory state (Note: Vercel may reset this on cold starts or across multiple instances)
let state = {
  sessionTitle: "ห้องเรียนวันนี้",
  feedback: [],
  questions: [],
  updatedAt: new Date().toISOString()
};

function summarizeState() {
  const latestByStudent = new Map();
  for (const item of state.feedback) {
    latestByStudent.set(item.studentId, item);
  }

  const latest = Array.from(latestByStudent.values());
  const ok = latest.filter((item) => item.status === "ok").length;
  const notOk = latest.filter((item) => item.status === "not-ok").length;
  const answeredQuestions = state.questions.filter((item) => item.isAnswered).length;
  const pendingQuestions = state.questions.length - answeredQuestions;

  return {
    latest,
    totals: {
      students: latest.length,
      ok,
      notOk,
      okPercent: latest.length ? Math.round((ok / latest.length) * 100) : 0,
      questions: state.questions.length,
      answeredQuestions,
      pendingQuestions
    }
  };
}

function publicState() {
  const summary = summarizeState();
  return {
    sessionTitle: state.sessionTitle,
    updatedAt: state.updatedAt,
    totals: summary.totals,
    latestFeedback: summary.latest
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 80),
    questions: state.questions
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  };
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanImage(value) {
  if (!value) return null;
  const text = String(value);
  const match = text.match(/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/);
  if (!match) return null;
  return text.length <= MAX_BODY_BYTES ? text : null;
}

module.exports = async function (req, res) {
  // Add CORS headers just in case
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Determine path
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  let pathname = url.pathname;
  const reqPath = url.searchParams.get("reqPath");
  if (reqPath) {
    pathname = "/api/" + reqPath;
  }

  if (req.method === "GET" && pathname === "/api/state") {
    sendJson(res, 200, publicState());
    return;
  }

  if (req.method === "POST" && pathname === "/api/feedback") {
    try {
      const body = req.body || {};
      const studentId = cleanText(body.studentId, 80) || crypto.randomUUID();
      const status = body.status === "ok" ? "ok" : body.status === "not-ok" ? "not-ok" : null;
      if (!status) {
        sendJson(res, 400, { error: "status must be ok or not-ok" });
        return;
      }

      state.feedback.push({
        id: crypto.randomUUID(),
        studentId,
        alias: cleanText(body.alias, 40) || "ไม่ระบุชื่อ",
        status,
        note: cleanText(body.note, 220),
        createdAt: new Date().toISOString()
      });
      state.feedback = state.feedback.slice(-1000);
      state.updatedAt = new Date().toISOString();
      
      sendJson(res, 201, { ok: true, state: publicState() });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/questions") {
    try {
      const body = req.body || {};
      const text = cleanText(body.text, 1200);
      const image = cleanImage(body.image);
      if (!text && !image) {
        sendJson(res, 400, { error: "question text or image is required" });
        return;
      }

      state.questions.push({
        id: crypto.randomUUID(),
        alias: cleanText(body.alias, 40) || "ไม่ระบุชื่อ",
        text,
        image,
        isAnswered: false,
        createdAt: new Date().toISOString()
      });
      state.questions = state.questions.slice(-300);
      state.updatedAt = new Date().toISOString();
      
      sendJson(res, 201, { ok: true, state: publicState() });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && pathname.startsWith("/api/questions/") && pathname.endsWith("/toggle")) {
    const id = pathname.split("/")[3];
    const question = state.questions.find((item) => item.id === id);
    if (!question) {
      sendJson(res, 404, { error: "question not found" });
      return;
    }
    question.isAnswered = !question.isAnswered;
    question.answeredAt = question.isAnswered ? new Date().toISOString() : null;
    state.updatedAt = new Date().toISOString();
    
    sendJson(res, 200, { ok: true, question });
    return;
  }

  if (req.method === "POST" && pathname === "/api/session") {
    try {
      const body = req.body || {};
      state.sessionTitle = cleanText(body.sessionTitle, 80) || state.sessionTitle;
      state.updatedAt = new Date().toISOString();
      
      sendJson(res, 200, { ok: true, state: publicState() });
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/reset") {
    state.feedback = [];
    state.questions = [];
    state.updatedAt = new Date().toISOString();
    
    sendJson(res, 200, { ok: true, state: publicState() });
    return;
  }

  sendJson(res, 404, { error: "api route not found" });
};
