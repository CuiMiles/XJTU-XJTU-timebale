"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.occurrence = occurrence;
exports.schedule = schedule;
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
function color(name) {
    let h = 0;
    for (const ch of name)
        h = (h * 31 + ch.charCodeAt(0)) | 0;
    return ["#dcebf8", "#e0efdf", "#faf0cf", "#eee3f5", "#f7e3dd", "#dbefed"][Math.abs(h) % 6];
}
function blocks(items) {
    const groups = [];
    items.forEach((o) => {
        let start = o.sections[0], end = start;
        const emit = () => groups.push({ o, start, end });
        o.sections.slice(1).forEach((n) => {
            if (n === end + 1)
                end = n;
            else {
                emit();
                start = end = n;
            }
        });
        emit();
    });
    return groups.map((b, i) => {
        const overlaps = groups.filter((x) => x.o.date === b.o.date && x.start <= b.end && x.end >= b.start);
        return Object.assign(Object.assign({}, b), { key: i, top: (b.start - 1) * 116, height: (b.end - b.start + 1) * 116 - 6, conflicts: overlaps.length, color: color(b.o.course.name) });
    });
}
