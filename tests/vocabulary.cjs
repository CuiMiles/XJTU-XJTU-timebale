const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "../miniprogram");
const engine = require("../miniprogram/core/vocabulary/engine.js");
const storage = require("../miniprogram/core/vocabulary/storage.js");
const qa = require("../miniprogram/core/vocabulary/qa.js");
const {
  entries: index,
  manifest,
} = require("../miniprogram/core/vocabulary/catalog.js");
const day = "2026-09-14";
const small = index.slice(0, 6);
function memory() {
  const data = { "xiaojiao.v1": { untouched: true } };
  global.wx = {
    getStorageSync: (k) => structuredClone(data[k]),
    setStorageSync: (k, v) => {
      data[k] = structuredClone(v);
    },
    removeStorageSync: (k) => {
      delete data[k];
    },
    showModal: () => Promise.resolve({ confirm: true }),
  };
  return data;
}
function started() {
  const s = engine.empty();
  s.settings.dailyNewLimit = 6;
  return engine.queue(s, small, day);
}
test("Beijing day boundaries, month/year arithmetic, six-stage schedule and ceiling", () => {
  assert.equal(engine.today(Date.parse("2026-09-13T16:00:00Z")), day);
  assert.equal(engine.today(Date.parse("2026-09-13T15:59:59Z")), "2026-09-13");
  assert.equal(engine.addDays("2026-12-31", 1), "2027-01-01");
  let s = started(),
    d = day;
  const id = small[0].id;
  for (const interval of [1, 3, 7, 14, 30, 60, 60]) {
    s = engine.queue(s, [small[0]], d);
    s = engine.rate(s, s.session.queue[0].id, "known", d);
    assert.equal(s.progress[id].due, engine.addDays(d, interval));
    d = s.progress[id].due;
  }
  assert.equal(s.progress[id].stage, 5);
});
test("failed card is retried after other cards, twice at most, without same-day promotion", () => {
  let s = started();
  const id = s.session.queue[0].entryId;
  s = engine.rate(s, s.session.queue[0].id, "unknown", day);
  assert.equal(s.session.queue[3].entryId, id);
  const beforeResume = structuredClone(s.session.queue);
  s = engine.queue(s, small, day);
  assert.deepEqual(s.session.queue, beforeResume);
  while (s.session.queue[0].entryId !== id)
    s = engine.rate(s, s.session.queue[0].id, "known", day);
  s = engine.rate(s, s.session.queue[0].id, "unknown", day);
  while (s.session.queue[0].entryId !== id)
    s = engine.rate(s, s.session.queue[0].id, "known", day);
  s = engine.rate(s, s.session.queue[0].id, "known", day);
  assert.equal(s.progress[id].stage, -1);
  assert.equal(s.progress[id].due, "2026-09-15");
  assert.equal(s.session.queue.length, 0);
  assert.equal(s.daily[day].newIds.length, 6);
  assert.equal(s.daily[day].attempts, 8);
  s = engine.queue(s, small, "2026-09-15");
  assert.deepEqual(s.session.failed, []);
  assert.doesNotThrow(() => storage.validate(s));
});
test("third failure schedules next day without another retry; fuzzy never upgrades", () => {
  let s = engine.queue(engine.empty(), [small[0]], day);
  for (let i = 0; i < 3; i++)
    s = engine.rate(s, s.session.queue[0].id, "unknown", day);
  assert.equal(s.session.queue.length, 0);
  s = engine.queue(s, [small[0]], "2026-09-15");
  s = engine.rate(s, s.session.queue[0].id, "fuzzy", "2026-09-15");
  assert.equal(s.progress[small[0].id].stage, -1);
});
test("familiar exits all queues; recovery and collections are independent; quota is not spent", () => {
  let s = started(),
    id = small[0].id;
  s = engine.familiar(s, id);
  assert.ok(!s.session.queue.some((a) => a.entryId === id));
  assert.equal(s.progress[id].due, undefined);
  assert.equal(engine.dayStats(s, day).newIds.length, 0);
  s = engine.favorite(s, id);
  assert.ok(s.favorites.includes(id));
  s = engine.relearn(s, id, day);
  s = engine.queue(s, small, day);
  assert.equal(s.session.queue[0].mode, "review");
  assert.equal(s.session.queue[0].entryId, id);
  assert.equal(engine.summary(s, small, day).familiar, 0);
});
test("settings affect only new words; paused quota still permits previously due words", () => {
  let s = started();
  s = engine.rate(s, s.session.queue[0].id, "known", day);
  s.settings.levels = ["L4"];
  s.settings.dailyNewLimit = 0;
  s = engine.queue(s, small, "2026-09-15");
  assert.equal(s.session.queue.length, 1);
  assert.equal(s.session.queue[0].mode, "review");
  const attempt = s.session.queue[0].id;
  s = engine.rate(s, attempt, "known", "2026-09-15");
  assert.throws(() => engine.rate(s, attempt, "known", "2026-09-15"), /已处理/);
  assert.throws(() => engine.rate(s, attempt, "known", "2026-09-16"), /日期/);
});
test("failed write never advances revision; revision guard protects undo and timetable remains intact", () => {
  const data = memory();
  const s = storage.write(started());
  const before = structuredClone(data);
  global.wx.setStorageSync = () => {
    throw new Error("quota exceeded");
  };
  assert.throws(
    () =>
      storage.change((s) =>
        engine.rate(s, s.session.queue[0].id, "known", day),
      ),
    /quota/,
  );
  assert.deepEqual(data, before);
  assert.throws(() => storage.write(s, s.revision - 1), /变化/);
  storage.clear();
  assert.deepEqual(data["xiaojiao.v1"], { untouched: true });
});
test("backup validates dates, IDs, duplicates, future versions and unknown content survives", () => {
  const data = memory();
  let s = started();
  s.progress["w-unavailable"] = { state: "familiar", stage: -1 };
  const restored = storage.parseBackup(storage.backup(s));
  assert.equal(engine.summary(restored, small, day).unavailable, 1);
  data[storage.KEY] = { damaged: true };
  assert.throws(() => storage.read());
  storage.restore(restored);
  assert.equal(storage.read().progress["w-unavailable"].state, "familiar");
  assert.deepEqual(data["xiaojiao.v1"], { untouched: true });
  for (const mutate of [
    (s) => {
      s.schemaVersion = 2;
    },
    (s) => {
      s.settings.dailyNewLimit = 1.5;
    },
    (s) => {
      s.favorites = [small[0].id, small[0].id];
    },
    (s) => {
      s.progress[small[0].id] = {
        state: "review",
        stage: 1,
        due: "2026-02-31",
      };
    },
    (s) => {
      s.session.queue.push(s.session.queue[0]);
    },
  ]) {
    const copy = structuredClone(s);
    mutate(copy);
    assert.throws(() => storage.validate(copy));
  }
  assert.throws(() =>
    storage.parseBackup(
      '{"kind":"xiaojiao-vocabulary","backupVersion":1,"store":{"__proto__":{}}}',
    ),
  );
  assert.throws(() =>
    storage.parseBackup(JSON.stringify({ ...s, backupVersion: 1 })),
  );
});
test("spelling accepts explicit variants only and normalises case and whitespace", () => {
  assert.ok(engine.spelling(" Colour ", "color", ["colour"]));
  assert.ok(engine.spelling("ice   cream", "ice cream", []));
  assert.equal(engine.spelling("colur", "color", ["colour"]), false);
  assert.equal(engine.spelling("hue", "color", []), false);
});
test("question provider is disabled by default, validates input and output, never makes implicit requests", async () => {
  let calls = 0;
  global.wx = {
    request: () => {
      calls++;
    },
  };
  qa.configureQuestionProvider(null);
  const input = {
    version: 1,
    requestId: "abc",
    question: "Why?",
    context: { word: "apple", senseId: "07755101-n", definition: "a fruit" },
    language: "en",
  };
  await assert.rejects(qa.askQuestion(input), (e) => e.code === "UNAVAILABLE");
  assert.equal(calls, 0);
  qa.configureQuestionProvider({
    ask: async (p) => {
      calls++;
      assert.deepEqual(p.context, input.context);
      return { answer: "An explanation.", sources: [] };
    },
  });
  assert.equal((await qa.askQuestion(input)).answer, "An explanation.");
  await assert.rejects(
    qa.askQuestion({ ...input, question: "x".repeat(1001) }),
    (e) => e.code === "INVALID",
  );
  qa.configureQuestionProvider({
    ask: async () => ({
      answer: "<script>plain text</script>",
      sources: [{ title: "bad", url: "javascript:alert(1)" }],
    }),
  });
  await assert.rejects(qa.askQuestion(input), (e) => e.code === "INVALID");
  qa.configureQuestionProvider(null);
});
test("HTTP adapter stops on authentication failure, throttling and timeouts, without retries", async () => {
  const input = {
    version: 1,
    requestId: "abc",
    question: "Why?",
    context: { word: "apple", senseId: "x", definition: "fruit" },
    language: "en",
  };
  for (const [status, code] of [
    [401, "AUTH"],
    [403, "AUTH"],
    [429, "RATE_LIMIT"],
    [500, "NETWORK"],
  ]) {
    let count = 0;
    global.wx = {
      request: (options) => {
        count++;
        assert.equal(options.timeout, 30000);
        assert.equal(options.header.Authorization, "Bearer session");
        assert.ok(!("progress" in options.data));
        options.success({ statusCode: status });
      },
    };
    await assert.rejects(
      qa
        .createHttpProvider(
          "https://backend.example/api/v1/vocabulary/questions",
          async () => "session",
        )
        .ask(input),
      (e) => e.code === code,
    );
    assert.equal(count, 1);
  }
  global.wx = { request: (options) => options.fail() };
  await assert.rejects(
    qa
      .createHttpProvider(
        "https://backend.example/api/v1/vocabulary/questions",
        async () => "session",
      )
      .ask(input),
    (e) => e.code === "NETWORK",
  );
});
test("full content: 10000 unique entries, all source definitions match OEWN when present, all references resolve", () => {
  assert.equal(index.length, 10000);
  assert.equal(new Set(index.map((e) => e.id)).size, 10000);
  let deepCount = 0,
    entries = 0;
  const notes = require("../data/vocabulary/deep.json");
  const sourcePath = path.join(__dirname, "../data/wordnet/json");
  const synsets = {};
  const hasSource = fs.existsSync(sourcePath);
  if (hasSource)
    for (const file of fs
      .readdirSync(sourcePath)
      .filter((f) => f.endsWith(".json") && !f.startsWith("entries-")))
      Object.assign(
        synsets,
        JSON.parse(fs.readFileSync(path.join(sourcePath, file), "utf8")),
      );
  for (const shard of manifest.shards) {
    const rows = require(path.join(root, shard, "data.js"));
    for (const row of rows) {
      const m = index.find((e) => e.id === row.id);
      assert.ok(m);
      assert.equal(m.shard, shard);
      entries++;
      assert.ok(row.senses.length);
      for (const sense of row.senses) {
        assert.ok(
          sense.definition && sense.id && Array.isArray(sense.examples),
        );
        if (hasSource)
          assert.equal(
            sense.definition,
            synsets[sense.id].definition.join("; "),
          );
      }
      if (row.deep) {
        deepCount++;
        assert.equal(row.deep.blocks.length, 6);
        assert.ok(row.senses.some((s) => s.id === row.deep.senseId));
        const note = notes[row.word];
        const n = note.example.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g).length;
        assert.ok(n >= 50 && n <= 100, `${row.word}: ${n}`);
        assert.ok(row.deep.blocks.every((b) => b.en && b.zh));
      }
    }
  }
  assert.equal(entries, 10000);
  assert.equal(deepCount, manifest.deepCount);
});
test("word card hides Chinese again on a different entry or sense; all component handlers exist", () => {
  let definition;
  global.Component = (d) => {
    definition = d;
  };
  require("../miniprogram/components/word-card/word-card.js");
  const row = require(path.join(root, index[0].shard, "data.js")).find(
    (e) => e.id === index[0].id,
  );
  const component = {
    ...definition.methods,
    data: { ...structuredClone(definition.data), entry: row },
    setData(patch) {
      Object.assign(this.data, patch);
    },
    triggerEvent() {},
  };
  component.selectSense(0);
  component.chinese();
  component.toggle({ currentTarget: { dataset: { index: 0 } } });
  assert.equal(component.data.showZh, true);
  component.selectSense(0);
  assert.equal(component.data.showZh, false);
  assert.deepEqual(component.data.opened, {});
  const wxml = fs.readFileSync(
    path.join(root, "components/word-card/word-card.wxml"),
    "utf8",
  );
  for (const m of wxml.matchAll(
    /(?:bind|catch)(?::)?[a-z]+="([A-Za-z][A-Za-z0-9]*)"/g,
  ))
    assert.equal(typeof definition.methods[m[1]], "function");
  assert.ok(wxml.includes('wx:if="{{showZh}}"'));
});
test("packaging guard: main and each package under conservative 2 MiB budget; total below 20 MiB", () => {
  const app = require("../miniprogram/app.json"),
    totals = { main: 0 };
  for (const p of app.subPackages) totals[p.root] = 0;
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else {
        const rel = path.relative(root, f).split(path.sep);
        const group = Object.hasOwn(totals, rel[0]) ? rel[0] : "main";
        totals[group] += fs.statSync(f).size;
      }
    }
  }
  walk(root);
  for (const [name, bytes] of Object.entries(totals))
    assert.ok(bytes < 2 * 1024 * 1024, `${name}: ${bytes}`);
  assert.ok(
    Object.values(totals).reduce((a, b) => a + b, 0) < 20 * 1024 * 1024,
  );
});
test("async content adapter deduplicates concurrent load, fails safely and retries", async () => {
  let loads = 0,
    fail = true;
  const source = fs.readFileSync(
    path.join(root, "core/vocabulary/content.js"),
    "utf8",
  );
  const module = { exports: {} };
  vm.runInNewContext(source, {
    exports: module.exports,
    module,
    require: (name) =>
      name.includes("catalog")
        ? { entries: [small[0]], manifest: { shards: [small[0].shard] } }
        : {
            loadShard: async () => {
              loads++;
              if (fail) throw new Error("offline");
              return [
                { ...small[0], senses: [{ id: "x", definition: "fruit" }] },
              ];
            },
          },
    Set,
    Promise,
  });
  const c = module.exports;
  await assert.rejects(
    Promise.all([c.getEntry(small[0].id), c.getEntry(small[0].id)]),
    /加载失败/,
  );
  assert.equal(loads, 1);
  fail = false;
  assert.equal((await c.getEntry(small[0].id)).id, small[0].id);
  assert.equal(loads, 2);
  await assert.rejects(c.getEntry("w-missing"), /未收录/);
});
