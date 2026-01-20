"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  getAppVersion: () => electron.ipcRenderer.invoke("get-app-version"),
  platform: process.platform,
  // Auth
  auth: {
    login: () => electron.ipcRenderer.invoke("auth:login"),
    logout: () => electron.ipcRenderer.invoke("auth:logout"),
    getState: () => electron.ipcRenderer.invoke("auth:get-state"),
    onAuthSuccess: (callback) => {
      electron.ipcRenderer.on("auth-success", (_event, tokens) => callback(tokens.user));
    }
  },
  // Settings
  settings: {
    get: (key) => electron.ipcRenderer.invoke("settings:get", key),
    set: (key, value) => electron.ipcRenderer.invoke("settings:set", key, value)
  },
  // Claude Code
  claude: {
    start: (prompt, workingDirectory) => electron.ipcRenderer.invoke("claude:start", prompt, workingDirectory),
    stop: () => electron.ipcRenderer.invoke("claude:stop"),
    isActive: () => electron.ipcRenderer.invoke("claude:is-active"),
    clearSession: () => electron.ipcRenderer.invoke("claude:clear-session"),
    onOutput: (callback) => {
      const handler = (_event, chunk) => callback(chunk);
      electron.ipcRenderer.on("claude-output", handler);
      return () => electron.ipcRenderer.removeListener("claude-output", handler);
    }
  },
  // GitHub
  github: {
    startAuth: () => electron.ipcRenderer.invoke("github:start-auth"),
    pollToken: () => electron.ipcRenderer.invoke("github:poll-token"),
    getState: () => electron.ipcRenderer.invoke("github:get-state"),
    logout: () => electron.ipcRenderer.invoke("github:logout"),
    listRepos: () => electron.ipcRenderer.invoke("github:list-repos"),
    openVerificationUri: (uri) => electron.ipcRenderer.invoke("github:open-verification-uri", uri),
    onAuthSuccess: (callback) => {
      electron.ipcRenderer.on("github-auth-success", (_event, data) => callback(data.user));
    }
  }
});
