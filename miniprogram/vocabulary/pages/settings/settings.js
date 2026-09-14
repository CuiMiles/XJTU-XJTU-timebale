"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const content_1 = require("../../../core/vocabulary/content");
const storage_1 = require("../../../core/vocabulary/storage");
const engine_1 = require("../../../core/vocabulary/engine");
Page({
    data: {
        limit: "20",
        levels: [],
        text: "",
        preview: "",
        message: "",
        output: "",
        loadError: "",
        downloading: false,
        downloadStatus: "",
        manifest: content_1.manifest,
        stats: null,
        recent: [],
    },
    onLoad() {
        this.refresh();
    },
    onUnload() {
        this._closed = true;
        this._preview = null;
    },
    refresh() {
        try {
            const s = (0, storage_1.read)();
            this.setData({
                limit: String(s.settings.dailyNewLimit),
                levels: engine_1.LEVELS.map((id, i) => ({
                    id,
                    name: engine_1.LEVEL_NAMES[i],
                    selected: s.settings.levels.includes(id),
                })),
                stats: (0, engine_1.summary)(s, content_1.index),
                recent: Object.keys(s.daily)
                    .sort()
                    .reverse()
                    .slice(0, 14)
                    .map((day) => (Object.assign({ day }, s.daily[day]))),
                loadError: "",
            });
        }
        catch (e) {
            this.setData({ loadError: e instanceof Error ? e.message : "读取失败" });
        }
    },
    limitInput(e) {
        this.setData({ limit: e.detail.value });
    },
    toggleLevel(e) {
        const id = e.currentTarget.dataset.id;
        this.setData({
            levels: this.data.levels.map((l) => (Object.assign(Object.assign({}, l), { selected: l.id === id ? !l.selected : l.selected }))),
        });
    },
    save() {
        try {
            if (!/^\d{1,3}$/.test(this.data.limit) || Number(this.data.limit) > 100)
                throw new Error("每日新词数须为 0–100 的整数");
            const levels = this.data.levels
                .filter((l) => l.selected)
                .map((l) => l.id);
            if (!levels.length)
                throw new Error("至少选择一个新词等级");
            (0, storage_1.change)((s) => {
                s.settings.dailyNewLimit = Number(this.data.limit);
                s.settings.levels = levels;
                return s;
            });
            this.setData({
                message: "设置已保存。等级仅影响新词，已学词仍按时复习。",
            });
            this.refresh();
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    async download() {
        if (this.data.downloading)
            return;
        this.setData({ downloading: true, downloadStatus: "准备词包…" });
        try {
            await (0, content_1.prepareAll)((done, total) => {
                if (!this._closed)
                    this.setData({ downloadStatus: `已准备 ${done} / ${total} 个词包` });
            });
            if (!this._closed)
                this.setData({
                    downloadStatus: "本次已全部加载。清缓存后可能需要重新联网加载。",
                });
        }
        catch (e) {
            if (!this._closed)
                this.setData({
                    downloadStatus: e instanceof Error ? e.message : "加载失败",
                });
        }
        finally {
            if (!this._closed)
                this.setData({ downloading: false });
        }
    },
    export() {
        try {
            const output = (0, storage_1.backup)();
            this.setData({ output });
            wx.setClipboardData({
                data: output,
                fail: () => (0, storage_1.error)(new Error("复制失败，可长按备份文本或使用文件分享")),
            });
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    exportRaw() {
        try {
            const output = (0, storage_1.raw)();
            this.setData({ output });
            wx.setClipboardData({ data: output });
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    file() {
        try {
            const data = (0, storage_1.backup)(), path = wx.env.USER_DATA_PATH + "/xiaojiao-vocabulary-backup.json";
            wx.getFileSystemManager().writeFile({
                filePath: path,
                data,
                encoding: "utf8",
                success: () => {
                    if (wx.canIUse("shareFileMessage"))
                        wx.shareFileMessage({
                            filePath: path,
                            fileName: "xiaojiao-vocabulary-backup.json",
                            fail: () => (0, storage_1.error)(new Error("分享未完成，请复制 JSON 保存")),
                        });
                    else
                        (0, storage_1.error)(new Error("当前环境不支持文件分享，请复制 JSON"));
                },
                fail: () => (0, storage_1.error)(new Error("文件写入失败")),
            });
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    input(e) {
        this._preview = null;
        this.setData({ text: e.detail.value, preview: "", message: "" });
    },
    validate() {
        try {
            const s = (0, storage_1.parseBackup)(this.data.text), stats = (0, engine_1.summary)(s, content_1.index);
            this._preview = s;
            this.setData({
                preview: `学习记录 ${Object.keys(s.progress).length} 条；熟词 ${stats.familiar}；收藏 ${s.favorites.length}；暂未收录 ${stats.unavailable}。恢复仅替换背词数据。`,
                message: "",
            });
        }
        catch (e) {
            this._preview = null;
            this.setData({
                preview: "",
                message: e instanceof Error ? e.message : "备份无效",
            });
        }
    },
    async confirm() {
        if (!this._preview || this._confirming)
            return;
        this._confirming = true;
        const candidate = this._preview;
        try {
            const r = await wx.showModal({
                title: "确认恢复背词备份？",
                content: this.data.preview + " 建议先导出当前数据。",
            });
            if (!r.confirm || this._preview !== candidate)
                return;
            (0, storage_1.restore)(candidate);
            this._preview = null;
            this.setData({
                preview: "",
                text: "",
                message: "背词备份已恢复，课表未改变。",
            });
            this.refresh();
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
        finally {
            this._confirming = false;
        }
    },
    async clear() {
        if (this._clearing)
            return;
        this._clearing = true;
        try {
            const first = await wx.showModal({
                title: "清空背词数据？",
                content: "将删除学习记录、熟词、收藏和设置。课表不受影响。请先备份。",
            });
            if (!first.confirm)
                return;
            const second = await wx.showModal({
                title: "最后确认",
                content: "清空后只能用你保存的备份恢复。",
                confirmText: "确认清空",
            });
            if (!second.confirm)
                return;
            (0, storage_1.clear)();
            this._preview = null;
            this.setData({ preview: "", text: "", message: "背词数据已清空。" });
            this.refresh();
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
        finally {
            this._clearing = false;
        }
    },
});
