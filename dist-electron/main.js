"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
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
function getGitHubAuth() {
  const auth = store.get("github", {});
  if (auth && Object.keys(auth).length > 0) {
    console.log("getGitHubAuth: Retrieved auth", {
      keys: Object.keys(auth),
      hasDeviceCode: !!auth.deviceCode,
      hasAccessToken: !!auth.accessToken
    });
  }
  return auth;
}
function setGitHubAuth(auth) {
  var _a, _b;
  const current = getGitHubAuth();
  const merged = { ...current, ...auth };
  const cleaned = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== void 0) {
      cleaned[key] = value;
    }
  }
  console.log("setGitHubAuth: Setting auth", {
    currentKeys: Object.keys(current),
    newKeys: Object.keys(auth),
    newValues: Object.fromEntries(
      Object.entries(auth).map(([k, v]) => [
        k,
        k === "accessToken" || k === "refreshToken" ? v ? `${String(v).substring(0, 10)}...` : "undefined" : v
      ])
    ),
    cleanedKeys: Object.keys(cleaned),
    cleanedValues: Object.fromEntries(
      Object.entries(cleaned).map(([k, v]) => [
        k,
        k === "accessToken" || k === "refreshToken" ? v ? `${String(v).substring(0, 10)}...` : "undefined" : v
      ])
    ),
    hasDeviceCode: !!cleaned.deviceCode,
    hasAccessToken: !!cleaned.accessToken
  });
  store.set("github", cleaned);
  const verify = store.get("github", {});
  console.log("setGitHubAuth: Verification after store.set", {
    storedKeys: Object.keys(verify),
    hasAccessToken: !!verify.accessToken,
    hasDeviceCode: !!verify.deviceCode
  });
  if (!verify.deviceCode && auth.deviceCode) {
    console.error("setGitHubAuth: Device code was not stored!", {
      requested: ((_a = auth.deviceCode) == null ? void 0 : _a.substring(0, 10)) + "...",
      stored: verify
    });
  }
  if (!verify.accessToken && auth.accessToken) {
    console.error("setGitHubAuth: Access token was not stored!", {
      requested: ((_b = auth.accessToken) == null ? void 0 : _b.substring(0, 10)) + "...",
      stored: verify
    });
  }
}
function clearGitHubAuth() {
  console.log("clearGitHubAuth: Clearing all GitHub auth state");
  store.set("github", {
    accessToken: void 0,
    refreshToken: void 0,
    expiresAt: void 0,
    deviceCode: void 0,
    deviceCodeExpiresAt: void 0,
    deviceCodeInterval: void 0,
    user: void 0
  });
  const verify = store.get("github", {});
  if (Object.keys(verify).length > 0) {
    console.warn("clearGitHubAuth: Warning - some keys remain after clear", Object.keys(verify));
    store.set("github", {});
  }
  console.log("clearGitHubAuth: GitHub auth state cleared");
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
const GITHUB_CLIENT_ID = "Iv23liurMNhAe3Pg8exL";
const GITHUB_DEVICE_CODE_URL = "https://github.com/login/device/code";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_SCOPE = "repo read:org";
async function startGitHubDeviceFlow() {
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_SCOPE
    })
  });
  if (!response.ok) {
    throw new Error(`Failed to start device flow: ${response.statusText}`);
  }
  const deviceCodeData = await response.json();
  console.log("startGitHubDeviceFlow: Storing device code", {
    deviceCode: deviceCodeData.device_code.substring(0, 10) + "...",
    expiresIn: deviceCodeData.expires_in,
    interval: deviceCodeData.interval
  });
  setGitHubAuth({
    deviceCode: deviceCodeData.device_code,
    deviceCodeExpiresAt: Date.now() + deviceCodeData.expires_in * 1e3,
    deviceCodeInterval: deviceCodeData.interval
  });
  const verifyAuth = getGitHubAuth();
  if (!(verifyAuth == null ? void 0 : verifyAuth.deviceCode)) {
    console.error("startGitHubDeviceFlow: Device code was not stored!", { verifyAuth });
    throw new Error("Failed to store device code");
  }
  console.log("startGitHubDeviceFlow: Device code stored successfully");
  const pollForToken = async () => {
    return pollDeviceCodeToken();
  };
  return {
    userCode: deviceCodeData.user_code,
    verificationUri: deviceCodeData.verification_uri,
    pollForToken
  };
}
async function pollDeviceCodeToken() {
  var _a;
  console.log("pollDeviceCodeToken: Function called");
  const auth = getGitHubAuth();
  console.log("pollDeviceCodeToken: Checking for device code", {
    hasAuth: !!auth,
    authType: typeof auth,
    authKeys: auth ? Object.keys(auth) : "no auth",
    hasDeviceCode: !!(auth == null ? void 0 : auth.deviceCode),
    deviceCodeValue: (auth == null ? void 0 : auth.deviceCode) ? auth.deviceCode.substring(0, 10) + "..." : "undefined",
    deviceCodeLength: (_a = auth == null ? void 0 : auth.deviceCode) == null ? void 0 : _a.length,
    expiresAt: auth == null ? void 0 : auth.deviceCodeExpiresAt,
    currentTime: Date.now(),
    fullAuth: JSON.stringify(auth)
  });
  if (!(auth == null ? void 0 : auth.deviceCode)) {
    console.error("pollDeviceCodeToken: No device code found!", {
      auth,
      authType: typeof auth,
      authKeys: auth ? Object.keys(auth) : "no auth",
      fullAuthString: JSON.stringify(auth)
    });
    throw new Error("No device code found. Please start the authentication flow again.");
  }
  if (auth.deviceCodeExpiresAt && Date.now() >= auth.deviceCodeExpiresAt) {
    console.log("pollDeviceCodeToken: Device code expired, clearing");
    setGitHubAuth({
      deviceCode: void 0,
      deviceCodeExpiresAt: void 0,
      deviceCodeInterval: void 0
    });
    throw new Error("Device code expired. Please restart the authentication flow.");
  }
  let pollInterval = (auth.deviceCodeInterval || 5) * 1e3;
  auth.deviceCodeExpiresAt || Date.now() + 900 * 1e3;
  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: auth.deviceCode,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code"
    })
  });
  console.log("pollDeviceCodeToken: Token response status", {
    ok: tokenResponse.ok,
    status: tokenResponse.status,
    statusText: tokenResponse.statusText
  });
  const responseText = await tokenResponse.text();
  console.log("pollDeviceCodeToken: Raw response text", responseText.substring(0, 200));
  const responseData = JSON.parse(responseText);
  if (responseData.error) {
    console.log("pollDeviceCodeToken: Error response detected", {
      error: responseData.error,
      errorDescription: responseData.error_description,
      interval: responseData.interval
    });
    if (responseData.error === "authorization_pending") {
      console.log("pollDeviceCodeToken: Throwing AUTHORIZATION_PENDING");
      throw new Error("AUTHORIZATION_PENDING");
    } else if (responseData.error === "slow_down") {
      const newInterval = responseData.interval || pollInterval / 1e3 * 1.5;
      pollInterval = Math.min(newInterval * 1e3, 6e4);
      console.log("pollDeviceCodeToken: SLOW_DOWN - updating interval", {
        oldInterval: auth.deviceCodeInterval,
        newInterval: pollInterval / 1e3,
        responseInterval: responseData.interval
      });
      setGitHubAuth({
        deviceCodeInterval: pollInterval / 1e3
      });
      console.log("pollDeviceCodeToken: Throwing SLOW_DOWN");
      throw new Error("SLOW_DOWN");
    } else if (responseData.error === "expired_token") {
      console.log("pollDeviceCodeToken: Device code expired, clearing");
      setGitHubAuth({
        deviceCode: void 0,
        deviceCodeExpiresAt: void 0,
        deviceCodeInterval: void 0
      });
      throw new Error("Device code expired. Please restart the authentication flow.");
    } else if (responseData.error === "access_denied") {
      setGitHubAuth({
        deviceCode: void 0,
        deviceCodeExpiresAt: void 0,
        deviceCodeInterval: void 0
      });
      throw new Error("Access denied. User rejected the authorization request.");
    } else {
      throw new Error(`Token request failed: ${responseData.error_description || responseData.error}`);
    }
  }
  console.log("pollDeviceCodeToken: Success! No error in response, parsing token data");
  if (!tokenResponse.ok) {
    throw new Error(`Token request failed: ${tokenResponse.statusText}`);
  }
  const tokenData = responseData;
  console.log("pollDeviceCodeToken: Parsed token data", {
    hasAccessToken: !!tokenData.access_token,
    hasRefreshToken: !!tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
    tokenType: tokenData.token_type,
    scope: tokenData.scope,
    accessTokenPreview: tokenData.access_token ? tokenData.access_token.substring(0, 10) + "..." : "undefined",
    refreshTokenPreview: tokenData.refresh_token ? tokenData.refresh_token.substring(0, 10) + "..." : "undefined",
    allKeys: Object.keys(tokenData)
  });
  const tokensToStore = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1e3 : void 0
  };
  console.log("pollDeviceCodeToken: About to store tokens", {
    hasAccessToken: !!tokensToStore.accessToken,
    hasRefreshToken: !!tokensToStore.refreshToken,
    expiresAt: tokensToStore.expiresAt
  });
  console.log("========================================");
  console.log("GitHub Access Token:", tokenData.access_token);
  console.log("========================================");
  setGitHubAuth(tokensToStore);
  return tokenData;
}
async function refreshGitHubToken(refreshToken) {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken
    })
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(`Token refresh failed: ${error.error_description || error.error || response.statusText}`);
  }
  const tokenData = await response.json();
  setGitHubAuth({
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || refreshToken,
    // Keep old refresh token if new one not provided
    expiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1e3 : void 0
  });
  console.log("========================================");
  console.log("GitHub Access Token (refreshed):", tokenData.access_token);
  console.log("========================================");
  return tokenData;
}
async function ensureValidGitHubToken() {
  const auth = getGitHubAuth();
  if (!(auth == null ? void 0 : auth.accessToken)) {
    throw new Error("GitHub not connected");
  }
  if (auth.expiresAt && Date.now() >= auth.expiresAt - 5 * 60 * 1e3) {
    if (!auth.refreshToken) {
      throw new Error("Token expired and no refresh token available");
    }
    await refreshGitHubToken(auth.refreshToken);
    const refreshedAuth = getGitHubAuth();
    if (!(refreshedAuth == null ? void 0 : refreshedAuth.accessToken)) {
      throw new Error("Failed to refresh token");
    }
    return refreshedAuth.accessToken;
  }
  return auth.accessToken;
}
async function githubRequest(endpoint) {
  const token = await ensureValidGitHubToken();
  const response = await fetch(`https://api.github.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.v3+json"
    }
  });
  if (response.status === 401) {
    const refreshedToken = await ensureValidGitHubToken();
    const retryResponse = await fetch(`https://api.github.com${endpoint}`, {
      headers: {
        Authorization: `Bearer ${refreshedToken}`,
        Accept: "application/vnd.github.v3+json"
      }
    });
    if (!retryResponse.ok) {
      throw new Error(`GitHub API error: ${retryResponse.statusText}`);
    }
    return retryResponse.json();
  }
  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.statusText}`);
  }
  return response.json();
}
async function getAuthenticatedUser() {
  return githubRequest("/user");
}
async function listOrgRepos(org) {
  const repos = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const response = await githubRequest(`/orgs/${org}/repos?per_page=${perPage}&page=${page}`);
    if (response.length === 0) {
      break;
    }
    repos.push(...response);
    if (response.length < perPage) {
      break;
    }
    page++;
  }
  return repos;
}
const TEACHUPBEAT_ORG = "TeachUpbeat";
async function loadRepositories() {
  const auth = getGitHubAuth();
  if (!(auth == null ? void 0 : auth.accessToken)) {
    throw new Error("GitHub not connected");
  }
  await ensureValidGitHubToken();
  const repos = await listOrgRepos(TEACHUPBEAT_ORG);
  return repos.filter((r) => !r.archived);
}
function formatRepoContext(repos) {
  if (repos.length === 0) {
    return "No repositories available.";
  }
  const repoList = repos.map((repo) => {
    const parts = [
      `- **${repo.full_name}**`,
      repo.description ? `  ${repo.description}` : null,
      `  Language: ${repo.language || "N/A"}`,
      `  Default branch: ${repo.default_branch}`,
      `  URL: ${repo.html_url}`
    ].filter(Boolean).join("\n");
    return parts;
  }).join("\n\n");
  return `You have read-only access to ${repos.length} repository/repositories in the TeachUpbeat organization:

${repoList}

Note: You can reference these repositories in your responses, but you cannot push branches, create PRs, or modify repository contents.`;
}
let claudeProcess = null;
let currentSessionId = null;
async function startClaudeSession(mainWindow2, prompt, workingDirectory) {
  var _a, _b;
  if (claudeProcess) {
    stopClaudeSession();
  }
  let repoContext = "";
  try {
    const repos = await loadRepositories();
    repoContext = formatRepoContext(repos);
    logger.info("Claude", "Loaded repositories", { count: repos.length });
  } catch (error) {
    logger.warn("Claude", "Failed to load repositories", { error: error.message });
  }
  const enhancedPrompt = repoContext ? `${prompt}

## Available Repositories
${repoContext}` : prompt;
  logger.info("Claude", "Starting session", { prompt: enhancedPrompt.substring(0, 100), workingDirectory });
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
      "--include-partial-messages"
    ];
    if (currentSessionId) {
      args.push("--resume", currentSessionId);
      logger.info("Claude", "Resuming session", { sessionId: currentSessionId });
    }
    args.push(enhancedPrompt);
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
          if (parsed.type === "assistant" && ((_a2 = parsed.message) == null ? void 0 : _a2.content)) {
            logger.info("Claude", "Received assistant message", {
              contentBlocks: parsed.message.content.length
            });
            for (const block of parsed.message.content) {
              if (block.type === "text" && block.text) {
                logger.debug("Claude", "Sending text block", { length: block.text.length });
                mainWindow2.webContents.send("claude-output", {
                  type: "text",
                  content: block.text
                });
              }
            }
          } else if (parsed.type === "content_block_delta" && ((_b2 = parsed.delta) == null ? void 0 : _b2.text)) {
            logger.debug("Claude", "Sending delta", { length: parsed.delta.text.length });
            mainWindow2.webContents.send("claude-output", {
              type: "text",
              content: parsed.delta.text
            });
          } else if (parsed.type === "result") {
            logger.info("Claude", "Received result (skipping, already streamed)", {
              length: (_c = parsed.result) == null ? void 0 : _c.length
            });
          } else if (parsed.type === "system") {
            logger.debug("Claude", "Received system message", { subtype: parsed.subtype });
            if (parsed.subtype === "init" && parsed.session_id) {
              currentSessionId = parsed.session_id;
              logger.info("Claude", "Captured session ID for continuity", { sessionId: currentSessionId });
            }
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
      var _a2;
      logger.info("Claude", "Process closed", { exitCode: code, remainingBuffer: buffer.length });
      if (buffer.trim()) {
        logger.debug("Claude", "Processing remaining buffer", { buffer: buffer.substring(0, 200) });
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.type === "assistant" && ((_a2 = parsed.message) == null ? void 0 : _a2.content)) {
            for (const block of parsed.message.content) {
              if (block.type === "text" && block.text) {
                mainWindow2.webContents.send("claude-output", {
                  type: "text",
                  content: block.text
                });
              }
            }
          } else if (parsed.type !== "result" && parsed.type !== "system") {
            logger.debug("Claude", "Buffer has unknown type, skipping");
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
function clearClaudeSession() {
  logger.info("Claude", "Clearing session", { previousSessionId: currentSessionId });
  currentSessionId = null;
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
electron.ipcMain.handle("github:start-auth", async () => {
  if (!mainWindow) throw new Error("No main window");
  try {
    const flow = await startGitHubDeviceFlow();
    return {
      success: true,
      userCode: flow.userCode,
      verificationUri: flow.verificationUri
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("github:open-verification-uri", async (_event, uri) => {
  const { shell } = await import("electron");
  await shell.openExternal(uri);
  return { success: true };
});
electron.ipcMain.handle("github:poll-token", async () => {
  console.log("github:poll-token: IPC handler called");
  try {
    console.log("github:poll-token: About to call pollDeviceCodeToken");
    const tokenData = await pollDeviceCodeToken();
    console.log("github:poll-token: pollDeviceCodeToken succeeded", { hasToken: !!tokenData });
    console.log("github:poll-token: About to call getAuthenticatedUser");
    const user = await getAuthenticatedUser();
    console.log("github:poll-token: getAuthenticatedUser succeeded", { user: user.login });
    setGitHubAuth({
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url
      },
      // Clear device code now that we have token and user info
      deviceCode: void 0,
      deviceCodeExpiresAt: void 0,
      deviceCodeInterval: void 0
    });
    console.log("github:poll-token: Stored user info and cleared device code");
    if (mainWindow) {
      console.log("github:poll-token: Sending github-auth-success event");
      mainWindow.webContents.send("github-auth-success", {
        user: {
          login: user.login,
          name: user.name,
          avatarUrl: user.avatar_url
        }
      });
    }
    const response = {
      success: true,
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url
      }
    };
    console.log("github:poll-token: Returning success response", response);
    return response;
  } catch (error) {
    const errorMessage = error.message;
    if (errorMessage === "AUTHORIZATION_PENDING" || errorMessage === "SLOW_DOWN" || errorMessage.includes("authorization_pending") || errorMessage.includes("slow_down")) {
      const auth = getGitHubAuth();
      return {
        success: false,
        pending: true,
        error: null,
        recommendedInterval: (auth == null ? void 0 : auth.deviceCodeInterval) || 5
        // Return current interval in seconds
      };
    }
    console.error("GitHub poll error:", errorMessage);
    return { success: false, error: errorMessage };
  }
});
electron.ipcMain.handle("github:get-state", async () => {
  const auth = getGitHubAuth();
  if ((auth == null ? void 0 : auth.deviceCode) && auth.deviceCodeExpiresAt && Date.now() >= auth.deviceCodeExpiresAt) {
    console.log("github:get-state: Clearing expired device code");
    setGitHubAuth({
      deviceCode: void 0,
      deviceCodeExpiresAt: void 0,
      deviceCodeInterval: void 0
    });
  }
  if (!(auth == null ? void 0 : auth.accessToken)) {
    return {
      isConnected: false,
      user: null
    };
  }
  try {
    const user = await getAuthenticatedUser();
    return {
      isConnected: true,
      user: {
        login: user.login,
        name: user.name,
        avatarUrl: user.avatar_url
      }
    };
  } catch (error) {
    console.log("github:get-state: Token invalid, clearing auth state");
    setGitHubAuth({
      accessToken: void 0,
      refreshToken: void 0,
      expiresAt: void 0,
      user: void 0,
      deviceCode: void 0,
      deviceCodeExpiresAt: void 0,
      deviceCodeInterval: void 0
    });
    return {
      isConnected: false,
      user: null
    };
  }
});
electron.ipcMain.handle("github:logout", () => {
  console.log("github:logout: Logging out GitHub");
  clearGitHubAuth();
  const verify = getGitHubAuth();
  if (Object.keys(verify).length > 0) {
    console.warn("github:logout: Warning - some auth state remains after logout", Object.keys(verify));
  }
  console.log("github:logout: Logout complete");
  return { success: true };
});
electron.ipcMain.handle("github:list-repos", async () => {
  try {
    const repos = await loadRepositories();
    return { success: true, repos };
  } catch (error) {
    return { success: false, error: error.message };
  }
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
electron.ipcMain.handle("claude:clear-session", () => {
  clearClaudeSession();
  return { success: true };
});
electron.app.on("before-quit", () => {
  stopAuthServer();
  stopClaudeSession();
});
