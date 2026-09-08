const assert = require("node:assert/strict");
const { test } = require("node:test");
const cal = require("../miniprogram/core/calendar.js");
const {
  parse,
  course,
  parseList,
} = require("../miniprogram/core/validation.js");
const { schedule, blocks, color } = require("../miniprogram/core/engine.js");
const { EXAMPLE } = require("../miniprogram/core/prompt.js");
const storage = require("../miniprogram/core/storage.js");
const data = () => ({
  ...structuredClone(EXAMPLE),
  courses: [
    {
      ...structuredClone(EXAMPLE.courses[0]),
      id: "c1",
      weekday: 1,
      weeks: [1, 2, 3, 16, 17, 18],
    },
  ],
  adjustments: [],
});
test("calendar: local-independent dates and semester boundaries", () => {
  assert.equal(cal.weekOf("2026-09-13"), 0);
  assert.equal(cal.weekOf("2026-09-14"), 1);
  assert.equal(cal.weekOf("2026-09-20"), 1);
  assert.equal(cal.weekOf("2026-09-21"), 2);
  assert.equal(cal.dateOf(18, 7), "2027-01-17");
  assert.equal(cal.weekOf("2027-01-18"), 19);
  for (let w = 1; w <= 18; w++)
    for (let d = 1; d <= 7; d++) {
      assert.equal(cal.weekOf(cal.dateOf(w, d)), w);
      assert.equal(cal.weekdayOf(cal.dateOf(w, d)), d);
    }
  assert.equal(cal.validDate("2026-02-30"), false);
  assert.equal(cal.validDate("bad"), false);
  assert.equal(cal.times("2026-09-30")[4], "14:30-15:20");
  assert.equal(cal.times("2026-10-01")[4], "14:00-14:50");
});
test("all supplied holidays hide recurrence without deleting courses", () => {
  for (const date of cal.HOLIDAYS) {
    const s = data();
    s.courses[0].weekday = cal.weekdayOf(date);
    s.courses[0].weeks = [cal.weekOf(date)];
    assert.equal(schedule(s, cal.weekOf(date)).length, 0);
    assert.equal(s.courses.length, 1);
  }
});
test("nonconsecutive weeks, weekends, teaching and exam weeks", () => {
  const s = data();
  s.courses[0].weekday = 7;
  s.courses[0].weeks = [1, 3, 17];
  assert.equal(schedule(s, 1)[0].date, "2026-09-20");
  assert.equal(schedule(s, 2).length, 0);
  assert.equal(schedule(s, 17).length, 1);
  assert.equal(schedule(s, 18).length, 0);
});
test("cross-week override changes one occurrence, recovery and cancellation", () => {
  const s = data(),
    original = JSON.stringify(s.courses);
  s.adjustments = [
    {
      courseId: "c1",
      originalDate: "2026-09-14",
      date: "2026-09-22",
      sections: [5, 6],
      room: "新教室",
      cancelled: false,
    },
  ];
  assert.equal(schedule(s, 1).length, 0);
  assert.equal(schedule(s, 2).length, 2);
  assert.equal(schedule(s, 2).find((x) => x.adjusted).room, "新教室");
  assert.equal(schedule(s, 3)[0].room, s.courses[0].room);
  assert.equal(JSON.stringify(s.courses), original);
  s.adjustments[0].cancelled = true;
  assert.equal(schedule(s, 2).length, 1);
  s.adjustments = [];
  assert.equal(schedule(s, 1).length, 1);
});
test("explicit holiday make-up and holiday source", () => {
  const s = data();
  s.courses[0].weekday = 5;
  s.courses[0].weeks = [2];
  s.adjustments = [
    {
      courseId: "c1",
      originalDate: "2026-09-25",
      date: "2026-10-01",
      sections: [1, 3],
      room: "补课",
      cancelled: false,
    },
  ];
  assert.equal(schedule(s, 3).length, 1);
  assert.equal(schedule(s, 2).length, 0);
  assert.equal(blocks(schedule(s, 3)).length, 2);
});
test("conflicts preserve both courses; stable colors; disjoint sections split", () => {
  const s = data();
  s.courses.push({
    ...s.courses[0],
    id: "c2",
    name: "另一门课",
    sections: [2, 3, 5],
  });
  const bs = blocks(schedule(s, 1));
  assert.equal(bs.length, 3);
  assert.equal(bs[0].conflicts, 2);
  assert.equal(bs[0].height, 226);
  assert.equal(color("数据库"), color("数据库"));
});
test("strict JSON field validation with friendly failures", () => {
  assert.equal(parse(JSON.stringify(EXAMPLE)).courses.length, 1);
  for (const text of ["", "null", "[]", "```json\n{}", '{"courses":[]}'])
    assert.throws(() => parse(text));
  for (const patch of [
    { weekday: 0 },
    { weekday: 8 },
    { sections: [] },
    { sections: [1, 1] },
    { sections: [12] },
    { weeks: [19] },
    { weeks: ["1"] },
    { teachers: "某老师" },
    { name: " " },
    { room: null },
    { note: 1 },
    { weeks: [1.5] },
  ]) {
    const s = structuredClone(EXAMPLE);
    Object.assign(s.courses[0], patch);
    assert.throws(() => parse(JSON.stringify(s)));
  }
  assert.deepEqual(parseList("1，3, 5", 11, "节次"), [1, 3, 5]);
  assert.throws(() => parseList("", 11, "节次"));
});
test("backup validates references, identity, dates, duplicates and preserves overrides", () => {
  const s = { ...data(), backupVersion: 1 };
  s.adjustments = [
    {
      courseId: "c1",
      originalDate: "2026-09-14",
      date: "2026-09-22",
      sections: [5],
      room: "A",
      cancelled: false,
    },
  ];
  assert.deepEqual(parse(JSON.stringify(s), true).adjustments, s.adjustments);
  assert.throws(() => parse(JSON.stringify(s)));
  for (const patch of [
    { courseId: "missing" },
    { originalDate: "2026-09-15" },
    { originalDate: "bad" },
    { date: "2027-01-18" },
    { cancelled: "false" },
    { sections: [] },
  ]) {
    const copy = structuredClone(s);
    Object.assign(copy.adjustments[0], patch);
    assert.throws(() => parse(JSON.stringify(copy), true));
  }
  const copy = structuredClone(s);
  copy.adjustments.push(copy.adjustments[0]);
  assert.throws(() => parse(JSON.stringify(copy), true));
});
test("storage roundtrip, corrupted data preserved, failed writes propagate", () => {
  let saved;
  global.wx = {
    getStorageSync: () => saved,
    setStorageSync: (_, v) => {
      saved = structuredClone(v);
    },
    removeStorageSync: () => {
      saved = undefined;
    },
  };
  assert.equal(storage.read().courses.length, 0);
  storage.write(data());
  assert.deepEqual(storage.read(), data());
  saved = { bad: true };
  assert.throws(() => storage.read());
  assert.deepEqual(saved, { bad: true });
  global.wx.setStorageSync = () => {
    throw new Error("quota");
  };
  assert.throws(() => storage.write(data()), /quota/);
  storage.clear();
  assert.equal(storage.read().courses.length, 0);
});
test("empty schedule safe", () => {
  assert.deepEqual(schedule(storage.empty(), 1), []);
  assert.deepEqual(blocks([]), []);
});

test("Beijing date changes at UTC 16:00 regardless of device timezone", () => {
  assert.equal(cal.today(Date.parse("2026-09-13T15:59:59Z")), "2026-09-13");
  assert.equal(cal.today(Date.parse("2026-09-13T16:00:00Z")), "2026-09-14");
  assert.equal(cal.today(Date.parse("2026-12-31T16:00:00Z")), "2027-01-01");
  assert.equal(cal.shortDate("2026-09-01"), "9/1");
});
test("three consecutive sections span all three rows, split entries connect without changing identity", () => {
  const s = data();
  s.courses[0].sections = [1, 2, 3];
  let bs = blocks(schedule(s, 1));
  assert.equal(bs.length, 1);
  assert.equal(bs[0].height, 342);
  assert.equal(bs[0].end, 3);
  s.courses[0].sections = [1, 2];
  s.courses.push({ ...s.courses[0], id: "c2", sections: [3] });
  bs = blocks(schedule(s, 1));
  assert.equal(bs[0].joinAfter, true);
  assert.equal(bs[1].joinBefore, true);
  assert.equal(bs[0].top + bs[0].height, bs[1].top);
  assert.equal(bs[1].o.course.id, "c2");
  s.courses[1].room = "different";
  assert.equal(blocks(schedule(s, 1))[0].joinAfter, false);
});
