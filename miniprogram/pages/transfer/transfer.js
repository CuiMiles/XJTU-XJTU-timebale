"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const validation_1 = require("../../core/validation");
const storage_1 = require("../../core/storage");
const prompt_1 = require("../../core/prompt");
const calendar_1 = require("../../core/calendar");
let preview = null;
Page({
    data: {
        mode: "import",
        text: "",
        prompt: prompt_1.PROMPT,
        preview: false,
        rows: [],
        count: 0,
        adjustmentCount: 0,
        message: "",
        exportText: "",
    },
    onLoad(q) {
        preview = null;
        this.setData({ mode: q.mode === "backup" ? "backup" : "import" });
    },
    mode(e) {
        preview = null;
        this.setData({
            mode: e.currentTarget.dataset.mode,
            preview: false,
            message: "",
            exportText: "",
        });
    },
    input(e) {
        preview = null;
        this.setData({ text: e.detail.value, preview: false, message: "" });
    },
    copyPrompt() {
        wx.setClipboardData({ data: prompt_1.PROMPT });
    },
    example() {
        preview = null;
        this.setData({
            text: JSON.stringify(prompt_1.EXAMPLE, null, 2),
            preview: false,
            message: "",
        });
    },
    validate() {
        try {
            preview = (0, validation_1.parse)(this.data.text, this.data.mode === "backup");
            this.setData({
                preview: true,
                count: preview.courses.length,
                adjustmentCount: preview.adjustments.length,
                rows: preview.courses.map((c) => ({
                    name: c.name,
                    room: c.room,
                    day: calendar_1.DAYS[c.weekday - 1],
                    sections: c.sections.join("、"),
                    weeks: c.weeks.join("、"),
                })),
                message: "",
            });
        }
        catch (e) {
            preview = null;
            this.setData({
                preview: false,
                message: e instanceof Error ? e.message : "校验失败",
            });
        }
    },
    async confirm() {
        if (!preview)
            return;
        try {
            const isBackup = this.data.mode === "backup";
            const r = await wx.showModal({
                title: isBackup ? "恢复完整备份？" : "确认替换课表？",
                content: isBackup
                    ? "当前课程和所有调课记录将替换为预览中的备份。"
                    : "当前课程和所有调课记录将被替换。建议先导出备份。",
                confirmText: "确认替换",
            });
            if (!r.confirm || !preview)
                return;
            const s = Object.assign(Object.assign({}, preview), { courses: preview.courses.map((c) => (Object.assign(Object.assign({}, c), { id: isBackup ? c.id : (0, storage_1.id)() }))) });
            (0, storage_1.write)(s);
            preview = null;
            this.setData({
                preview: false,
                message: "已保存到本机，可返回课表查看。",
            });
            wx.showToast({ title: "保存成功" });
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    export() {
        try {
            const data = JSON.stringify(Object.assign(Object.assign({}, (0, storage_1.read)()), { backupVersion: 1 }), null, 2);
            this.setData({ exportText: data });
            wx.setClipboardData({
                data,
                fail: () => (0, storage_1.error)(new Error("复制失败，可长按下方备份文本复制")),
            });
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    file() {
        try {
            const data = JSON.stringify(Object.assign(Object.assign({}, (0, storage_1.read)()), { backupVersion: 1 }), null, 2);
            const path = wx.env.USER_DATA_PATH + "/xiaojiao-2026-fall-backup.json";
            wx.getFileSystemManager().writeFile({
                filePath: path,
                data,
                encoding: "utf8",
                success: () => {
                    if (wx.canIUse("shareFileMessage"))
                        wx.shareFileMessage({
                            filePath: path,
                            fileName: "xiaojiao-2026-fall-backup.json",
                            fail: () => (0, storage_1.error)(new Error("文件分享未完成，可使用复制JSON备份")),
                        });
                    else
                        (0, storage_1.error)(new Error("当前环境不支持分享文件，请复制JSON保存"));
                },
                fail: () => (0, storage_1.error)(new Error("备份文件写入失败，请复制JSON保存")),
            });
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
});
