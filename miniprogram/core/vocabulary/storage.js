"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KEY = void 0;
exports.validate = validate;
exports.read = read;
exports.write = write;
exports.change = change;
exports.backup = backup;
exports.parseBackup = parseBackup;
exports.restore = restore;
exports.raw = raw;
exports.clear = clear;
exports.error = error;
const engine_1 = require("./engine");
exports.KEY = "xiaojiao.vocabulary.v1";
const MAX = 5 * 1024 * 1024;
function bytes(text) {
    let size = 0;
    for (let i = 0; i < text.length; i++) {
        const c = text.charCodeAt(i);
        if (c < 128)
            size++;
        else if (c < 2048)
            size += 2;
        else if (c >= 0xd800 &&
            c <= 0xdbff &&
            text.charCodeAt(i + 1) >= 0xdc00 &&
            text.charCodeAt(i + 1) <= 0xdfff) {
            size += 4;
            i++;
        }
        else
            size += 3;
    }
    return size;
}
function check(ok, message) {
    if (!ok)
        throw new Error(message);
}
function obj(x) {
    return !!x && typeof x === "object" && !Array.isArray(x);
}
function integer(x, min, max) {
    return Number.isInteger(x) && x >= min && x <= max;
}
function id(x) {
    return typeof x === "string" && /^w-[a-z][a-z-]{0,79}$/.test(x);
}
function date(x) {
    return (typeof x === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(x) &&
        Number.isFinite(Date.parse(x + "T00:00:00Z")) &&
        new Date(x + "T00:00:00Z").toISOString().slice(0, 10) === x);
}
function ids(x, max = 20000) {
    return (Array.isArray(x) &&
        x.length <= max &&
        x.every(id) &&
        new Set(x).size === x.length);
}
function attemptId(x) {
    return typeof x === "string" && /^[a-z0-9-]{1,100}$/.test(x);
}
function validate(input) {
    const text = JSON.stringify(input);
    check(typeof text === "string" && bytes(text) <= MAX - 512, "背词数据过大或为空");
    const s = JSON.parse(text);
    const safe = (v) => {
        if (v && typeof v === "object")
            for (const k of Object.keys(v)) {
                check(!["__proto__", "constructor", "prototype"].includes(k), "数据含保留字段");
                safe(v[k]);
            }
    };
    safe(s);
    check(obj(s) && s.schemaVersion === 1, "不支持的背词数据版本");
    check(typeof s.contentVersion === "string" &&
        s.contentVersion.length <= 100 &&
        integer(s.revision, 0, Number.MAX_SAFE_INTEGER - 1), "数据版本无效");
    check(obj(s.settings) && integer(s.settings.dailyNewLimit, 0, 100), "每日新词数须为 0–100 的整数");
    check(Array.isArray(s.settings.levels) &&
        s.settings.levels.length >= 1 &&
        s.settings.levels.length <= 4 &&
        new Set(s.settings.levels).size === s.settings.levels.length &&
        s.settings.levels.every((l) => engine_1.LEVELS.includes(l)) &&
        typeof s.settings.familiarHintSeen === "boolean", "等级设置无效");
    check(obj(s.progress) && Object.keys(s.progress).length <= 20000, "学习记录无效或过多");
    for (const key of Object.keys(s.progress)) {
        const p = s.progress[key];
        check(id(key) &&
            obj(p) &&
            ["learning", "review", "familiar"].includes(p.state) &&
            integer(p.stage, -1, 5), "词条学习状态无效");
        check(p.state === "familiar" ? p.due === undefined : date(p.due), "复习日期无效");
        check(p.state !== "review" || p.stage >= 0, "复习阶段无效");
        check((p.first === undefined || date(p.first)) &&
            (p.last === undefined || date(p.last)), "历史日期无效");
    }
    check(ids(s.favorites), "收藏数据无效");
    check(obj(s.daily) && Object.keys(s.daily).length <= 20000, "统计数据无效");
    for (const k of Object.keys(s.daily)) {
        const d = s.daily[k];
        check(date(k) &&
            obj(d) &&
            ids(d.newIds) &&
            ids(d.reviewIds) &&
            ["attempts", "spellingAttempts", "spellingCorrect"].every((n) => integer(d[n], 0, 1000000)) &&
            d.spellingCorrect <= d.spellingAttempts &&
            Array.isArray(d.spellingIds) &&
            d.spellingIds.length <= 1000 &&
            d.spellingIds.every(attemptId) &&
            new Set(d.spellingIds).size === d.spellingIds.length, "每日统计无效");
    }
    check(Array.isArray(s.events) && s.events.length <= 1000, "复习日志过多");
    const eventIds = new Set();
    for (const e of s.events) {
        check(obj(e) &&
            attemptId(e.id) &&
            !eventIds.has(e.id) &&
            id(e.entryId) &&
            date(e.day) &&
            ["unknown", "fuzzy", "known"].includes(e.rating) &&
            ["new", "review", "retry"].includes(e.mode), "复习日志无效");
        eventIds.add(e.id);
    }
    if (s.session !== undefined) {
        const q = s.session;
        check(obj(q) &&
            date(q.day) &&
            Array.isArray(q.queue) &&
            q.queue.length <= 20000 &&
            obj(q.retries) &&
            ids(q.failed), "学习会话无效");
        const seen = new Set(), words = new Set();
        for (const a of q.queue) {
            check(obj(a) &&
                id(a.entryId) &&
                attemptId(a.id) &&
                !seen.has(a.id) &&
                !eventIds.has(a.id) &&
                !words.has(a.entryId) &&
                ["new", "review", "retry"].includes(a.mode), "学习队列重复或无效");
            seen.add(a.id);
            words.add(a.entryId);
        }
        for (const k of Object.keys(q.retries))
            check(id(k) && integer(q.retries[k], 0, 2), "重试次数无效");
    }
    return s;
}
function read() {
    const raw = wx.getStorageSync(exports.KEY);
    return raw === "" || raw === undefined ? (0, engine_1.empty)() : validate(raw);
}
function write(next, expectedRevision) {
    const current = read();
    if (expectedRevision !== undefined && current.revision !== expectedRevision)
        throw new Error("学习数据已变化，请刷新后重试");
    const n = (0, engine_1.clone)(next);
    n.revision = current.revision + 1;
    const checked = validate(n);
    wx.setStorageSync(exports.KEY, checked);
    return checked;
}
function change(fn) {
    const s = read();
    return write(fn(s), s.revision);
}
function backup(s = read()) {
    return JSON.stringify({
        kind: "xiaojiao-vocabulary",
        backupVersion: 1,
        exportedAt: new Date().toISOString(),
        store: s,
    });
}
function parseBackup(text) {
    check(bytes(text) <= MAX, "备份不得超过 5 MiB");
    const b = JSON.parse(text);
    check(obj(b) && b.kind === "xiaojiao-vocabulary" && b.backupVersion === 1, "不是支持的背词备份");
    return validate(b.store);
}
// Recovery intentionally does not read damaged current data; invoked only after explicit confirmation.
function restore(s) {
    const n = validate(s);
    n.revision = Date.now();
    wx.setStorageSync(exports.KEY, n);
}
function raw() {
    return JSON.stringify(wx.getStorageSync(exports.KEY) || null);
}
function clear() {
    wx.removeStorageSync(exports.KEY);
}
function error(e) {
    wx.showModal({
        title: "未能完成",
        content: e instanceof Error ? e.message : "操作失败，请重试",
        showCancel: false,
    });
}
