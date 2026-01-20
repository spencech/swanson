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
    onOutput: (callback) => {
      const handler = (_event, chunk) => callback(chunk);
      electron.ipcRenderer.on("claude-output", handler);
      return () => electron.ipcRenderer.removeListener("claude-output", handler);
    }
  }
});
