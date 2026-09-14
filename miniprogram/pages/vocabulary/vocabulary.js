"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const content_1 = require("../../core/vocabulary/content");
const storage_1 = require("../../core/vocabulary/storage");
const engine_1 = require("../../core/vocabulary/engine");
Page({
    data: {
        stats: null,
        loadError: "",
        manifest: content_1.manifest,
        levels: engine_1.LEVELS.map((id, i) => ({
            id,
            name: engine_1.LEVEL_NAMES[i],
            count: content_1.index.filter((e) => e.level === id).length,
        })),
    },
    onShow() {
        try {
            this.setData({ stats: (0, engine_1.summary)((0, storage_1.read)(), content_1.index), loadError: "" });
        }
        catch (e) {
            this.setData({ loadError: e instanceof Error ? e.message : "读取失败" });
        }
    },
    start() {
        wx.navigateTo({ url: "/vocabulary/pages/study/study" });
    },
    library(e) {
        wx.navigateTo({
            url: "/vocabulary/pages/library/library?level=" +
                (e.currentTarget.dataset.level || ""),
        });
    },
    list(e) {
        wx.navigateTo({
            url: "/vocabulary/pages/library/library?filter=" +
                e.currentTarget.dataset.filter,
        });
    },
    settings() {
        wx.navigateTo({ url: "/vocabulary/pages/settings/settings" });
    },
});
