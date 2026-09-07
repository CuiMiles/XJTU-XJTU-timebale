"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROMPT = exports.EXAMPLE = void 0;
exports.EXAMPLE = {
    schemaVersion: 1,
    semesterId: "2026-fall",
    courses: [
        {
            name: "数据库系统原理与应用",
            className: "1班",
            teachers: ["刘帅"],
            room: "5-2W201",
            weekday: 6,
            sections: [1, 2],
            weeks: [1, 2, 3, 4, 5, 6, 7, 8],
            note: "",
        },
    ],
};
exports.PROMPT = "请将我随后提供的教务课表转换为“小交课表”JSON。只输出一个合法JSON对象，不要Markdown或解释。严格遵循以下示例字段：" +
    JSON.stringify(exports.EXAMPLE) +
    "。weekday为整数1～7（周一～周日），sections是1～11的不重复整数数组，weeks是1～18的不重复整数数组。将周次范围、单双周展开成具体数字；不连续周次保留。每个星期/节次/教室组合分别建一条课程。teachers必须为字符串数组；缺失班级、教室、备注填空字符串，缺失教师填[]。不要推测缺失的星期、节次、周次；不明确的课程不要加入courses，在转换前向我确认。课程名称必须非空。不生成id，不生成调课。学期2026-fall从2026-09-14开始，第1～16周教学，第17～18周考试。";
