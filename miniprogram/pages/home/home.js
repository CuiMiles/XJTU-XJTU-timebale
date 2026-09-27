"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const calendar_1 = require("../../core/calendar");
const engine_1 = require("../../core/engine");
const storage_1 = require("../../core/storage");
const ROW_HEIGHT = 96;
function shortName(name) {
    return name
        .replace(/（校企）|（实践）|（AI通识-线上）/g, "")
        .replace("材料科学进展", "材料进展")
        .replace("马克思主义与当代科技", "马克思主义")
        .replace("数据库系统原理与应用", "数据库系统")
        .replace("分布式系统原理与应用", "分布式系统")
        .replace("深度学习及应用", "深度学习")
        .replace("数据库前沿技术", "数据库前沿");
}
function shortRoom(room) {
    if (room.includes("羽毛球"))
        return "羽毛球场";
    if (room.includes("雨课堂"))
        return "线上";
    return room;
}
function nowOffset(week, slots, currentDate, rowHeight = ROW_HEIGHT) {
    if (week !== (0, calendar_1.weekOf)(currentDate))
        return -1;
    const clock = new Date(Date.now() + 8 * 3600000);
    const minute = clock.getUTCHours() * 60 + clock.getUTCMinutes();
    const ranges = slots.map((slot) => slot.split("-").map((time) => {
        const [hour, min] = time.split(":").map(Number);
        return hour * 60 + min;
    }));
    if (minute < ranges[0][0] || minute > ranges[ranges.length - 1][1])
        return -1;
    for (let i = 0; i < ranges.length; i++) {
        const [start, end] = ranges[i];
        if (minute <= end)
            return (i + (minute - start) / (end - start)) * rowHeight;
        if (i + 1 < ranges.length && minute < ranges[i + 1][0])
            return (i + 1) * rowHeight;
    }
    return -1;
}
function frame(s, week, currentDate, selectedWeekday, rowHeight = ROW_HEIGHT) {
    const w = Math.max(1, Math.min(18, week));
    const days = calendar_1.DAYS.map((day, index) => {
        const date = (0, calendar_1.dateOf)(w, index + 1);
        return {
            name: day,
            date,
            label: String(Number(date.slice(8))),
            monthHint: date.slice(8) === "01" ? `${Number(date.slice(5, 7))}月` : "",
            today: date === currentDate,
            selected: selectedWeekday === index + 1,
            holiday: calendar_1.HOLIDAYS.includes(date),
        };
    });
    const slots = (0, calendar_1.times)((0, calendar_1.dateOf)(w, 1));
    const items = (0, engine_1.schedule)(s, w);
    return {
        week: w,
        days,
        rows: slots.map((slot, index) => ({ n: index + 1, start: slot.split("-")[0], end: slot.split("-")[1] })),
        cards: (0, engine_1.blocks)(items).map((b) => (Object.assign(Object.assign({}, b), { top: (b.start - 1) * rowHeight, height: (b.end - b.start + 1) * rowHeight - 4, day: days.findIndex((day) => day.date === b.o.date), id: b.o.course.id, original: b.o.originalDate, name: b.o.course.name, shortName: shortName(b.o.course.name), sectionText: (0, calendar_1.sectionLabel)(b.o.sections), room: b.o.room, shortRoom: shortRoom(b.o.room) }))),
        noClasses: items.length === 0,
        isCurrentWeek: w === (0, calendar_1.weekOf)(currentDate),
        month: `${Number((0, calendar_1.dateOf)(w, 1).slice(5, 7))}月`,
        nowTop: nowOffset(w, slots, currentDate, rowHeight),
        todayIndex: days.findIndex((day) => day.today),
        gridHeight: rowHeight * 11,
        rowHeight,
    };
}
Page({
    data: {
        week: 1,
        selectedWeekday: 1,
        selectedDate: "",
        selectedDayName: "一",
        clockDate: "",
        frames: [],
        swipeIndex: 1,
        swiperDuration: 280,
        navTop: 24,
        navRight: 100,
        showParts: false,
        weeks: Array.from({ length: 18 }, (_, i) => `第${i + 1}周${i >= 16 ? " · 考试" : ""}`),
        days: [],
        rows: [],
        cards: [],
        empty: true,
        noClasses: false,
        isCurrentWeek: false,
        nowTop: -1,
        rowHeight: ROW_HEIGHT,
        loadError: false,
        month: "",
        detail: null,
        selection: [],
    },
    touchOrigin: null,
    clockTimer: null,
    suppressTapUntil: 0,
    onLoad() {
        try {
            const window = wx.getWindowInfo();
            // 只留状态栏和2px间距，标题不再按胶囊高度垂直居中。
            this.setData({ navTop: Math.max(0, window.statusBarHeight || 0) + 2 });
            const capsule = wx.getMenuButtonBoundingClientRect();
            if (capsule.left > 0)
                this.setData({ navRight: window.windowWidth - capsule.left + 8 });
        }
        catch (_a) {
            /* 无系统尺寸时保留默认安全区域。 */
        }
        const currentDate = (0, calendar_1.today)();
        this.setData({ week: Math.max(1, Math.min(18, (0, calendar_1.weekOf)(currentDate))),
            selectedWeekday: (0, calendar_1.weekdayOf)(currentDate) });
    },
    onShow() {
        if (this.clockTimer)
            clearInterval(this.clockTimer);
        if (this.data.clockDate && this.data.clockDate !== (0, calendar_1.today)() && this.data.isCurrentWeek) {
            this.setData({
                week: Math.max(1, Math.min(18, (0, calendar_1.weekOf)((0, calendar_1.today)()))),
                selectedWeekday: (0, calendar_1.weekdayOf)((0, calendar_1.today)()),
            });
        }
        this.refresh();
        this.clockTimer = setInterval(() => this.refreshClock(), 60000);
    },
    onReady() {
        this.measureGrid();
    },
    onResize() {
        this.measureGrid();
    },
    measureGrid() {
        if (typeof wx.createSelectorQuery !== "function")
            return;
        const query = wx.createSelectorQuery().in(this);
        query.select(".grid-scroll").boundingClientRect((rect) => {
            if (!rect || rect.height <= 0)
                return;
            const width = wx.getWindowInfo().windowWidth;
            const height = Math.floor((rect.height * 750) / width / 11 * 10) / 10;
            if (height > 0 && Math.abs(height - this.data.rowHeight) > 0.5) {
                this.setData({ rowHeight: height });
                this.refresh();
            }
        }).exec();
    },
    onHide() {
        if (this.clockTimer)
            clearInterval(this.clockTimer);
        this.clockTimer = null;
    },
    onUnload() {
        if (this.clockTimer)
            clearInterval(this.clockTimer);
        this.clockTimer = null;
    },
    refreshClock() {
        if (this.data.detail || this.data.selection.length)
            return;
        const currentDate = (0, calendar_1.today)();
        if (currentDate !== this.data.clockDate) {
            if (this.data.isCurrentWeek)
                this.setData({
                    week: Math.max(1, Math.min(18, (0, calendar_1.weekOf)(currentDate))),
                    selectedWeekday: (0, calendar_1.weekdayOf)(currentDate),
                });
            this.refresh();
            return;
        }
        const nowTop = nowOffset(this.data.week, (0, calendar_1.times)((0, calendar_1.dateOf)(this.data.week, 1)), currentDate, this.data.rowHeight);
        if (nowTop !== this.data.nowTop)
            this.setData({ nowTop, "frames[1].nowTop": nowTop });
    },
    refresh() {
        try {
            const s = (0, storage_1.read)(), w = this.data.week, currentDate = (0, calendar_1.today)(), selectedWeekday = this.data.selectedWeekday, current = frame(s, w, currentDate, selectedWeekday, this.data.rowHeight);
            this.setData(Object.assign(Object.assign({ showParts: false, detail: null, selection: [], loadError: false, clockDate: currentDate, empty: s.courses.length === 0 }, current), { frames: [
                    Object.assign(Object.assign({}, frame(s, w - 1, currentDate, selectedWeekday, this.data.rowHeight)), { slot: "previous" }),
                    Object.assign(Object.assign({}, current), { slot: "current" }),
                    Object.assign(Object.assign({}, frame(s, w + 1, currentDate, selectedWeekday, this.data.rowHeight)), { slot: "next" }),
                ], swipeIndex: 1, selectedDate: current.days[selectedWeekday - 1].date.replace(/-/g, "/"), selectedDayName: calendar_1.DAYS[selectedWeekday - 1] }));
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
        const currentDate = (0, calendar_1.today)();
        this.setData({ week: Math.max(1, Math.min(18, (0, calendar_1.weekOf)(currentDate))),
            selectedWeekday: (0, calendar_1.weekdayOf)(currentDate) });
        this.refresh();
    },
    selectDay(e) {
        const selectedWeekday = Number(e.currentTarget.dataset.day);
        if (!Number.isInteger(selectedWeekday) || selectedWeekday < 1 || selectedWeekday > 7)
            return;
        this.setData({ selectedWeekday });
        this.refresh();
    },
    swipeChange(e) {
        var _a;
        const index = Number(e.detail.current);
        if (index === 1 || index < 0 || index > 2)
            return;
        const nextWeek = (_a = this.data.frames[index]) === null || _a === void 0 ? void 0 : _a.week;
        if (!nextWeek || nextWeek === this.data.week) {
            this.setData({ swipeIndex: 1 });
            return;
        }
        this.setData({ week: nextWeek, swiperDuration: 0 });
        this.refresh();
        setTimeout(() => this.setData({ swiperDuration: 280 }), 30);
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
        var _a;
        if (Date.now() < this.suppressTapUntil)
            return;
        const source = ((_a = this.data.frames.find((f) => f.week === Number(e.currentTarget.dataset.week))) === null || _a === void 0 ? void 0 : _a.cards) || this.data.cards;
        const b = source[Number(e.currentTarget.dataset.index)];
        if (!b)
            return;
        const options = source.filter((x) => x.day === b.day && x.start <= b.end && x.end >= b.start);
        const unique = options.filter((x, i) => options.findIndex((y) => y.key === x.key) === i);
        if (unique.length > 1)
            this.setData({ selection: unique });
        else
            this.go(b);
    },
    go(b) {
        this.setData({
            showParts: false,
            detail: Object.assign(Object.assign({}, b.o), { members: b.members, sectionText: (0, calendar_1.sectionLabel)(b.o.sections), teachers: b.o.course.teachers.join("、"), parts: b.members.map((m) => ({
                    id: m.course.id,
                    original: m.originalDate,
                    sections: (0, calendar_1.sectionLabel)(m.sections),
                    weeks: m.course.weeks.join("、"),
                })), day: calendar_1.DAYS[(0, calendar_1.weekdayOf)(b.o.date) - 1], time: (0, calendar_1.timeLabel)(b.o.date, b.o.sections), weeks: b.o.course.weeks.join("、") }),
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
        if (d.members.length > 1) {
            this.setData({ showParts: !this.data.showParts });
            return;
        }
        this.navigateAdjustment(d.members[0].course.id, d.members[0].originalDate);
    },
    adjustPart(e) {
        const p = this.data.detail.parts[Number(e.currentTarget.dataset.index)];
        this.navigateAdjustment(p.id, p.original);
    },
    navigateAdjustment(id, original) {
        wx.navigateTo({
            url: `/pages/detail/detail?id=${encodeURIComponent(id)}&date=${original}&adjust=1`,
        });
    },
    noop() { },
    import() {
        wx.navigateTo({ url: "/pages/login/login" });
    },
    add() {
        wx.navigateTo({ url: "/pages/editor/editor" });
    },
    refreshRemote() {
        this.import();
    },
    more() {
        wx.showActionSheet({
            itemList: ["导出课表", "关于我们"],
            success: (result) => {
                wx.navigateTo({
                    url: result.tapIndex === 0
                        ? "/pages/transfer/transfer?mode=backup"
                        : "/pages/about/about",
                });
            },
        });
    },
    editDetail() {
        const d = this.data.detail;
        if (!d)
            return;
        this.setData({ detail: null });
        wx.navigateTo({ url: "/pages/editor/editor?id=" + encodeURIComponent(d.course.id) });
    },
    async deleteDetail() {
        const d = this.data.detail;
        if (!d)
            return;
        const result = await wx.showModal({
            title: "删除这门课？",
            content: "这门课的全部周次和单次调整都会删除。",
            confirmText: "删除",
            confirmColor: "#b84b56",
        });
        if (!result.confirm)
            return;
        try {
            const s = (0, storage_1.read)();
            s.courses = s.courses.filter((c) => c.id !== d.course.id);
            s.adjustments = s.adjustments.filter((a) => a.courseId !== d.course.id);
            (0, storage_1.write)(s);
            this.refresh();
        }
        catch (e) {
            (0, storage_1.error)(e);
        }
    },
});
