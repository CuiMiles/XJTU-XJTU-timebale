const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const root = path.join(__dirname, "../miniprogram");
const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
const definitions = {};
global.Page = (p) => {
  definitions.current = p;
};
for (const route of app.pages) {
  test("route and event bindings: " + route, () => {
    for (const ext of [".js", ".ts", ".wxml", ".json"])
      assert.ok(fs.existsSync(path.join(root, route + ext)), route + ext);
    const config = JSON.parse(
      fs.readFileSync(path.join(root, route + ".json"), "utf8"),
    );
    assert.deepEqual(config.usingComponents, {});
    require(path.join(root, route + ".js"));
    definitions[route] = definitions.current;
    const wxml = fs.readFileSync(path.join(root, route + ".wxml"), "utf8");
    for (const m of wxml.matchAll(
      /(?:bind|catch)(?::)?[a-z]+="([A-Za-z][A-Za-z0-9]*)"/g,
    ))
      assert.equal(
        typeof definitions.current[m[1]],
        "function",
        "missing handler " + m[1],
      );
  });
}
test("tab destinations and literal navigation paths exist", () => {
  for (const tab of app.tabBar.list)
    assert.ok(app.pages.includes(tab.pagePath));
  for (const route of app.pages) {
    const code = fs.readFileSync(path.join(root, route + ".js"), "utf8");
    for (const m of code.matchAll(/\/pages\/[a-z]+\/[a-z]+/g))
      assert.ok(app.pages.includes(m[0].slice(1)), m[0]);
  }
});
function instance(route) {
  const p = definitions[route];
  return {
    ...p,
    data: structuredClone(p.data),
    setData(patch) {
      Object.assign(this.data, patch);
    },
  };
}
test("home empty state, full conflict selection, detail sheet and week controls", () => {
  let saved;
  global.wx = {
    getStorageSync: () => saved,
    showModal: () => Promise.resolve({ confirm: true }),
  };
  const p = instance("pages/home/home");
  p.onLoad();
  p.refresh();
  assert.equal(p.data.empty, true);
  assert.equal(p.data.loadError, false);
  const { EXAMPLE } = require("../miniprogram/core/prompt.js");
  saved = {
    ...EXAMPLE,
    courses: [
      { ...EXAMPLE.courses[0], id: "a" },
      { ...EXAMPLE.courses[0], id: "b", name: "第二门" },
    ],
    adjustments: [],
  };
  p.setData({ week: 1 });
  p.refresh();
  assert.equal(p.data.cards.length, 2);
  p.open({ currentTarget: { dataset: { index: 1 } } });
  assert.equal(p.data.selection.length, 2);
  p.choose({ currentTarget: { dataset: { index: 0 } } });
  assert.ok(p.data.detail);
  assert.equal(p.data.selection.length, 0);
  p.next();
  assert.equal(p.data.week, 2);
  p.prev();
  assert.equal(p.data.week, 1);
  p.prev();
  assert.equal(p.data.week, 1);
  p.pick({ detail: { value: 17 } });
  p.next();
  assert.equal(p.data.week, 18);
  saved = { broken: true };
  p.refresh();
  assert.equal(p.data.loadError, true);
});
test("invalid import never creates preview, example creates reviewable preview", () => {
  const p = instance("pages/transfer/transfer");
  p.onLoad({});
  p.input({ detail: { value: "oops" } });
  p.validate();
  assert.equal(p.data.preview, false);
  assert.ok(p.data.message);
  p.example();
  p.validate();
  assert.equal(p.data.preview, true);
  assert.equal(p.data.count, 1);
  p.input({ detail: { value: "{}" } });
  assert.equal(p.data.preview, false);
});

test("horizontal swipes change weeks; vertical scrolling, taps, cancelled gestures and boundaries do not", () => {
  global.wx = { getStorageSync: () => undefined };
  const p = instance("pages/home/home");
  p.setData({ week: 3 });
  p.refresh();
  assert.equal(p.data.month, "9月");
  assert.equal(p.data.days[3].label, "1");
  assert.equal(p.data.days[3].monthHint, "10月");
  const swipe = (x, y) => {
    p.touchStart({ touches: [{ clientX: 200, clientY: 200 }] });
    p.touchEnd({ changedTouches: [{ clientX: x, clientY: y }] });
  };
  swipe(100, 205);
  assert.equal(p.data.week, 4);
  assert.equal(p.data.month, "10月");
  swipe(300, 205);
  assert.equal(p.data.week, 3);
  swipe(190, 400);
  assert.equal(p.data.week, 3);
  swipe(195, 200);
  assert.equal(p.data.week, 3);
  p.touchStart({ touches: [{ clientX: 200, clientY: 200 }] });
  p.touchCancel();
  p.touchEnd({ changedTouches: [{ clientX: 10, clientY: 200 }] });
  assert.equal(p.data.week, 3);
  p.setData({ week: 1 });
  swipe(300, 200);
  assert.equal(p.data.week, 1);
  p.setData({ week: 18 });
  swipe(100, 200);
  assert.equal(p.data.week, 18);
  p.setData({ week: 3, detail: {} });
  swipe(100, 200);
  assert.equal(p.data.week, 3);
});

test("merged card details cover the full lesson and adjustments target the selected original record", () => {
  const { EXAMPLE } = require("../miniprogram/core/prompt.js");
  const c = { ...EXAMPLE.courses[0], id: "a", weekday: 1, sections: [9, 10] };
  let target = "";
  global.wx = {
    getStorageSync: () => ({
      ...EXAMPLE,
      courses: [c, { ...c, id: "b", sections: [11], weeks: [1] }],
      adjustments: [],
    }),
    navigateTo: ({ url }) => {
      target = url;
    },
  };
  const p = instance("pages/home/home");
  p.setData({ week: 1 });
  p.refresh();
  assert.equal(p.data.cards.length, 1);
  p.open({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(p.data.detail.sectionText, "9–11");
  assert.equal(p.data.detail.time, "19:40–22:30");
  p.adjustDetail();
  assert.equal(p.data.showParts, true);
  assert.equal(target, "");
  p.adjustPart({ currentTarget: { dataset: { index: 1 } } });
  assert.ok(target.includes("id=b&date=2026-09-14"));
});

test("today header uses Beijing date and disappears on other weeks; top gap excludes capsule offset", () => {
  const now = Date.now;
  Date.now = () => Date.parse("2026-09-13T16:30:00Z");
  global.wx = {
    getStorageSync: () => undefined,
    getWindowInfo: () => ({ statusBarHeight: 44, windowWidth: 375 }),
    getMenuButtonBoundingClientRect: () => ({ top: 56, height: 32, left: 278 }),
  };
  try {
    const p = instance("pages/home/home");
    p.onLoad();
    p.refresh();
    assert.equal(p.data.navTop, 46);
    assert.equal(p.data.isCurrentWeek, true);
    assert.deepEqual(
      p.data.days.filter((d) => d.today).map((d) => d.date),
      ["2026-09-14"],
    );
    p.next();
    assert.equal(p.data.isCurrentWeek, false);
    assert.equal(
      p.data.days.some((d) => d.today),
      false,
    );
    p.current();
    assert.equal(p.data.isCurrentWeek, true);
  } finally {
    Date.now = now;
  }
});
