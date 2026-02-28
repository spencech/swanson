"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // App info
  getAppVersion: () => electron.ipcRenderer.invoke("get-app-version"),
  platform: process.platform,
  // Auth (Google SSO)
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
  // OpenClaw
  openclaw: {
    connect: () => electron.ipcRenderer.invoke("openclaw:connect"),
    send: (content, threadId) => electron.ipcRenderer.invoke("openclaw:send", content, threadId),
    stop: () => electron.ipcRenderer.invoke("openclaw:stop"),
    disconnect: () => electron.ipcRenderer.invoke("openclaw:disconnect"),
    status: () => electron.ipcRenderer.invoke("openclaw:status"),
    isActive: () => electron.ipcRenderer.invoke("openclaw:is-active"),
    setServer: (url, token) => electron.ipcRenderer.invoke("openclaw:set-server", url, token),
    getServer: () => electron.ipcRenderer.invoke("openclaw:get-server"),
    onMessage: (callback) => {
      const handler = (_event, message) => callback(message);
      electron.ipcRenderer.on("openclaw-message", handler);
      return () => electron.ipcRenderer.removeListener("openclaw-message", handler);
    }
  }
});
