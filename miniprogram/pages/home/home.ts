import {
  dateOf,
  DAYS,
  today,
  weekOf,
  times,
  HOLIDAYS,
  timeLabel,
  weekdayOf,
} from "../../core/calendar";
import { schedule, blocks } from "../../core/engine";
import { read, error } from "../../core/storage";
Page({
  data: {
    week: 1,
    weeks: Array.from(
      { length: 18 },
      (_, i) => `第${i + 1}周${i >= 16 ? " · 考试" : ""}`,
    ),
    days: [] as any[],
    rows: [] as any[],
    cards: [] as any[],
    empty: true,
    noClasses: false,
    status: "",
    loadError: false,
    todayLabel: today(),
    detail: null as any,
    selection: [] as any[],
  },
  onLoad() {
    this.setData({ week: Math.max(1, Math.min(18, weekOf(today()))) });
  },
  onShow() {
    this.refresh();
  },
  refresh() {
    try {
      const s = read(),
        w = this.data.week,
        actual = weekOf(today());
      const days = DAYS.map((d, i) => {
        const date = dateOf(w, i + 1);
        return {
          name: d,
          date,
          label: date.slice(5).replace("-", "/"),
          today: date === today(),
          holiday: HOLIDAYS.includes(date),
        };
      });
      const items = schedule(s, w);
      this.setData({
        detail: null,
        selection: [],
        loadError: false,
        empty: s.courses.length === 0,
        noClasses: items.length === 0,
        days,
        rows: times(dateOf(w, 1)).map((t, i) => ({
          n: i + 1,
          start: t.split("-")[0],
          end: t.split("-")[1],
        })),
        cards: blocks(items).map((b) => ({
          ...b,
          day: days.findIndex((d) => d.date === b.o.date),
          id: b.o.course.id,
          original: b.o.originalDate,
          name: b.o.course.name,
          room: b.o.room,
        })),
        status:
          actual < 1
            ? "尚未开学"
            : actual > 18
              ? "学期已结束"
              : w === actual
                ? "本周"
                : `当前第${actual}周`,
        todayLabel: today(),
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
    this.setData({ week: Math.max(1, Math.min(18, weekOf(today()))) });
    this.refresh();
  },
  open(e: any) {
    const b = this.data.cards[Number(e.currentTarget.dataset.index)];
    const options = this.data.cards.filter(
      (x: any) => x.day === b.day && x.start <= b.end && x.end >= b.start,
    );
    const unique = options.filter(
      (x: any, i: number) =>
        options.findIndex(
          (y: any) => y.id === x.id && y.original === x.original,
        ) === i,
    );
    if (unique.length > 1) this.setData({ selection: unique });
    else this.go(b);
  },
  go(b: any) {
    this.setData({
      detail: {
        ...b.o,
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
    wx.navigateTo({
      url: `/pages/detail/detail?id=${encodeURIComponent(d.course.id)}&date=${d.originalDate}&adjust=1`,
    });
  },
  noop() {},
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
