import { read, write, error } from "../../core/storage";
import { occurrence } from "../../core/engine";
import {
  DAYS,
  weekdayOf,
  timeLabel,
  dateOf,
  HOLIDAYS,
  weekOf,
} from "../../core/calendar";
import { parseList } from "../../core/validation";
Page({
  data: {
    id: "",
    original: "",
    o: null as any,
    day: "",
    time: "",
    weekText: "",
    holiday: false,
    adjusting: false,
    targetDate: "",
    targetSections: "",
    targetRoom: "",
    min: dateOf(1, 1),
    max: dateOf(18, 7),
  },
  onLoad(q: any) {
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
      const o = occurrence(read(), this.data.id, this.data.original);
      if (!o) throw new Error("课程不存在，请返回课表");
      this.setData({
        o,
        holiday: !o.adjusted && HOLIDAYS.includes(o.date),
        day: DAYS[weekdayOf(o.date) - 1],
        time: timeLabel(o.date, o.sections),
        weekText: o.course.weeks.join("、"),
        targetDate: o.date,
        targetSections: o.sections.join(","),
        targetRoom: o.room,
      });
    } catch (e) {
      error(e);
    }
  },
  adjust() {
    this.setData({ adjusting: true });
  },
  close() {
    this.setData({ adjusting: false });
  },
  date(e: any) {
    this.setData({ targetDate: e.detail.value });
  },
  input(e: any) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },
  async save(e: any) {
    try {
      const cancelled = e.currentTarget.dataset.cancel === "yes";
      const sections = parseList(this.data.targetSections, 11, "节次");
      if (!cancelled && HOLIDAYS.includes(this.data.targetDate)) {
        const r = await wx.showModal({
          title: "目标是校历停课日",
          content: "这是显式单次调课，确认后仍会显示在该日。是否继续？",
        });
        if (!r.confirm) return;
      }
      if (cancelled) {
        const r = await wx.showModal({
          title: "取消本次课程？",
          content:
            "仅取消原日期 " +
            this.data.original +
            " 这一次，其他周保持原安排。",
        });
        if (!r.confirm) return;
      }
      const s = read();
      s.adjustments = s.adjustments.filter(
        (a) =>
          !(
            a.courseId === this.data.id && a.originalDate === this.data.original
          ),
      );
      s.adjustments.push({
        courseId: this.data.id,
        originalDate: this.data.original,
        cancelled,
        date: this.data.targetDate,
        sections,
        room: this.data.targetRoom,
      });
      write(s);
      this.setData({ adjusting: false });
      this.refresh();
      wx.showToast({ title: cancelled ? "本次已取消" : "本次已调整" });
    } catch (e) {
      error(e);
    }
  },
  async restore() {
    const r = await wx.showModal({
      title: "恢复原安排？",
      content: "仅撤销本次调整，校历停课规则仍然生效。",
    });
    if (!r.confirm) return;
    try {
      const s = read();
      s.adjustments = s.adjustments.filter(
        (a) =>
          !(
            a.courseId === this.data.id && a.originalDate === this.data.original
          ),
      );
      write(s);
      this.setData({ adjusting: false });
      this.refresh();
    } catch (e) {
      error(e);
    }
  },
  edit() {
    wx.navigateTo({
      url: "/pages/editor/editor?id=" + encodeURIComponent(this.data.id),
    });
  },
});
