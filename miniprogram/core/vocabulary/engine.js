"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEVEL_NAMES = exports.LEVELS = exports.INTERVALS = exports.VERSION = void 0;
exports.today = today;
exports.addDays = addDays;
exports.empty = empty;
exports.clone = clone;
exports.uid = uid;
exports.dayStats = dayStats;
exports.queue = queue;
exports.rate = rate;
exports.familiar = familiar;
exports.relearn = relearn;
exports.favorite = favorite;
exports.spelling = spelling;
exports.summary = summary;
exports.VERSION = "oewn-2025-v1";
exports.INTERVALS = [1, 3, 7, 14, 30, 60];
exports.LEVELS = ["L1", "L2", "L3", "L4"];
exports.LEVEL_NAMES = [
    "基础 · 小学初中常见",
    "高中衔接",
    "大学与雅思核心",
    "雅思高阶",
];
function today(now = Date.now()) {
    return new Date(now + 8 * 3600000).toISOString().slice(0, 10);
}
function addDays(day, n) {
    return new Date(Date.parse(day + "T00:00:00Z") + n * 86400000)
        .toISOString()
        .slice(0, 10);
}
function empty() {
    return {
        schemaVersion: 1,
        contentVersion: exports.VERSION,
        revision: 0,
        settings: { dailyNewLimit: 20, levels: ["L1"], familiarHintSeen: false },
        progress: {},
        favorites: [],
        daily: {},
        events: [],
    };
}
function clone(s) {
    return JSON.parse(JSON.stringify(s));
}
function uid() {
    return (Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12));
}
function dayStats(s, day) {
    return (s.daily[day] || {
        newIds: [],
        reviewIds: [],
        attempts: 0,
        spellingAttempts: 0,
        spellingCorrect: 0,
        spellingIds: [],
    });
}
function attempt(entryId, mode) {
    return { id: uid(), entryId, mode };
}
function queue(s, index, day = today()) {
    const n = clone(s), available = new Set(index.map((e) => e.id));
    const old = n.session && n.session.day === day
        ? n.session
        : { day, queue: [], retries: {}, failed: [] };
    const done = dayStats(n, day);
    const due = index
        .filter((e) => {
        const p = n.progress[e.id];
        return p && p.state !== "familiar" && p.due && p.due <= day;
    })
        .sort((a, b) => (n.progress[a.id].due || "").localeCompare(n.progress[b.id].due || "") || a.id.localeCompare(b.id));
    const limit = Math.max(0, n.settings.dailyNewLimit - done.newIds.length);
    const eligible = (e) => !n.progress[e.id] &&
        n.settings.levels.includes(e.level) &&
        !done.newIds.includes(e.id);
    const eligibleIds = new Set(index.filter(eligible).map((e) => e.id));
    let newCount = 0;
    // Preserve the exact interleaving on resume, including three-card retry spacing.
    const pending = old.queue.filter((a) => {
        if (a.mode === "new") {
            if (!eligibleIds.has(a.entryId) || newCount >= limit)
                return false;
            newCount++;
            return true;
        }
        const p = n.progress[a.entryId];
        return (available.has(a.entryId) &&
            p &&
            p.state !== "familiar" &&
            (a.mode === "retry" || (!!p.due && p.due <= day)));
    });
    const seen = new Set(pending.map((a) => a.entryId));
    const combined = due
        .filter((e) => !seen.has(e.id))
        .map((e) => attempt(e.id, "review"))
        .concat(pending);
    for (const e of index)
        if (newCount < limit && eligibleIds.has(e.id) && !seen.has(e.id)) {
            combined.push(attempt(e.id, "new"));
            seen.add(e.id);
            newCount++;
        }
    n.session = Object.assign(Object.assign({}, old), { day, queue: combined });
    return n;
}
function rate(s, attemptId, rating, day = today()) {
    var _a;
    if (!["unknown", "fuzzy", "known"].includes(rating))
        throw new Error("无效的记忆反馈");
    if (!s.session || s.session.day !== day)
        throw new Error("日期已变化，请重新进入学习");
    const a = s.session.queue[0];
    if (!a || a.id !== attemptId || s.events.some((e) => e.id === attemptId))
        throw new Error("这次回答已处理，请刷新词卡");
    if (((_a = s.progress[a.entryId]) === null || _a === void 0 ? void 0 : _a.state) === "familiar")
        throw new Error("该词已加入熟词本");
    const n = clone(s), session = n.session;
    session.queue.shift();
    const d = (n.daily[day] = dayStats(n, day));
    if (a.mode === "new" && !d.newIds.includes(a.entryId))
        d.newIds.push(a.entryId);
    if (a.mode !== "new" && !d.reviewIds.includes(a.entryId))
        d.reviewIds.push(a.entryId);
    d.attempts++;
    const p = n.progress[a.entryId] || {
        state: "learning",
        stage: -1,
        first: day,
    };
    const failed = session.failed.includes(a.entryId);
    if (rating === "unknown") {
        p.stage = -1;
        p.state = "learning";
        p.due = addDays(day, 1);
        if (!failed)
            session.failed.push(a.entryId);
        const count = session.retries[a.entryId] || 0;
        if (count < 2) {
            session.retries[a.entryId] = count + 1;
            session.queue.splice(Math.min(3, session.queue.length), 0, attempt(a.entryId, "retry"));
        }
    }
    else if (rating === "fuzzy" || failed) {
        p.state = "learning";
        p.due = addDays(day, 1);
    }
    else {
        p.stage = Math.min(5, p.stage + 1);
        p.state = "review";
        p.due = addDays(day, exports.INTERVALS[p.stage]);
    }
    p.last = day;
    n.progress[a.entryId] = p;
    n.events.push({ id: a.id, entryId: a.entryId, day, rating, mode: a.mode });
    n.events = n.events.slice(-1000);
    return n;
}
function familiar(s, id) {
    const n = clone(s), p = n.progress[id];
    n.progress[id] = Object.assign(Object.assign({}, (p || { stage: -1 })), { state: "familiar" });
    delete n.progress[id].due;
    if (n.session)
        n.session.queue = n.session.queue.filter((a) => a.entryId !== id);
    n.settings.familiarHintSeen = true;
    return n;
}
function relearn(s, id, day = today()) {
    const n = clone(s);
    n.progress[id] = Object.assign(Object.assign({}, n.progress[id]), { state: "learning", stage: -1, due: day });
    if (n.session) {
        n.session.queue = n.session.queue.filter((a) => a.entryId !== id);
        n.session.failed = n.session.failed.filter((x) => x !== id);
        delete n.session.retries[id];
    }
    return n;
}
function favorite(s, id) {
    const n = clone(s);
    n.favorites = n.favorites.includes(id)
        ? n.favorites.filter((x) => x !== id)
        : n.favorites.concat(id);
    return n;
}
function spelling(answer, word, variants) {
    const norm = (x) => x.trim().toLowerCase().replace(/\s+/g, " ");
    return [word, ...variants].some((x) => norm(x) === norm(answer));
}
function summary(s, index, day = today()) {
    const ids = new Set(index.map((e) => e.id)), values = Object.keys(s.progress);
    return {
        total: index.length,
        familiar: values.filter((id) => s.progress[id].state === "familiar" && ids.has(id)).length,
        learned: values.filter((id) => s.progress[id].state !== "familiar" && ids.has(id)).length,
        due: values.filter((id) => ids.has(id) &&
            s.progress[id].state !== "familiar" &&
            (s.progress[id].due || "9999") <= day).length,
        unavailable: values.filter((id) => !ids.has(id)).length,
        daily: dayStats(s, day),
    };
}
