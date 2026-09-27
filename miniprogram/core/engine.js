"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.occurrence = occurrence;
exports.schedule = schedule;
exports.courseTheme = courseTheme;
exports.color = color;
exports.blocks = blocks;
const calendar_1 = require("./calendar");
function occurrence(s, courseId, originalDate) {
    const c = s.courses.find((c) => c.id === courseId);
    if (!c)
        return;
    const a = s.adjustments.find((a) => a.courseId === courseId && a.originalDate === originalDate);
    return {
        course: c,
        originalDate,
        date: a ? a.date : originalDate,
        sections: a ? a.sections : c.sections,
        room: a ? a.room : c.room,
        adjusted: !!a,
        cancelled: !!a && a.cancelled,
    };
}
function schedule(s, week) {
    const out = [];
    s.courses.forEach((c) => c.weeks.forEach((w) => {
        const original = (0, calendar_1.dateOf)(w, c.weekday);
        const o = occurrence(s, c.id, original);
        if (!o.cancelled &&
            (0, calendar_1.weekOf)(o.date) === week &&
            (o.adjusted || !calendar_1.HOLIDAYS.includes(original)))
            out.push(o);
    }));
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.sections[0] - b.sections[0]);
}
const PALETTE = [
    { background: "#ec799b", end: "#e26e93", text: "#ffffff", secondary: "#fff5f8" },
    { background: "#a6bced", end: "#98afe1", text: "#192d57", secondary: "#2b426f" },
    { background: "#65c9c8", end: "#53bcbc", text: "#153f48", secondary: "#265960" },
    { background: "#e99178", end: "#e48670", text: "#492521", secondary: "#61352a" },
    { background: "#73b9e7", end: "#64aee0", text: "#153b5a", secondary: "#2b5270" },
    { background: "#b7ace8", end: "#a99bda", text: "#302557", secondary: "#49396d" },
    { background: "#659bc8", end: "#598dbc", text: "#ffffff", secondary: "#f0f8ff" },
    { background: "#e9a3bb", end: "#dc91af", text: "#4d2940", secondary: "#613b50" },
];
const NAMED_COLORS = [
    ["材料科学", 0], ["分布式系统", 1], ["日语二外", 2],
    ["数据库前沿", 3], ["马克思主义", 4], ["深度学习", 5],
    ["工程伦理", 6], ["数据库系统", 7], ["体育", 5],
];
const normalized = (s) => s.trim().replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")");
function courseTheme(name) {
    const match = NAMED_COLORS.find(([part]) => name.includes(part));
    if (match)
        return PALETTE[match[1]];
    let h = 0;
    for (const ch of normalized(name))
        h = (h * 31 + ch.charCodeAt(0)) | 0;
    return PALETTE[Math.abs(h) % PALETTE.length];
}
function color(name) {
    return courseTheme(name).background;
}
function blocks(items) {
    const groups = [];
    items.forEach((o) => {
        const sections = [...o.sections].sort((a, b) => a - b);
        let start = sections[0], end = start;
        const emit = () => groups.push({
            o: Object.assign(Object.assign({}, o), { sections: Array.from({ length: end - start + 1 }, (_, i) => start + i) }),
            start,
            end,
            members: [o],
        });
        sections.slice(1).forEach((n) => {
            if (n === end + 1)
                end = n;
            else {
                emit();
                start = end = n;
            }
        });
        emit();
    });
    groups.sort((a, b) => a.o.date.localeCompare(b.o.date) || a.start - b.start);
    const sameLesson = (a, b) => a.o.date === b.o.date &&
        a.o.originalDate === b.o.originalDate &&
        normalized(a.o.course.name) === normalized(b.o.course.name) &&
        normalized(a.o.room) === normalized(b.o.room) &&
        normalized(a.o.course.className) === normalized(b.o.course.className) &&
        a.o.course.note.trim() === b.o.course.note.trim() &&
        a.o.adjusted === b.o.adjusted &&
        JSON.stringify(a.o.course.teachers.map(normalized).sort()) ===
            JSON.stringify(b.o.course.teachers.map(normalized).sort());
    const merged = [];
    for (const b of groups) {
        const previous = merged.find((a) => a.end + 1 === b.start && sameLesson(a, b));
        if (previous) {
            previous.end = b.end;
            previous.o = Object.assign(Object.assign({}, previous.o), { sections: [...previous.o.sections, ...b.o.sections] });
            for (const member of b.members)
                if (!previous.members.some((m) => m.course.id === member.course.id &&
                    m.originalDate === member.originalDate))
                    previous.members.push(member);
        }
        else
            merged.push(Object.assign(Object.assign({}, b), { members: [...b.members] }));
    }
    return merged.map((b, i) => (Object.assign(Object.assign({}, b), { key: i, top: (b.start - 1) * 116, height: (b.end - b.start + 1) * 116 - 6, conflicts: merged.filter((x) => x.o.date === b.o.date && x.start <= b.end && x.end >= b.start).length, color: color(b.o.course.name), theme: courseTheme(b.o.course.name) })));
}
