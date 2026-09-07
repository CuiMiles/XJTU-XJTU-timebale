"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const storage_1 = require("../../core/storage");
const engine_1 = require("../../core/engine");
const calendar_1 = require("../../core/calendar");
const validation_1 = require("../../core/validation");
Page({
    data: {
        id: "",
        original: "",
        o: null,
        day: "",
        time: "",
        weekText: "",
        holiday: false,
        adjusting: false,
        targetDate: "",
        targetSections: "",
        targetRoom: "",
        min: (0, calendar_1.dateOf)(1, 1),
        max: (0, calendar_1.dateOf)(18, 7),
    },
    onLoad(q) {
        this.setData({
            id: q.id || "",
            original: q.date || "",
            adjusting: q.adjust === "1",
        });
    },
    onShow() {
        this.refresh();
    },
    refresh() {
        try {
            const o = (0, engine_1.occurrence)((0, storage_1.read)(), this.data.id, this.data.original);
            if (!o)
                throw new Error("课程不存在，请返回课表");
            this.setData({
                o,
                holiday: !o.adjusted && calendar_1.HOLIDAYS.includes(o.date),
                day: calendar_1.DAYS[(0, calendar_1.weekdayOf)(o.date) - 1],
                time: (0, calendar_1.timeLabel)(o.date, o.sections),
                weekText: o.course.weeks.join("、"),
                targetDate: o.date,
                targetSections: o.sections.join(","),
                targetRoom: o.room,
            });
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    adjust() {
        this.setData({ adjusting: true });
    },
    close() {
        this.setData({ adjusting: false });
    },
    date(e) {
        this.setData({ targetDate: e.detail.value });
    },
    input(e) {
        this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
    },
    async save(e) {
        try {
            const cancelled = e.currentTarget.dataset.cancel === "yes";
            const sections = (0, validation_1.parseList)(this.data.targetSections, 11, "节次");
            if (!cancelled && calendar_1.HOLIDAYS.includes(this.data.targetDate)) {
                const r = await wx.showModal({
                    title: "目标是校历停课日",
                    content: "这是显式单次调课，确认后仍会显示在该日。是否继续？",
                });
                if (!r.confirm)
                    return;
            }
            if (cancelled) {
                const r = await wx.showModal({
                    title: "取消本次课程？",
                    content: "仅取消原日期 " +
                        this.data.original +
                        " 这一次，其他周保持原安排。",
                });
                if (!r.confirm)
                    return;
            }
            const s = (0, storage_1.read)();
            s.adjustments = s.adjustments.filter((a) => !(a.courseId === this.data.id && a.originalDate === this.data.original));
            s.adjustments.push({
                courseId: this.data.id,
                originalDate: this.data.original,
                cancelled,
                date: this.data.targetDate,
                sections,
                room: this.data.targetRoom,
            });
            (0, storage_1.write)(s);
            this.setData({ adjusting: false });
            this.refresh();
            wx.showToast({ title: cancelled ? "本次已取消" : "本次已调整" });
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    async restore() {
        const r = await wx.showModal({
            title: "恢复原安排？",
            content: "仅撤销本次调整，校历停课规则仍然生效。",
        });
        if (!r.confirm)
            return;
        try {
            const s = (0, storage_1.read)();
            s.adjustments = s.adjustments.filter((a) => !(a.courseId === this.data.id && a.originalDate === this.data.original));
            (0, storage_1.write)(s);
            this.setData({ adjusting: false });
            this.refresh();
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    edit() {
        wx.navigateTo({
            url: "/pages/editor/editor?id=" + encodeURIComponent(this.data.id),
        });
    },
});
