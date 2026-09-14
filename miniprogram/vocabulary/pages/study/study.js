"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const content_1 = require("../../../core/vocabulary/content");
const storage_1 = require("../../../core/vocabulary/storage");
const engine_1 = require("../../../core/vocabulary/engine");
const page_actions_1 = require("../../../core/vocabulary/page-actions");
Page(Object.assign(Object.assign({ data: Object.assign(Object.assign({}, page_actions_1.lookupData), { entry: null, prompt: "", headword: "", loading: true, loadError: "", answer: false, done: false, remaining: 0, mode: "", favorite: false, stats: null, spellingMode: false, spellingText: "", spellingResult: "", undoAvailable: false, busy: false }) }, page_actions_1.lookupMethods), { onLoad() {
        this._loaded = true;
        this.initialize();
    },
    onShow() {
        if (this._shown)
            this.initialize();
        this._shown = true;
    },
    onUnload() {
        this._epoch = (this._epoch || 0) + 1;
        this.closeLookup();
    },
    initialize() {
        try {
            (0, storage_1.change)((s) => (0, engine_1.queue)(s, content_1.index));
            this.render();
        }
        catch (e) {
            this.setData({
                loading: false,
                loadError: e instanceof Error ? e.message : "读取失败",
            });
        }
    },
    async render() {
        var _a;
        const key = (this._epoch = (this._epoch || 0) + 1);
        this.closeLookup();
        this._senseId = "";
        this._entry = null;
        this.setData({
            loading: true,
            loadError: "",
            entry: null,
            prompt: "",
            headword: "",
            answer: false,
            spellingText: "",
            spellingResult: "",
        });
        try {
            const s = (0, storage_1.read)();
            if (((_a = s.session) === null || _a === void 0 ? void 0 : _a.day) !== (0, engine_1.today)()) {
                this.initialize();
                return;
            }
            const a = s.session.queue[0];
            this._attempt = a;
            this._spellingRecorded =
                !!a && (0, engine_1.dayStats)(s, (0, engine_1.today)()).spellingIds.includes(a.id);
            if (!a) {
                this.setData({ done: true, stats: (0, engine_1.summary)(s, content_1.index), remaining: 0 });
                return;
            }
            const e = await (0, content_1.getEntry)(a.entryId);
            if (key !== this._epoch)
                return;
            this._entry = e;
            const selected = e.deep
                ? e.senses.find((x) => x.id === e.deep.senseId) || e.senses[0]
                : e.senses[0];
            const reveal = a.mode === "new" && !this.data.spellingMode;
            this.setData({
                done: false,
                entry: reveal ? e : null,
                headword: e.word,
                prompt: selected.definition,
                answer: reveal,
                remaining: s.session.queue.length,
                mode: a.mode === "new"
                    ? "新词"
                    : a.mode === "retry"
                        ? "再试一次"
                        : "到期复习",
                favorite: s.favorites.includes(e.id),
            });
        }
        catch (e) {
            if (key === this._epoch)
                this.setData({
                    loadError: e instanceof Error ? e.message : "加载失败",
                });
        }
        finally {
            if (key === this._epoch)
                this.setData({ loading: false });
        }
    },
    reveal() {
        if (this._entry)
            this.setData({ answer: true, entry: this._entry });
    },
    async known() {
        if (!this._entry || this.data.busy)
            return;
        this.setData({ busy: true });
        try {
            const undo = await (0, page_actions_1.markKnown)(this._entry.id);
            if (undo) {
                this._undo = undo;
                this.setData({ undoAvailable: true });
                (0, storage_1.change)((s) => (0, engine_1.queue)(s, content_1.index));
                this._undo.revision = (0, storage_1.read)().revision;
                await this.render();
            }
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
        finally {
            this.setData({ busy: false });
        }
    },
    undo() {
        try {
            if (!this._undo)
                return;
            (0, storage_1.write)(this._undo.before, this._undo.revision);
            this._undo = null;
            this.setData({ undoAvailable: false });
            this.render();
        }
        catch (e) {
            this.setData({ undoAvailable: false });
            (0, storage_1.error)(e);
        }
    },
    async rate(e) {
        if (!this._attempt || !this.data.answer || this.data.busy)
            return;
        this.setData({ busy: true });
        const id = this._attempt.id;
        try {
            (0, storage_1.change)((s) => (0, engine_1.rate)(s, id, e.currentTarget.dataset.rating));
            this._undo = null;
            this.setData({ undoAvailable: false });
            await this.render();
        }
        catch (e) {
            (0, storage_1.error)(e);
            this.initialize();
        }
        finally {
            this.setData({ busy: false });
        }
    },
    toggleSpelling() {
        this.setData({ spellingMode: !this.data.spellingMode });
        this.render();
    },
    spellingInput(e) {
        this.setData({ spellingText: e.detail.value });
    },
    checkSpelling() {
        if (!this._entry || !this._attempt || !this.data.spellingText.trim())
            return;
        if (this._spellingRecorded) {
            this.setData({
                spellingResult: "本张词卡的拼写已记录：" + this._entry.word,
            });
            this.reveal();
            return;
        }
        try {
            const ok = (0, engine_1.spelling)(this.data.spellingText, this._entry.word, this._entry.variants), attemptId = this._attempt.id;
            (0, storage_1.change)((s) => {
                var _a, _b;
                const day = (0, engine_1.today)();
                if (((_a = s.session) === null || _a === void 0 ? void 0 : _a.day) !== day || ((_b = s.session.queue[0]) === null || _b === void 0 ? void 0 : _b.id) !== attemptId)
                    throw new Error("学习队列已变化，请重新加载");
                const d = (s.daily[day] = (0, engine_1.dayStats)(s, day));
                if (d.spellingIds.includes(attemptId))
                    return s;
                d.spellingAttempts++;
                if (ok)
                    d.spellingCorrect++;
                d.spellingIds = d.spellingIds.concat(attemptId).slice(-1000);
                return s;
            });
            this._spellingRecorded = true;
            this.setData({
                spellingResult: ok ? "拼写正确" : "正确拼写：" + this._entry.word,
            });
            this.reveal();
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    finish() {
        wx.navigateBack();
    } }));
