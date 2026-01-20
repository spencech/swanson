"use strict";
const electron = require("electron");
const path = require("path");
const url = require("url");
const http = require("http");
const crypto = require("crypto");
const Store = require("electron-store");
const child_process = require("child_process");
const fs = require("fs");
const os = require("os");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const os__namespace = /* @__PURE__ */ _interopNamespaceDefault(os);
const store = new Store({
  name: "swanson-config",
  encryptionKey: "swanson-secure-storage-key",
  // In production, use a more secure approach
  defaults: {
    auth: {},
    settings: {
      theme: "light"
    }
  }
});
function getAuth() {
  return store.get("auth");
}
function setAuth(auth) {
  store.set("auth", auth);
}
function clearAuth() {
  store.set("auth", {});
}
function getSettings() {
  return store.get("settings");
}
function setSetting(key, value) {
  store.set(`settings.${key}`, value);
}
function getSetting(key) {
  return store.get(`settings.${key}`);
}
const CALLBACK_PORT = 4200;
const CALLBACK_PATH = "/sso/index.html";
const GOOGLE_CLIENT_ID = "776631454856-nbpd33ph7gpeeve0p1m80ibi2s5bmlj7.apps.googleusercontent.com";
const GOOGLE_REDIRECT_URI = "https://dev.api.reports.teachupbeat.net/auth/google/callback";
function generateSsoUrl() {
  const nonce = crypto.randomUUID().replace(/-/g, "");
  const state = Buffer.from(JSON.stringify({
    nonce,
    redirect: `http://localhost:${CALLBACK_PORT}`,
    timestamp: Date.now()
  })).toString("base64");
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: "code",
    scope: "email openid profile",
    access_type: "offline",
    prompt: "select_account",
    state
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
let authServer = null;
function decodeJwtPayload(token) {
  var _a;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) {
      payload += "=";
    }
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    const data = JSON.parse(decoded);
    let rawEmail = data.email || (((_a = data["cognito:username"]) == null ? void 0 : _a.includes("@")) ? data["cognito:username"] : null) || data.preferred_username;
    if (rawEmail) {
      rawEmail = rawEmail.replace(/^google_/, "");
    }
    return {
      email: rawEmail,
      // For name, use full name (given_name + family_name) for header display
      name: data.given_name && data.family_name ? `${data.given_name} ${data.family_name}` : data.given_name || data.nickname || data.name || null,
      sub: data.sub
    };
  } catch (e) {
    console.error("Failed to decode JWT:", e);
    return null;
  }
}
function startAuthServer() {
  return new Promise((resolve, reject) => {
    if (authServer) {
      authServer.close();
    }
    authServer = http.createServer((req, res) => {
      const url$1 = new url.URL(req.url || "", `http://localhost:${CALLBACK_PORT}`);
      if (url$1.pathname === CALLBACK_PATH || url$1.pathname === "/sso/" || url$1.pathname === "/") {
        const idToken = url$1.searchParams.get("id_token");
        const accessToken = url$1.searchParams.get("access_token") || url$1.searchParams.get("token") || idToken;
        const refreshToken = url$1.searchParams.get("refresh_token") || url$1.searchParams.get("refresh");
        let email = url$1.searchParams.get("email") || url$1.searchParams.get("user_email");
        let name = url$1.searchParams.get("name") || url$1.searchParams.get("user_name") || url$1.searchParams.get("display_name");
        if (!email) {
          if (idToken) {
            const idTokenData = decodeJwtPayload(idToken);
            if (idTokenData) {
              email = idTokenData.email || null;
              name = name || idTokenData.name || null;
            }
          }
          if (!email && accessToken && accessToken !== idToken) {
            const accessTokenData = decodeJwtPayload(accessToken);
            if (accessTokenData) {
              email = accessTokenData.email || null;
              name = name || accessTokenData.name || null;
            }
          }
        }
        if (accessToken) {
          const tokens = {
            accessToken,
            refreshToken: refreshToken || void 0,
            user: email ? { email, name: name || email } : void 0
          };
          setAuth({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: tokens.user
          });
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Authentication Successful</title>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  margin: 0;
  background: #f9fafb;
}
.container {
  text-align: center;
  padding: 2rem;
}
.success {
  color: #059669;
  font-size: 1.5rem;
  margin-bottom: 1rem;
}
.message {
  color: #6b7280;
}
</style>
</head>
<body>
<div class="container">
  <div class="success">&#10003; Authentication Successful</div>
  <p class="message">You can close this window and return to Swanson.</p>
</div>
<script>
setTimeout(function() { window.close(); }, 2000);
<\/script>
</body>
</html>`);
          stopAuthServer();
          resolve(tokens);
        } else {
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Processing Authentication...</title>
</head>
<body>
<p>Processing authentication...</p>
<script>
if (window.location.hash) {
  var hash = window.location.hash.substring(1);
  window.location.href = window.location.pathname + '?' + hash;
} else {
  document.body.innerHTML = '<p>Authentication failed. Please try again.</p>';
}
<\/script>
</body>
</html>`);
        }
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });
    authServer.on("error", (err) => {
      if (err.code !== "EPIPE") {
        reject(err);
      }
    });
    authServer.listen(CALLBACK_PORT, "127.0.0.1");
    setTimeout(() => {
      if (authServer) {
        stopAuthServer();
        reject(new Error("Authentication timed out"));
      }
    }, 5 * 60 * 1e3);
  });
}
function stopAuthServer() {
  if (authServer) {
    authServer.close();
    authServer = null;
  }
}
async function login(mainWindow2) {
  const authPromise = startAuthServer();
  const ssoUrl = generateSsoUrl();
  await electron.shell.openExternal(ssoUrl);
  const tokens = await authPromise;
  mainWindow2.webContents.send("auth-success", tokens);
  return tokens;
}
function logout() {
  clearAuth();
  stopAuthServer();
}
function getAuthState() {
  const auth = getAuth();
  return {
    isAuthenticated: !!(auth == null ? void 0 : auth.accessToken),
    user: auth == null ? void 0 : auth.user
  };
}
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
class Logger {
  constructor() {
    this.minLevel = "debug";
    this.writeStream = null;
    const logDir = path__namespace.join(electron.app.getPath("userData"), "logs");
    if (!fs__namespace.existsSync(logDir)) {
      fs__namespace.mkdirSync(logDir, { recursive: true });
    }
    const date = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    this.logFile = path__namespace.join(logDir, `swanson-${date}.log`);
    this.writeStream = fs__namespace.createWriteStream(this.logFile, { flags: "a" });
    this.info("Logger", `Log file: ${this.logFile}`);
  }
  formatMessage(level, context, message, data) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const dataStr = data !== void 0 ? ` | ${JSON.stringify(data, null, 0)}` : "";
    return `[${timestamp}] [${level.toUpperCase().padEnd(5)}] [${context}] ${message}${dataStr}`;
  }
  write(level, context, message, data) {
    var _a;
    if (LOG_LEVELS[level] < LOG_LEVELS[this.minLevel]) return;
    const formatted = this.formatMessage(level, context, message, data);
    (_a = this.writeStream) == null ? void 0 : _a.write(formatted + "\n");
    const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    consoleFn(formatted);
  }
  debug(context, message, data) {
    this.write("debug", context, message, data);
  }
  info(context, message, data) {
    this.write("info", context, message, data);
  }
  warn(context, message, data) {
    this.write("warn", context, message, data);
  }
  error(context, message, data) {
    this.write("error", context, message, data);
  }
  getLogPath() {
    return this.logFile;
  }
  close() {
    var _a;
    (_a = this.writeStream) == null ? void 0 : _a.end();
  }
}
const logger = new Logger();
let claudeProcess = null;
function startClaudeSession(mainWindow2, prompt, workingDirectory) {
  var _a, _b;
  if (claudeProcess) {
    stopClaudeSession();
  }
  logger.info("Claude", "Starting session", { prompt: prompt.substring(0, 100), workingDirectory });
  mainWindow2.webContents.send("claude-output", {
    type: "start"
  });
  try {
    const home = os__namespace.homedir();
    const fs2 = require("fs");
    let claudeBinary = "claude";
    const nvmDir = `${home}/.nvm/versions/node`;
    if (fs2.existsSync(nvmDir)) {
      const nodeVersions = fs2.readdirSync(nvmDir).sort().reverse();
      for (const version of nodeVersions) {
        const candidatePath = `${nvmDir}/${version}/bin/claude`;
        if (fs2.existsSync(candidatePath)) {
          claudeBinary = candidatePath;
          break;
        }
      }
    }
    if (claudeBinary === "claude") {
      const commonPaths = [
        "/usr/local/bin/claude",
        "/opt/homebrew/bin/claude",
        `${home}/.local/bin/claude`
      ];
      for (const path2 of commonPaths) {
        if (fs2.existsSync(path2)) {
          claudeBinary = path2;
          break;
        }
      }
    }
    const args = [
      "--print",
      "--verbose",
      "--output-format",
      "stream-json",
      "--dangerously-skip-permissions",
      prompt
    ];
    logger.debug("Claude", "Spawning process", { command: claudeBinary, args });
    const envWithPath = {
      ...process.env,
      HOME: home,
      TERM: "xterm-256color"
    };
    claudeProcess = child_process.spawn(claudeBinary, args, {
      cwd: workingDirectory || process.cwd(),
      env: envWithPath,
      stdio: ["ignore", "pipe", "pipe"]
    });
    logger.info("Claude", "Process spawned", { pid: claudeProcess.pid });
    let buffer = "";
    (_a = claudeProcess.stdout) == null ? void 0 : _a.on("data", (data) => {
      var _a2, _b2, _c;
      const rawData = data.toString();
      logger.debug("Claude", "stdout data received", { bytes: data.length, raw: rawData.substring(0, 500) });
      buffer += rawData;
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      logger.debug("Claude", "Processing lines", { lineCount: lines.length, remainingBuffer: buffer.length });
      for (const line of lines) {
        if (!line.trim()) continue;
        logger.debug("Claude", "Processing line", { line: line.substring(0, 200) });
        try {
          const parsed = JSON.parse(line);
          logger.debug("Claude", "Parsed JSON", { type: parsed.type, keys: Object.keys(parsed) });
          if (parsed.type === "assistant") {
            logger.debug("Claude", "Received assistant message (skipping, will use result)", {
              contentBlocks: (_b2 = (_a2 = parsed.message) == null ? void 0 : _a2.content) == null ? void 0 : _b2.length
            });
          } else if (parsed.type === "content_block_delta" && ((_c = parsed.delta) == null ? void 0 : _c.text)) {
            logger.debug("Claude", "Sending delta", { length: parsed.delta.text.length });
            mainWindow2.webContents.send("claude-output", {
              type: "text",
              content: parsed.delta.text
            });
          } else if (parsed.type === "result" && parsed.result) {
            logger.info("Claude", "Received result", { length: parsed.result.length });
            mainWindow2.webContents.send("claude-output", {
              type: "text",
              content: parsed.result
            });
          } else if (parsed.type === "system") {
            logger.debug("Claude", "Received system message", { subtype: parsed.subtype });
          } else {
            logger.debug("Claude", "Other message type", { type: parsed.type });
          }
        } catch {
          logger.debug("Claude", "Non-JSON line, treating as text", { line: line.substring(0, 100) });
          mainWindow2.webContents.send("claude-output", {
            type: "text",
            content: line
          });
        }
      }
    });
    (_b = claudeProcess.stderr) == null ? void 0 : _b.on("data", (data) => {
      const errorText = data.toString();
      logger.debug("Claude", "stderr data received", { errorText: errorText.substring(0, 500) });
      if (!errorText.includes("Debugger") && !errorText.includes("DevTools")) {
        logger.warn("Claude", "Sending error to renderer", { errorText });
        mainWindow2.webContents.send("claude-output", {
          type: "error",
          error: errorText
        });
      }
    });
    claudeProcess.on("close", (code) => {
      logger.info("Claude", "Process closed", { exitCode: code, remainingBuffer: buffer.length });
      if (buffer.trim()) {
        logger.debug("Claude", "Processing remaining buffer", { buffer: buffer.substring(0, 200) });
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.result) {
            logger.info("Claude", "Final result from buffer", { length: parsed.result.length });
            mainWindow2.webContents.send("claude-output", {
              type: "text",
              content: parsed.result
            });
          }
        } catch {
          logger.debug("Claude", "Buffer not JSON, sending as text");
          mainWindow2.webContents.send("claude-output", {
            type: "text",
            content: buffer
          });
        }
      }
      logger.info("Claude", "Sending done signal");
      mainWindow2.webContents.send("claude-output", {
        type: "done",
        content: code === 0 ? void 0 : `Process exited with code ${code}`
      });
      claudeProcess = null;
    });
    claudeProcess.on("error", (error) => {
      logger.error("Claude", "Process error", { error: error.message, code: error.code });
      mainWindow2.webContents.send("claude-output", {
        type: "error",
        error: error.message.includes("ENOENT") ? "Claude CLI not found. Please ensure Claude Code is installed and in your PATH." : error.message
      });
      claudeProcess = null;
    });
  } catch (error) {
    logger.error("Claude", "Failed to start session", { error: error instanceof Error ? error.message : error });
    mainWindow2.webContents.send("claude-output", {
      type: "error",
      error: error instanceof Error ? error.message : "Failed to start Claude session"
    });
  }
}
function stopClaudeSession() {
  if (claudeProcess) {
    logger.info("Claude", "Stopping session", { pid: claudeProcess.pid });
    claudeProcess.kill("SIGTERM");
    claudeProcess = null;
  }
}
function isClaudeSessionActive() {
  return claudeProcess !== null && !claudeProcess.killed;
}
const __filename$1 = url.fileURLToPath(typeof document === "undefined" ? require("url").pathToFileURL(__filename).href : _documentCurrentScript && _documentCurrentScript.tagName.toUpperCase() === "SCRIPT" && _documentCurrentScript.src || new URL("main.js", document.baseURI).href);
const __dirname$1 = path.dirname(__filename$1);
let mainWindow = null;
function createWindow() {
  mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
electron.app.whenReady().then(createWindow);
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("activate", () => {
  if (electron.BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
electron.ipcMain.handle("get-app-version", () => {
  return electron.app.getVersion();
});
electron.ipcMain.handle("auth:login", async () => {
  if (!mainWindow) throw new Error("No main window");
  try {
    const tokens = await login(mainWindow);
    return { success: true, user: tokens.user };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("auth:logout", () => {
  logout();
  return { success: true };
});
electron.ipcMain.handle("auth:get-state", () => {
  return getAuthState();
});
electron.ipcMain.handle("settings:get", (_event, key) => {
  if (key) {
    return getSetting(key);
  }
  return getSettings();
});
electron.ipcMain.handle("settings:set", (_event, key, value) => {
  setSetting(key, value);
  return { success: true };
});
electron.ipcMain.handle("claude:start", (_event, prompt, workingDirectory) => {
  if (!mainWindow) throw new Error("No main window");
  startClaudeSession(mainWindow, prompt, workingDirectory);
  return { success: true };
});
electron.ipcMain.handle("claude:stop", () => {
  stopClaudeSession();
  return { success: true };
});
electron.ipcMain.handle("claude:is-active", () => {
  return isClaudeSessionActive();
});
electron.app.on("before-quit", () => {
  stopAuthServer();
  stopClaudeSession();
});
