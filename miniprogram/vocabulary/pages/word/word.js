"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const content_1 = require("../../../core/vocabulary/content");
const storage_1 = require("../../../core/vocabulary/storage");
const page_actions_1 = require("../../../core/vocabulary/page-actions");
Page(Object.assign(Object.assign({ data: Object.assign(Object.assign({}, page_actions_1.lookupData), { entry: null, favorite: false, familiar: false, loading: true, loadError: "", undoAvailable: false }) }, page_actions_1.lookupMethods), { onLoad(q) {
        this._id = q.id;
        this.refresh();
    },
    onUnload() {
        this._epoch = (this._epoch || 0) + 1;
        this.closeLookup();
    },
    async refresh() {
        var _a;
        const key = (this._epoch = (this._epoch || 0) + 1);
        this.setData({ loading: true, loadError: "" });
        try {
            if (!(0, content_1.metadata)(this._id))
                throw new Error("当前词库未收录此词");
            const e = await (0, content_1.getEntry)(this._id);
            if (key !== this._epoch)
                return;
            const s = (0, storage_1.read)();
            this.setData({
                entry: e,
                familiar: ((_a = s.progress[e.id]) === null || _a === void 0 ? void 0 : _a.state) === "familiar",
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
    async known() {
        if (this._busy)
            return;
        this._busy = true;
        try {
            const undo = await (0, page_actions_1.markKnown)(this._id);
            if (undo) {
                this._undo = undo;
                this.setData({ undoAvailable: true });
                await this.refresh();
            }
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
        finally {
            this._busy = false;
        }
    },
    undo() {
        try {
            if (!this._undo)
                return;
            (0, storage_1.write)(this._undo.before, this._undo.revision);
            this._undo = null;
            this.setData({ undoAvailable: false });
            this.refresh();
        }
        catch (e) {
            this.setData({ undoAvailable: false });
            (0, storage_1.error)(e);
        }
    } }));
