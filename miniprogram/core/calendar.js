"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAYS = exports.HOLIDAYS = exports.SEMESTER = void 0;
exports.stamp = stamp;
exports.addDays = addDays;
exports.today = today;
exports.shortDate = shortDate;
exports.weekOf = weekOf;
exports.dateOf = dateOf;
exports.weekdayOf = weekdayOf;
exports.validDate = validDate;
exports.times = times;
exports.sectionRanges = sectionRanges;
exports.sectionLabel = sectionLabel;
exports.timeLabel = timeLabel;
exports.SEMESTER = { id: "2026-fall", start: "2026-09-14", weeks: 18 };
exports.HOLIDAYS = [
    "2026-09-25",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2027-01-01",
];
exports.DAYS = ["一", "二", "三", "四", "五", "六", "日"];
const DAY = 86400000;
function stamp(date) {
    return Date.parse(date + "T00:00:00Z");
}
function addDays(date, n) {
    return new Date(stamp(date) + n * DAY).toISOString().slice(0, 10);
}
// 固定北京时间（UTC+8），不依赖设备所在时区。
function today(now = Date.now()) {
    return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
function shortDate(date) {
    return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
}
function weekOf(date) {
    return Math.floor((stamp(date) - stamp(exports.SEMESTER.start)) / DAY / 7) + 1;
}
function dateOf(week, weekday) {
    return addDays(exports.SEMESTER.start, (week - 1) * 7 + weekday - 1);
}
function weekdayOf(date) {
    return ((new Date(stamp(date)).getUTCDay() + 6) % 7) + 1;
}
function validDate(date) {
    return (/^\d{4}-\d{2}-\d{2}$/.test(date) &&
        Number.isFinite(stamp(date)) &&
        new Date(stamp(date)).toISOString().slice(0, 10) === date);
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
function times(date) {
    const md = date.slice(5);
    return md >= "05-01" && md < "10-01" ? SUMMER : WINTER;
}
function sectionRanges(sections) {
    const ranges = [];
    [...new Set(sections)]
        .sort((a, b) => a - b)
        .forEach((n) => {
        const last = ranges[ranges.length - 1];
        if (last && last[1] + 1 === n)
            last[1] = n;
        else
            ranges.push([n, n]);
    });
    return ranges;
}
function sectionLabel(sections) {
    return sectionRanges(sections)
        .map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
        .join("、");
}
function timeLabel(date, sections) {
    const t = times(date);
    return sectionRanges(sections)
        .map(([a, b]) => `${t[a - 1].split("-")[0]}–${t[b - 1].split("-")[1]}`)
        .join(" / ");
}
