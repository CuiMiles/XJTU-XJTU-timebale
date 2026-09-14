"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lookupMethods = exports.lookupData = void 0;
exports.markKnown = markKnown;
const content_1 = require("./content");
const storage_1 = require("./storage");
const engine_1 = require("./engine");
exports.lookupData = {
    lookupWord: "",
    lookupDefinition: "",
    lookupLoading: false,
};
exports.lookupMethods = {
    async lookup(event) {
        const word = String(event.detail.word || "").toLowerCase(), key = (this._lookupEpoch || 0) + 1;
        this._lookupEpoch = key;
        this.setData({
            lookupWord: word,
            lookupDefinition: "",
            lookupLoading: true,
        });
        try {
            const m = (0, content_1.search)(word).find((e) => e.word === word || e.variants.includes(word));
            if (!m)
                throw new Error("当前词库未收录此词");
            const e = await (0, content_1.getEntry)(m.id);
            if (key === this._lookupEpoch)
                this.setData({ lookupDefinition: e.senses[0].definition });
        }
        catch (e) {
            if (key === this._lookupEpoch)
                this.setData({
                    lookupDefinition: e instanceof Error ? e.message : "查词失败",
                });
        }
        finally {
            if (key === this._lookupEpoch)
                this.setData({ lookupLoading: false });
        }
    },
    closeLookup() {
        this._lookupEpoch = (this._lookupEpoch || 0) + 1;
        this.setData({ lookupWord: "", lookupDefinition: "" });
    },
    sense(e) {
        this._senseId = e.detail.senseId;
    },
    ask() {
        if (this.data.entry)
            wx.navigateTo({
                url: "/vocabulary/pages/ask/ask?id=" +
                    this.data.entry.id +
                    "&sense=" +
                    encodeURIComponent(this._senseId || ""),
            });
    },
    star() {
        try {
            const id = this.data.entry.id;
            const s = (0, storage_1.change)((s) => (0, engine_1.favorite)(s, id));
            this._undo = null;
            this.setData({
                favorite: s.favorites.includes(id),
                undoAvailable: false,
            });
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
};
async function markKnown(id) {
    var _a;
    const s = (0, storage_1.read)();
    if (((_a = s.progress[id]) === null || _a === void 0 ? void 0 : _a.state) === "familiar") {
        const after = (0, storage_1.write)((0, engine_1.relearn)(s, id), s.revision);
        return { before: s, revision: after.revision };
    }
    if (!s.settings.familiarHintSeen) {
        const r = await wx.showModal({
            title: "加入熟词本",
            content: "跳过这个单词的全部已收录词义，退出新词与复习队列。可在熟词本重新学习。",
        });
        if (!r.confirm)
            return null;
    }
    const fresh = (0, storage_1.read)();
    const after = (0, storage_1.write)((0, engine_1.familiar)(fresh, id), fresh.revision);
    return { before: fresh, revision: after.revision };
}
