import { read, write, id, error } from "../../core/storage";
import { course } from "../../core/validation";
import { DAYS } from "../../core/calendar";
Page({
  data: {
    id: "",
    name: "",
    className: "",
    teachers: "",
    room: "",
    note: "",
    weekday: 1,
    days: DAYS.map((d) => "星期" + d),
    sections: [] as number[],
    weeks: [] as number[],
    sectionOptions: [] as any[],
    weekOptions: [] as any[],
  },
  onLoad(q: any) {
    try {
      if (q.id) {
        const c = read().courses.find((c) => c.id === q.id);
        if (!c) throw new Error("课程不存在");
        this.setData({ ...c, teachers: c.teachers.join("、") });
      } else
        this.setData({
          weeks: Array.from({ length: 16 }, (_, i) => i + 1),
          sections: [1, 2],
        });
      this.options();
    } catch (e) {
      error(e);
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
  input(e: any) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },
  day(e: any) {
    this.setData({ weekday: Number(e.detail.value) + 1 });
  },
  toggle(e: any) {
    const key = e.currentTarget.dataset.field as "sections" | "weeks",
      n = Number(e.currentTarget.dataset.n),
      arr = this.data[key];
    this.setData({
      [key]: arr.includes(n)
        ? arr.filter((x: number) => x !== n)
        : [...arr, n].sort((a, b) => a - b),
    });
    this.options();
  },
  preset(e: any) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      weeks: Array.from({ length: 16 }, (_, i) => i + 1).filter(
        (n) => mode === "all" || (mode === "odd" ? n % 2 === 1 : n % 2 === 0),
      ),
    });
    this.options();
  },
  async save() {
    try {
      const d = this.data;
      const c = course({
        ...d,
        id: d.id || id(),
        teachers: d.teachers
          .split(/[、,，]/)
          .map((x: string) => x.trim())
          .filter(Boolean),
      });
      const s = read();
      if (d.id) {
        if (!s.courses.some((x) => x.id === d.id))
          throw new Error("课程已不存在，请返回管理页");
        const has = s.adjustments.some((a) => a.courseId === d.id);
        if (has) {
          const r = await wx.showModal({
            title: "更新基础课程",
            content: "保存将清除这门课的所有单次调整。是否继续？",
          });
          if (!r.confirm) return;
        }
        s.courses = s.courses.map((x) => (x.id === d.id ? c : x));
        s.adjustments = s.adjustments.filter((a) => a.courseId !== d.id);
      } else {
        s.courses.push(c);
      }
      write(s);
      wx.showToast({ title: "已保存" });
      wx.navigateBack();
    } catch (e) {
      error(e);
    }
  },
});
