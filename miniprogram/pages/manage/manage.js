"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const storage_1 = require("../../core/storage");
const calendar_1 = require("../../core/calendar");
Page({
    data: { courses: [], adjustments: [], broken: false },
    onShow() {
        try {
            const s = (0, storage_1.read)();
            this.setData({
                broken: false,
                courses: s.courses.map((c) => (Object.assign(Object.assign({}, c), { day: calendar_1.DAYS[c.weekday - 1], weekText: c.weeks.join("、"), sectionText: c.sections.join("、"), weekChoices: c.weeks.map((w) => "第" + w + "周 · " + (0, calendar_1.dateOf)(w, c.weekday)) }))),
                adjustments: s.adjustments.map((a) => (Object.assign(Object.assign({}, a), { key: a.courseId + "@" + a.originalDate, name: s.courses.find((c) => c.id === a.courseId).name }))),
            });
        }
        catch (e) {
            this.setData({ broken: true, courses: [], adjustments: [] });
            (0, storage_1.error)(e);
        }
    },
    add() {
        wx.navigateTo({ url: "/pages/editor/editor" });
    },
    edit(e) {
        wx.navigateTo({
            url: "/pages/editor/editor?id=" +
                encodeURIComponent(e.currentTarget.dataset.id),
        });
    },
    transfer(e) {
        wx.navigateTo({
            url: "/pages/transfer/transfer?mode=" + e.currentTarget.dataset.mode,
        });
    },
    viewOnce(e) {
        const c = this.data.courses[Number(e.currentTarget.dataset.index)];
        wx.navigateTo({
            url: "/pages/detail/detail?id=" +
                encodeURIComponent(c.id) +
                "&date=" +
                (0, calendar_1.dateOf)(c.weeks[Number(e.detail.value)], c.weekday),
        });
    },
    async remove(e) {
        const id = e.currentTarget.dataset.id;
        const r = await wx.showModal({
            title: "删除课程？",
            content: "这门课程及其所有单次调整将被删除。",
        });
        if (!r.confirm)
            return;
        try {
            const s = (0, storage_1.read)();
            s.courses = s.courses.filter((c) => c.id !== id);
            s.adjustments = s.adjustments.filter((a) => a.courseId !== id);
            (0, storage_1.write)(s);
            this.onShow();
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    async restore(e) {
        const r = await wx.showModal({
            title: "恢复原安排？",
            content: "撤销这一次调整；若原日期是停课日，课表仍不显示该次课程。",
        });
        if (!r.confirm)
            return;
        try {
            const a = this.data.adjustments[Number(e.currentTarget.dataset.index)];
            const s = (0, storage_1.read)();
            s.adjustments = s.adjustments.filter((x) => !(x.courseId === a.courseId && x.originalDate === a.originalDate));
            (0, storage_1.write)(s);
            this.onShow();
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    async clearAll() {
        const a = await wx.showModal({
            title: "清空本机全部课表？",
            content: "包括课程和单次调课，建议先导出完整备份。",
            confirmText: "继续",
            confirmColor: "#ae5252",
        });
        if (!a.confirm)
            return;
        const b = await wx.showModal({
            title: "最后确认",
            content: "清空后无法撤销。确定删除全部本地课表数据？",
            confirmText: "确认清空",
            confirmColor: "#ae5252",
        });
        if (b.confirm)
            try {
                (0, storage_1.clear)();
                this.onShow();
            }
            catch (e) {
                (0, storage_1.error)(e);
            }
    },
    raw() {
        try {
            wx.setClipboardData({
                data: (0, storage_1.backupRaw)(),
                fail: () => (0, storage_1.error)(new Error("复制失败")),
            });
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
});
