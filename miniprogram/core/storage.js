"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.empty = void 0;
exports.read = read;
exports.write = write;
exports.id = id;
exports.error = error;
exports.backupRaw = backupRaw;
exports.clear = clear;
const validation_1 = require("./validation");
const KEY = "xiaojiao.v1";
const empty = () => ({
    schemaVersion: 1,
    semesterId: "2026-fall",
    courses: [],
    adjustments: [],
});
exports.empty = empty;
function read() {
    const v = wx.getStorageSync(KEY);
    if (v === "" || v === undefined)
        return (0, exports.empty)();
    return (0, validation_1.parse)(JSON.stringify(Object.assign(Object.assign({}, v), { backupVersion: 1 })), true);
}
function write(v) {
    const checked = (0, validation_1.parse)(JSON.stringify(Object.assign(Object.assign({}, v), { backupVersion: 1 })), true);
    wx.setStorageSync(KEY, checked);
}
function id() {
    return (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 11));
}
function error(e) {
    wx.showModal({
        title: "未能完成",
        content: e instanceof Error ? e.message : "本地存储不可用，请稍后重试",
        showCancel: false,
    });
}
function backupRaw() {
    return JSON.stringify(wx.getStorageSync(KEY) || (0, exports.empty)(), null, 2);
}
function clear() {
    wx.removeStorageSync(KEY);
}
