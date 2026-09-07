"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const storage_1 = require("../../core/storage");
const validation_1 = require("../../core/validation");
const calendar_1 = require("../../core/calendar");
Page({
    data: {
        id: "",
        name: "",
        className: "",
        teachers: "",
        room: "",
        note: "",
        weekday: 1,
        days: calendar_1.DAYS.map((d) => "星期" + d),
        sections: [],
        weeks: [],
        sectionOptions: [],
        weekOptions: [],
    },
    onLoad(q) {
        try {
            if (q.id) {
                const c = (0, storage_1.read)().courses.find((c) => c.id === q.id);
                if (!c)
                    throw new Error("课程不存在");
                this.setData(Object.assign(Object.assign({}, c), { teachers: c.teachers.join("、") }));
            }
            else
                this.setData({
                    weeks: Array.from({ length: 16 }, (_, i) => i + 1),
                    sections: [1, 2],
                });
            this.options();
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
    options() {
        this.setData({
            sectionOptions: Array.from({ length: 11 }, (_, i) => ({
                n: i + 1,
                selected: this.data.sections.includes(i + 1),
            })),
            weekOptions: Array.from({ length: 18 }, (_, i) => ({
                n: i + 1,
                selected: this.data.weeks.includes(i + 1),
            })),
        });
    },
    input(e) {
        this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
    },
    day(e) {
        this.setData({ weekday: Number(e.detail.value) + 1 });
    },
    toggle(e) {
        const key = e.currentTarget.dataset.field, n = Number(e.currentTarget.dataset.n), arr = this.data[key];
        this.setData({
            [key]: arr.includes(n)
                ? arr.filter((x) => x !== n)
                : [...arr, n].sort((a, b) => a - b),
        });
        this.options();
    },
    preset(e) {
        const mode = e.currentTarget.dataset.mode;
        this.setData({
            weeks: Array.from({ length: 16 }, (_, i) => i + 1).filter((n) => mode === "all" || (mode === "odd" ? n % 2 === 1 : n % 2 === 0)),
        });
        this.options();
    },
    async save() {
        try {
            const d = this.data;
            const c = (0, validation_1.course)(Object.assign(Object.assign({}, d), { id: d.id || (0, storage_1.id)(), teachers: d.teachers
                    .split(/[、,，]/)
                    .map((x) => x.trim())
                    .filter(Boolean) }));
            const s = (0, storage_1.read)();
            if (d.id) {
                if (!s.courses.some((x) => x.id === d.id))
                    throw new Error("课程已不存在，请返回管理页");
                const has = s.adjustments.some((a) => a.courseId === d.id);
                if (has) {
                    const r = await wx.showModal({
                        title: "更新基础课程",
                        content: "保存将清除这门课的所有单次调整。是否继续？",
                    });
                    if (!r.confirm)
                        return;
                }
                s.courses = s.courses.map((x) => (x.id === d.id ? c : x));
                s.adjustments = s.adjustments.filter((a) => a.courseId !== d.id);
            }
            else {
                s.courses.push(c);
            }
            (0, storage_1.write)(s);
            wx.showToast({ title: "已保存" });
            wx.navigateBack();
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
});
