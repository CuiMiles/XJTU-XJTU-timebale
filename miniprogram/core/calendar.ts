export const SEMESTER = { id: "2026-fall", start: "2026-09-14", weeks: 18 };
export const HOLIDAYS = [
  "2026-09-25",
  "2026-10-01",
  "2026-10-02",
  "2026-10-03",
  "2027-01-01",
];
export const DAYS = ["一", "二", "三", "四", "五", "六", "日"];
const DAY = 86400000;
export function stamp(date: string): number {
  return Date.parse(date + "T00:00:00Z");
}
export function addDays(date: string, n: number): string {
  return new Date(stamp(date) + n * DAY).toISOString().slice(0, 10);
}
// 固定北京时间（UTC+8），不依赖设备所在时区。
export function today(now: number = Date.now()): string {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function shortDate(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}
export function weekOf(date: string): number {
  return Math.floor((stamp(date) - stamp(SEMESTER.start)) / DAY / 7) + 1;
}
export function dateOf(week: number, weekday: number): string {
  return addDays(SEMESTER.start, (week - 1) * 7 + weekday - 1);
}
export function weekdayOf(date: string): number {
  return ((new Date(stamp(date)).getUTCDay() + 6) % 7) + 1;
}
export function validDate(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(stamp(date)) &&
    new Date(stamp(date)).toISOString().slice(0, 10) === date
  );
}
// 教务处/研究生院2025年公开作息表，来源见README；如学校更新，只改此处。
const WINTER = [
  "08:00-08:50",
  "09:00-09:50",
  "10:10-11:00",
  "11:10-12:00",
  "14:00-14:50",
  "15:00-15:50",
  "16:10-17:00",
  "17:10-18:00",
  "19:10-20:00",
  "20:10-21:00",
  "21:10-22:00",
];
const SUMMER = [
  "08:00-08:50",
  "09:00-09:50",
  "10:10-11:00",
  "11:10-12:00",
  "14:30-15:20",
  "15:30-16:20",
  "16:40-17:30",
  "17:40-18:30",
  "19:40-20:30",
  "20:40-21:30",
  "21:40-22:30",
];
export function times(date: string): string[] {
  const md = date.slice(5);
  return md >= "05-01" && md < "10-01" ? SUMMER : WINTER;
}
export function timeLabel(date: string, sections: number[]): string {
  const t = times(date);
  return sections.map((s) => `${s}节 ${t[s - 1]}`).join(" / ");
}
