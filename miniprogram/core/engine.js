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
        const sections = [...o.sections].sort((a, b) => a - b);
        let start = sections[0], end = start;
        const emit = () => groups.push({ o, start, end });
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
    const sameLesson = (a, b) => a.o.date === b.o.date &&
        a.o.originalDate === b.o.originalDate &&
        a.o.course.name === b.o.course.name &&
        a.o.room === b.o.room &&
        a.o.course.className === b.o.course.className &&
        a.o.course.note === b.o.course.note &&
        a.o.adjusted === b.o.adjusted &&
        JSON.stringify(a.o.course.teachers) ===
            JSON.stringify(b.o.course.teachers) &&
        JSON.stringify(a.o.course.weeks) === JSON.stringify(b.o.course.weeks);
    const unopposed = (b) => !groups.some((x) => x !== b &&
        x.o.date === b.o.date &&
        x.start <= b.end &&
        x.end >= b.start);
    return groups.map((b, i) => {
        const joinBefore = unopposed(b) &&
            groups.some((x) => sameLesson(x, b) && x.end + 1 === b.start && unopposed(x));
        const joinAfter = unopposed(b) &&
            groups.some((x) => sameLesson(x, b) && b.end + 1 === x.start && unopposed(x));
        const overlaps = groups.filter((x) => x.o.date === b.o.date && x.start <= b.end && x.end >= b.start);
        return Object.assign(Object.assign({}, b), { key: i, top: (b.start - 1) * 116, height: (b.end - b.start + 1) * 116 - (joinAfter ? 0 : 6), joinBefore,
            joinAfter, conflicts: overlaps.length, color: color(b.o.course.name) });
    });
}
