"use strict";
const electron = require("electron");
const path = require("path");
const url = require("url");
const http = require("http");
const crypto = require("crypto");
const Store = require("electron-store");
const WebSocket = require("ws");
var _documentCurrentScript = typeof document !== "undefined" ? document.currentScript : null;
const store = new Store({
  name: "swanson-config",
  encryptionKey: "swanson-secure-storage-key",
  defaults: {
    auth: {},
    settings: {
      theme: "light"
    },
    server: {
      url: "http://localhost:18790",
      token: "swanson-dev-token"
    },
    threadsCache: [],
    plansCache: []
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
function getServerConfig() {
  return store.get("server", { url: "http://localhost:18790", token: "swanson-dev-token" });
}
function setServerConfig(config2) {
  const current = getServerConfig();
  store.set("server", { ...current, ...config2 });
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
let config = null;
let connectionState = "disconnected";
let ws = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let mainWindowRef = null;
let chatRunning = false;
let currentMessageId = null;
let fullContent = "";
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1e3;
const pendingRequests = /* @__PURE__ */ new Map();
let sessionKey = "main";
function getWsUrl() {
  if (!config) return null;
  try {
    const url2 = new URL(config.serverUrl);
    url2.protocol = url2.protocol === "https:" ? "wss:" : "ws:";
    url2.pathname = "/ws";
    return url2.toString();
  } catch {
    return null;
  }
}
function sendFrame(frame) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(frame));
  }
}
function sendToRenderer(type, payload) {
  if (!mainWindowRef || mainWindowRef.isDestroyed()) return;
  const message = {
    type,
    sessionId: sessionKey,
    payload,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  mainWindowRef.webContents.send("openclaw-message", message);
}
function handleMessage(raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  const msgType = msg.type;
  if (msgType === "res" && typeof msg.id === "string") {
    const pending = pendingRequests.get(msg.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingRequests.delete(msg.id);
      if (msg.ok) {
        pending.resolve(msg.payload);
      } else {
        pending.reject(new Error(JSON.stringify(msg.error || "Unknown error")));
      }
    }
    return;
  }
  if (msgType === "event") {
    const event = msg.event;
    const payload = msg.payload;
    if (event === "connect.challenge") {
      handleConnectChallenge();
      return;
    }
    if (event === "agent" && payload) {
      handleAgentEvent(payload);
      return;
    }
    if (event === "session.start" || event === "session.end") {
      return;
    }
  }
}
function handleConnectChallenge(payload) {
  if (!config) return;
  sendFrame({
    type: "req",
    id: crypto.randomUUID(),
    method: "connect",
    params: {
      minProtocol: 3,
      maxProtocol: 3,
      client: {
        id: "cli",
        version: "1.0.0",
        platform: process.platform,
        mode: "cli"
      },
      role: "operator",
      scopes: ["operator.read", "operator.write"],
      auth: {
        token: config.token
      }
    }
  });
}
function handleAgentEvent(payload) {
  const stream = payload.stream;
  const delta = payload.delta;
  const phase = payload.phase;
  if (stream === "lifecycle") {
    if (phase === "start") {
      return;
    }
    if (phase === "end" || phase === "error") {
      if (chatRunning && currentMessageId) {
        sendToRenderer("chat", {
          content: fullContent,
          delta: false,
          done: true,
          messageId: currentMessageId
        });
        chatRunning = false;
        currentMessageId = null;
        fullContent = "";
      }
      if (phase === "error") {
        const errorMsg = payload.error || "Agent run failed";
        sendToRenderer("error", { code: "AGENT_ERROR", message: errorMsg });
      }
      return;
    }
  }
  if (stream === "assistant" && delta && currentMessageId) {
    fullContent += delta;
    sendToRenderer("chat", {
      content: delta,
      delta: true,
      done: false,
      messageId: currentMessageId
    });
    return;
  }
  if (stream === "tool") {
    return;
  }
}
function configure(serverUrl, token, userEmail) {
  config = { serverUrl, token, userEmail };
  sessionKey = `swanson-${userEmail.replace(/[^a-zA-Z0-9]/g, "-")}`;
}
async function connect() {
  if (!config) {
    return { success: false, error: "Client not configured. Set server URL and token first." };
  }
  const wsUrl = getWsUrl();
  if (!wsUrl) {
    return { success: false, error: "Invalid server URL" };
  }
  if (ws) {
    ws.removeAllListeners();
    ws.close();
    ws = null;
  }
  return new Promise((resolve) => {
    const socket = new WebSocket(wsUrl);
    let connected = false;
    let connectTimeout = null;
    const onFirstMessage = (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.type === "event" && msg.event === "connect.challenge") {
        handleConnectChallenge(msg.payload);
        return;
      }
      if (msg.type === "res" && msg.ok === true) {
        const payload = msg.payload;
        if ((payload == null ? void 0 : payload.type) === "hello-ok") {
          connected = true;
          connectionState = "connected";
          reconnectAttempts = 0;
          if (connectTimeout) clearTimeout(connectTimeout);
          socket.removeListener("message", onFirstMessage);
          socket.on("message", handleMessage);
          resolve({ success: true });
          return;
        }
      }
      if (msg.type === "res" && msg.ok === false) {
        if (connectTimeout) clearTimeout(connectTimeout);
        socket.close();
        ws = null;
        connectionState = "disconnected";
        const errMsg = JSON.stringify(msg.error || "Authentication failed");
        resolve({ success: false, error: errMsg });
      }
    };
    socket.on("message", onFirstMessage);
    socket.on("open", () => {
      ws = socket;
    });
    socket.on("close", () => {
      if (connected) {
        connectionState = "disconnected";
        sendToRenderer("status", { state: "disconnected", message: "Connection closed" });
        if (mainWindowRef) scheduleReconnect();
      }
    });
    socket.on("error", (err) => {
      if (!connected) {
        if (connectTimeout) clearTimeout(connectTimeout);
        connectionState = "disconnected";
        resolve({ success: false, error: `WebSocket error: ${err.message}` });
      } else {
        sendToRenderer("error", { code: "WS_ERROR", message: err.message });
      }
    });
    connectTimeout = setTimeout(() => {
      if (!connected) {
        socket.close();
        ws = null;
        connectionState = "disconnected";
        resolve({ success: false, error: "Connection handshake timed out" });
      }
    }, 1e4);
  });
}
function disconnect() {
  if (ws) {
    ws.removeAllListeners();
    ws.close();
    ws = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  connectionState = "disconnected";
  reconnectAttempts = 0;
  chatRunning = false;
  currentMessageId = null;
  fullContent = "";
  for (const [id, pending] of pendingRequests) {
    clearTimeout(pending.timer);
    pending.reject(new Error("Disconnected"));
  }
  pendingRequests.clear();
}
function getConnectionState() {
  return connectionState;
}
function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    connectionState = "disconnected";
    sendToRenderer("status", {
      state: "disconnected",
      message: "Max reconnection attempts reached"
    });
    return;
  }
  connectionState = "reconnecting";
  const delay = Math.min(
    BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts),
    3e4
  );
  reconnectAttempts++;
  sendToRenderer("status", {
    state: "reconnecting",
    message: `Reconnecting in ${Math.round(delay / 1e3)}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`
  });
  reconnectTimer = setTimeout(async () => {
    const result = await connect();
    if (result.success) {
      sendToRenderer("status", { state: "connected", message: "Reconnected" });
    } else {
      scheduleReconnect();
    }
  }, delay);
}
async function sendChat(mainWindow2, content, threadId) {
  mainWindowRef = mainWindow2;
  if (!config || connectionState !== "connected") {
    sendToRenderer("error", {
      code: "NOT_CONNECTED",
      message: "Not connected to OpenClaw server"
    });
    return;
  }
  const messageId = crypto.randomUUID();
  currentMessageId = messageId;
  fullContent = "";
  chatRunning = true;
  sendToRenderer("chat", {
    content: "",
    delta: false,
    done: false,
    messageId
  });
  try {
    const idempotencyKey = crypto.randomUUID();
    sendFrame({
      type: "req",
      id: messageId,
      method: "agent",
      params: {
        sessionKey: threadId || sessionKey,
        message: content,
        idempotencyKey
      }
    });
  } catch (err) {
    sendToRenderer("error", {
      code: "REQUEST_ERROR",
      message: err.message
    });
    chatRunning = false;
    currentMessageId = null;
    fullContent = "";
    scheduleReconnect();
  }
}
function stopChat() {
  if (chatRunning) {
    sendFrame({
      type: "req",
      id: crypto.randomUUID(),
      method: "agent.stop",
      params: { sessionKey }
    });
    chatRunning = false;
    currentMessageId = null;
    fullContent = "";
  }
}
function isActive() {
  return chatRunning;
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
electron.ipcMain.handle("openclaw:connect", async () => {
  var _a;
  const serverConfig = getServerConfig();
  const authState = getAuthState();
  const userEmail = ((_a = authState == null ? void 0 : authState.user) == null ? void 0 : _a.email) || "unknown";
  configure(serverConfig.url, serverConfig.token, userEmail);
  const result = await connect();
  if (result.success && mainWindow) {
    mainWindow.webContents.send("openclaw-message", {
      type: "status",
      sessionId: "",
      payload: { state: "connected", message: "Connected to OpenClaw server" },
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return result;
});
electron.ipcMain.handle("openclaw:send", async (_event, content, threadId) => {
  if (!mainWindow) throw new Error("No main window");
  await sendChat(mainWindow, content, threadId);
  return { success: true };
});
electron.ipcMain.handle("openclaw:stop", () => {
  stopChat();
  return { success: true };
});
electron.ipcMain.handle("openclaw:disconnect", () => {
  disconnect();
  return { success: true };
});
electron.ipcMain.handle("openclaw:status", () => {
  return { state: getConnectionState() };
});
electron.ipcMain.handle("openclaw:is-active", () => {
  return isActive();
});
electron.ipcMain.handle("openclaw:set-server", (_event, url2, token) => {
  setServerConfig({ url: url2, token });
  return { success: true };
});
electron.ipcMain.handle("openclaw:get-server", () => {
  return getServerConfig();
});
electron.app.on("before-quit", () => {
  stopAuthServer();
  disconnect();
});
