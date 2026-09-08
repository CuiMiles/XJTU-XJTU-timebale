"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const calendar_1 = require("../../core/calendar");
const engine_1 = require("../../core/engine");
const storage_1 = require("../../core/storage");
Page({
    data: {
        week: 1,
        weeks: Array.from({ length: 18 }, (_, i) => `第${i + 1}周${i >= 16 ? " · 考试" : ""}`),
        days: [],
        rows: [],
        cards: [],
        empty: true,
        noClasses: false,
        status: "",
        loadError: false,
        todayLabel: "",
        month: "",
        detail: null,
        selection: [],
    },
    touchOrigin: null,
    suppressTapUntil: 0,
    onLoad() {
        this.setData({ week: Math.max(1, Math.min(18, (0, calendar_1.weekOf)((0, calendar_1.today)()))) });
    },
    onShow() {
        this.refresh();
    },
    refresh() {
        try {
            const s = (0, storage_1.read)(), w = this.data.week, currentDate = (0, calendar_1.today)(), actual = (0, calendar_1.weekOf)(currentDate);
            const days = calendar_1.DAYS.map((d, i) => {
                const date = (0, calendar_1.dateOf)(w, i + 1);
                return {
                    name: d,
                    date,
                    label: (0, calendar_1.shortDate)(date),
                    today: date === currentDate,
                    holiday: calendar_1.HOLIDAYS.includes(date),
                };
            });
            const items = (0, engine_1.schedule)(s, w);
            this.setData({
                detail: null,
                selection: [],
                loadError: false,
                empty: s.courses.length === 0,
                noClasses: items.length === 0,
                days,
                rows: (0, calendar_1.times)((0, calendar_1.dateOf)(w, 1)).map((t, i) => ({
                    n: i + 1,
                    start: t.split("-")[0],
                    end: t.split("-")[1],
                })),
                cards: (0, engine_1.blocks)(items).map((b) => (Object.assign(Object.assign({}, b), { day: days.findIndex((d) => d.date === b.o.date), id: b.o.course.id, original: b.o.originalDate, name: b.o.course.name, room: b.o.room }))),
                status: w === actual ? "本周" : "非本周",
                todayLabel: `今天周${calendar_1.DAYS[(0, calendar_1.weekdayOf)(currentDate) - 1]}`,
                month: `${Number((0, calendar_1.dateOf)(w, 1).slice(5, 7))}月`,
            });
        }
        catch (e) {
            this.setData({ loadError: true });
            (0, storage_1.error)(e);
        }
    },
    prev() {
        if (this.data.week > 1) {
            this.setData({ week: this.data.week - 1 });
            this.refresh();
        }
    },
    next() {
        if (this.data.week < 18) {
            this.setData({ week: this.data.week + 1 });
            this.refresh();
        }
    },
    pick(e) {
        this.setData({ week: Number(e.detail.value) + 1 });
        this.refresh();
    },
    current() {
        this.setData({ week: Math.max(1, Math.min(18, (0, calendar_1.weekOf)((0, calendar_1.today)()))) });
        this.refresh();
    },
    touchStart(e) {
        this.touchOrigin =
            e.touches.length === 1
                ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
                : null;
    },
    touchCancel() {
        this.touchOrigin = null;
    },
    touchEnd(e) {
        const start = this.touchOrigin;
        this.touchOrigin = null;
        if (!start ||
            !e.changedTouches.length ||
            this.data.detail ||
            this.data.selection.length)
            return;
        const dx = e.changedTouches[0].clientX - start.x;
        const dy = e.changedTouches[0].clientY - start.y;
        // 明确的横向手势才切周，保留纵向滚动与轻点。
        if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
            this.suppressTapUntil = Date.now() + 350;
            if (dx < 0)
                this.next();
            else
                this.prev();
        }
    },
    open(e) {
        if (Date.now() < this.suppressTapUntil)
            return;
        const b = this.data.cards[Number(e.currentTarget.dataset.index)];
        const options = this.data.cards.filter((x) => x.day === b.day && x.start <= b.end && x.end >= b.start);
        const unique = options.filter((x, i) => options.findIndex((y) => y.id === x.id && y.original === x.original) === i);
        if (unique.length > 1)
            this.setData({ selection: unique });
        else
            this.go(b);
    },
    go(b) {
        this.setData({
            detail: Object.assign(Object.assign({}, b.o), { day: calendar_1.DAYS[(0, calendar_1.weekdayOf)(b.o.date) - 1], time: (0, calendar_1.timeLabel)(b.o.date, b.o.sections), weeks: b.o.course.weeks.join("、") }),
        });
    },
    choose(e) {
        this.go(this.data.selection[Number(e.currentTarget.dataset.index)]);
        this.close();
    },
    close() {
        this.setData({ selection: [] });
    },
    closeDetail() {
        this.setData({ detail: null });
    },
    adjustDetail() {
        const d = this.data.detail;
        wx.navigateTo({
            url: `/pages/detail/detail?id=${encodeURIComponent(d.course.id)}&date=${d.originalDate}&adjust=1`,
        });
    },
    noop() { },
    import() {
        wx.navigateTo({ url: "/pages/transfer/transfer" });
    },
    add() {
        wx.navigateTo({ url: "/pages/editor/editor" });
    },
    manage() {
        wx.switchTab({ url: "/pages/manage/manage" });
    },
});
