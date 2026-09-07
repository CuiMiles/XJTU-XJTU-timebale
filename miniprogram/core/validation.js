"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.numbers = numbers;
exports.course = course;
exports.parse = parse;
exports.parseList = parseList;
const calendar_1 = require("./calendar");
function fail(s) {
    throw new Error(s);
}
function obj(v, p) {
    if (!v || typeof v !== "object" || Array.isArray(v))
        fail(p + "必须是对象");
}
function str(v, p, required = false) {
    if (typeof v !== "string" || v.length > 500 || (required && !v.trim()))
        fail(p + "必须是" + (required ? "非空" : "") + "文本（最多500字）");
    return v.trim();
}
function numbers(v, max, p) {
    if (!Array.isArray(v) ||
        !v.length ||
        v.length > max ||
        v.some((x) => !Number.isInteger(x) || x < 1 || x > max) ||
        new Set(v).size !== v.length)
        fail(p + `须为1～${max}的不重复整数数组，且不能为空`);
    return [...v].sort((a, b) => a - b);
}
function course(v, p = "课程") {
    obj(v, p);
    if (!Number.isInteger(v.weekday) || v.weekday < 1 || v.weekday > 7)
        fail(p + "星期须为1～7");
    if (!Array.isArray(v.teachers) || v.teachers.length > 20)
        fail(p + "教师须为文本数组");
    return {
        id: typeof v.id === "string" ? v.id : "",
        name: str(v.name, p + "名称", true),
        className: str(v.className, p + "班级"),
        teachers: v.teachers.map((x) => str(x, p + "教师", true)),
        room: str(v.room, p + "教室"),
        weekday: v.weekday,
        sections: numbers(v.sections, 11, p + "节次"),
        weeks: numbers(v.weeks, 18, p + "周次"),
        note: str(v.note, p + "备注"),
    };
}
function parse(text, backup = false) {
    if (text.length > 2000000)
        fail("JSON过大，请控制在2MB以内");
    let v;
    try {
        v = JSON.parse(text);
    }
    catch (_a) {
        fail("JSON格式错误：请检查引号、逗号，勿包含 Markdown 代码围栏");
    }
    obj(v, "数据");
    if (v.schemaVersion !== 1 || v.semesterId !== "2026-fall")
        fail('仅支持 schemaVersion: 1 和 semesterId: "2026-fall"');
    if (!Array.isArray(v.courses) || v.courses.length > 500)
        fail("courses须为数组，最多500项");
    const courses = v.courses.map((x, i) => course(x, `第${i + 1}项课程：`));
    let adjustments = [];
    if (backup) {
        if (v.backupVersion !== 1)
            fail("不是完整备份：缺少 backupVersion: 1");
        if (courses.some((c) => !c.id || c.id.length > 100) ||
            new Set(courses.map((c) => c.id)).size !== courses.length)
            fail("备份课程ID缺失或重复");
        if (!Array.isArray(v.adjustments) || v.adjustments.length > 10000)
            fail("备份调课数据无效");
        const keys = new Set();
        adjustments = v.adjustments.map((a) => {
            obj(a, "调课");
            const c = courses.find((c) => c.id === a.courseId);
            if (!c ||
                !(0, calendar_1.validDate)(a.originalDate) ||
                (0, calendar_1.weekdayOf)(a.originalDate) !== c.weekday ||
                !c.weeks.includes((0, calendar_1.weekOf)(a.originalDate)))
                fail("调课原日期不属于基础课程");
            const key = a.courseId + "@" + a.originalDate;
            if (keys.has(key))
                fail("同一次课程有重复调课");
            keys.add(key);
            if (typeof a.cancelled !== "boolean" ||
                typeof a.date !== "string" ||
                !(0, calendar_1.validDate)(a.date) ||
                (0, calendar_1.weekOf)(a.date) < 1 ||
                (0, calendar_1.weekOf)(a.date) > 18)
                fail("调课目标须在本学期1～18周内");
            return {
                courseId: c.id,
                originalDate: a.originalDate,
                cancelled: a.cancelled,
                date: a.date,
                sections: numbers(a.sections, 11, "调课节次"),
                room: str(a.room, "调课教室"),
            };
        });
    }
    else if (v.adjustments !== undefined || v.backupVersion !== undefined)
        fail("这是备份数据，请切换到“恢复备份”以保留调课");
    return { schemaVersion: 1, semesterId: "2026-fall", courses, adjustments };
}
function parseList(text, max, label) {
    return numbers(text
        .trim()
        .split(/[,，\s]+/)
        .map(Number), max, label);
}
