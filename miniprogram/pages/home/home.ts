import {
  dateOf,
  DAYS,
  today,
  weekOf,
  times,
  HOLIDAYS,
  timeLabel,
  weekdayOf,
  sectionLabel,
} from "../../core/calendar";
import { schedule, blocks } from "../../core/engine";
import { read, write, error } from "../../core/storage";
import { Store } from "../../core/types";

const ROW_HEIGHT = 96;
function shortName(name: string): string {
  return name
    .replace(/（校企）|（实践）|（AI通识-线上）/g, "")
    .replace("材料科学进展", "材料进展")
    .replace("马克思主义与当代科技", "马克思主义")
    .replace("数据库系统原理与应用", "数据库系统")
    .replace("分布式系统原理与应用", "分布式系统")
    .replace("深度学习及应用", "深度学习")
    .replace("数据库前沿技术", "数据库前沿");
}
function shortRoom(room: string): string {
  if (room.includes("羽毛球")) return "羽毛球场";
  if (room.includes("雨课堂")) return "线上";
  return room;
}
function nowOffset(week: number, slots: string[], currentDate: string, rowHeight = ROW_HEIGHT): number {
  if (week !== weekOf(currentDate)) return -1;
  const clock = new Date(Date.now() + 8 * 3600000);
  const minute = clock.getUTCHours() * 60 + clock.getUTCMinutes();
  const ranges = slots.map((slot) =>
    slot.split("-").map((time) => {
      const [hour, min] = time.split(":").map(Number);
      return hour * 60 + min;
    }),
  );
  if (minute < ranges[0][0] || minute > ranges[ranges.length - 1][1]) return -1;
  for (let i = 0; i < ranges.length; i++) {
    const [start, end] = ranges[i];
    if (minute <= end) return (i + (minute - start) / (end - start)) * rowHeight;
    if (i + 1 < ranges.length && minute < ranges[i + 1][0])
      return (i + 1) * rowHeight;
  }
  return -1;
}
function frame(s: Store, week: number, currentDate: string, selectedWeekday: number, rowHeight = ROW_HEIGHT) {
  const w = Math.max(1, Math.min(18, week));
  const days = DAYS.map((day, index) => {
    const date = dateOf(w, index + 1);
    return {
      name: day,
      date,
      label: String(Number(date.slice(8))),
      monthHint: date.slice(8) === "01" ? `${Number(date.slice(5, 7))}月` : "",
      today: date === currentDate,
      selected: selectedWeekday === index + 1,
      holiday: HOLIDAYS.includes(date),
    };
  });
  const slots = times(dateOf(w, 1));
  const items = schedule(s, w);
  return {
    week: w,
    days,
    rows: slots.map((slot, index) => ({ n: index + 1, start: slot.split("-")[0], end: slot.split("-")[1] })),
    cards: blocks(items).map((b) => ({
      ...b,
      top: (b.start - 1) * rowHeight,
      height: (b.end - b.start + 1) * rowHeight - 4,
      day: days.findIndex((day) => day.date === b.o.date),
      id: b.o.course.id,
      original: b.o.originalDate,
      name: b.o.course.name,
      shortName: shortName(b.o.course.name),
      sectionText: sectionLabel(b.o.sections),
      room: b.o.room,
      shortRoom: shortRoom(b.o.room),
    })),
    noClasses: items.length === 0,
    isCurrentWeek: w === weekOf(currentDate),
    month: `${Number(dateOf(w, 1).slice(5, 7))}月`,
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
    frames: [] as any[],
    swipeIndex: 1,
    swiperDuration: 280,
    navTop: 24,
    navRight: 100,
    showParts: false,
    weeks: Array.from(
      { length: 18 },
      (_, i) => `第${i + 1}周${i >= 16 ? " · 考试" : ""}`,
    ),
    days: [] as any[],
    rows: [] as any[],
    cards: [] as any[],
    empty: true,
    noClasses: false,
    isCurrentWeek: false,
    nowTop: -1,
    rowHeight: ROW_HEIGHT,
    loadError: false,
    month: "",
    detail: null as any,
    selection: [] as any[],
  },
  touchOrigin: null as { x: number; y: number } | null,
  clockTimer: null as number | null,
  suppressTapUntil: 0,
  onLoad() {
    try {
      const window = wx.getWindowInfo();
      // 只留状态栏和2px间距，标题不再按胶囊高度垂直居中。
      this.setData({ navTop: Math.max(0, window.statusBarHeight || 0) + 2 });
      const capsule = wx.getMenuButtonBoundingClientRect();
      if (capsule.left > 0)
        this.setData({ navRight: window.windowWidth - capsule.left + 8 });
    } catch {
      /* 无系统尺寸时保留默认安全区域。 */
    }

    const currentDate = today();
    this.setData({ week: Math.max(1, Math.min(18, weekOf(currentDate))),
                   selectedWeekday: weekdayOf(currentDate) });
  },
  onShow() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    if (this.data.clockDate && this.data.clockDate !== today() && this.data.isCurrentWeek) {
      this.setData({
        week: Math.max(1, Math.min(18, weekOf(today()))),
        selectedWeekday: weekdayOf(today()),
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
    if (typeof wx.createSelectorQuery !== "function") return;
    const query = wx.createSelectorQuery().in(this);
    query.select(".grid-scroll").boundingClientRect((rect: any) => {
      if (!rect || rect.height <= 0) return;
      const width = wx.getWindowInfo().windowWidth;
      const height = Math.floor((rect.height * 750) / width / 11 * 10) / 10;
      if (height > 0 && Math.abs(height - this.data.rowHeight) > 0.5) {
        this.setData({ rowHeight: height });
        this.refresh();
      }
    }).exec();
  },
  onHide() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = null;
  },
  onUnload() {
    if (this.clockTimer) clearInterval(this.clockTimer);
    this.clockTimer = null;
  },
  refreshClock() {
    if (this.data.detail || this.data.selection.length) return;
    const currentDate = today();
    if (currentDate !== this.data.clockDate) {
      if (this.data.isCurrentWeek) this.setData({
        week: Math.max(1, Math.min(18, weekOf(currentDate))),
        selectedWeekday: weekdayOf(currentDate),
      });
      this.refresh();
      return;
    }
    const nowTop = nowOffset(this.data.week, times(dateOf(this.data.week, 1)), currentDate, this.data.rowHeight);
    if (nowTop !== this.data.nowTop)
      this.setData({ nowTop, "frames[1].nowTop": nowTop });
  },
  refresh() {
    try {
      const s = read(),
        w = this.data.week,
        currentDate = today(),
        selectedWeekday = this.data.selectedWeekday,
        current = frame(s, w, currentDate, selectedWeekday, this.data.rowHeight);
      this.setData({
        showParts: false,
        detail: null,
        selection: [],
        loadError: false,
        clockDate: currentDate,
        empty: s.courses.length === 0,
        ...current,
        frames: [
          { ...frame(s, w - 1, currentDate, selectedWeekday, this.data.rowHeight), slot: "previous" },
          { ...current, slot: "current" },
          { ...frame(s, w + 1, currentDate, selectedWeekday, this.data.rowHeight), slot: "next" },
        ],
        swipeIndex: 1,
        selectedDate: current.days[selectedWeekday - 1].date.replace(/-/g, "/"),
        selectedDayName: DAYS[selectedWeekday - 1],
      });
    } catch (e) {
      this.setData({ loadError: true });
      error(e);
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
  pick(e: any) {
    this.setData({ week: Number(e.detail.value) + 1 });
    this.refresh();
  },
  current() {
    const currentDate = today();
    this.setData({ week: Math.max(1, Math.min(18, weekOf(currentDate))),
                   selectedWeekday: weekdayOf(currentDate) });
    this.refresh();
  },
  selectDay(e: any) {
    const selectedWeekday = Number(e.currentTarget.dataset.day);
    if (!Number.isInteger(selectedWeekday) || selectedWeekday < 1 || selectedWeekday > 7) return;
    this.setData({ selectedWeekday });
    this.refresh();
  },
  swipeChange(e: any) {
    const index = Number(e.detail.current);
    if (index === 1 || index < 0 || index > 2) return;
    const nextWeek = this.data.frames[index]?.week;
    if (!nextWeek || nextWeek === this.data.week) {
      this.setData({ swipeIndex: 1 });
      return;
    }
    this.setData({ week: nextWeek, swiperDuration: 0 });
    this.refresh();
    setTimeout(() => this.setData({ swiperDuration: 280 }), 30);
  },
  touchStart(e: any) {
    this.touchOrigin =
      e.touches.length === 1
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : null;
  },
  touchCancel() {
    this.touchOrigin = null;
  },
  touchEnd(e: any) {
    const start = this.touchOrigin;
    this.touchOrigin = null;
    if (
      !start ||
      !e.changedTouches.length ||
      this.data.detail ||
      this.data.selection.length
    )
      return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // 明确的横向手势才切周，保留纵向滚动与轻点。
    if (Math.abs(dx) >= 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      this.suppressTapUntil = Date.now() + 350;
      if (dx < 0) this.next();
      else this.prev();
    }
  },
  open(e: any) {
    if (Date.now() < this.suppressTapUntil) return;
    const source = this.data.frames.find((f: any) => f.week === Number(e.currentTarget.dataset.week))?.cards || this.data.cards;
    const b = source[Number(e.currentTarget.dataset.index)];
    if (!b) return;
    const options = source.filter(
      (x: any) => x.day === b.day && x.start <= b.end && x.end >= b.start,
    );
    const unique = options.filter(
      (x: any, i: number) =>
        options.findIndex((y: any) => y.key === x.key) === i,
    );
    if (unique.length > 1) this.setData({ selection: unique });
    else this.go(b);
  },
  go(b: any) {
    this.setData({
      showParts: false,
      detail: {
        ...b.o,
        members: b.members,
        sectionText: sectionLabel(b.o.sections),
        teachers: b.o.course.teachers.join("、"),
        parts: b.members.map((m: any) => ({
          id: m.course.id,
          original: m.originalDate,
          sections: sectionLabel(m.sections),
          weeks: m.course.weeks.join("、"),
        })),
        day: DAYS[weekdayOf(b.o.date) - 1],
        time: timeLabel(b.o.date, b.o.sections),
        weeks: b.o.course.weeks.join("、"),
      },
    });
  },
  choose(e: any) {
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
  adjustPart(e: any) {
    const p = this.data.detail.parts[Number(e.currentTarget.dataset.index)];
    this.navigateAdjustment(p.id, p.original);
  },
  navigateAdjustment(id: string, original: string) {
    wx.navigateTo({
      url: `/pages/detail/detail?id=${encodeURIComponent(id)}&date=${original}&adjust=1`,
    });
  },
  noop() {},
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
    if (!d) return;
    this.setData({ detail: null });
    wx.navigateTo({ url: "/pages/editor/editor?id=" + encodeURIComponent(d.course.id) });
  },
  async deleteDetail() {
    const d = this.data.detail;
    if (!d) return;
    const result = await wx.showModal({
      title: "删除这门课？",
      content: "这门课的全部周次和单次调整都会删除。",
      confirmText: "删除",
      confirmColor: "#b84b56",
    });
    if (!result.confirm) return;
    try {
      const s = read();
      s.courses = s.courses.filter((c) => c.id !== d.course.id);
      s.adjustments = s.adjustments.filter((a) => a.courseId !== d.course.id);
      write(s);
      this.refresh();
    } catch (e) {
      error(e);
    }
  },
});
