const http = require("http");
const fs = require("fs");
const path = require("path");
const apiHandler = require("./api/index.js");

const parseBody = (req) => new Promise((resolve) => {
  let body = "";
  req.on("data", chunk => body += chunk.toString());
  req.on("end", () => {
    try { resolve(body ? JSON.parse(body) : {}); } catch(e) { resolve({}); }
  });
});

const server = http.createServer(async (req, res) => {
  // Polyfill for Vercel's res.status() and res.json()
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(data));
  };

  // Route API
  if (req.url.startsWith("/api/")) {
    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      req.body = await parseBody(req);
    } else {
      req.body = {};
    }
    await apiHandler(req, res);
    return;
  }

  // Route Static Files
  let pathname = req.url.split("?")[0];
  let filePath = path.join(__dirname, "public", pathname === "/" ? "index.html" : pathname);
  
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (pathname === "/student") filePath = path.join(__dirname, "public", "student.html");
    else if (pathname === "/teacher") filePath = path.join(__dirname, "public", "teacher.html");
    else {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
  }

  const ext = path.extname(filePath);
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8"
  };
  res.setHeader("Content-Type", mime[ext] || "text/plain");
  fs.createReadStream(filePath).pipe(res);
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`==========================================`);
  console.log(`🚀 Local Test Server is running!`);
  console.log(`==========================================`);
  console.log(`🏠 Home:    http://localhost:${PORT}`);
  console.log(`👨‍🎓 Student: http://localhost:${PORT}/student`);
  console.log(`👨‍🏫 Teacher: http://localhost:${PORT}/teacher`);
  console.log(`==========================================`);
  console.log(`(Press Ctrl+C to stop)`);
});
