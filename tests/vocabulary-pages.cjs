const { test } = require("node:test");
const assert = require("node:assert/strict");
const content = require("../miniprogram/core/vocabulary/content.js");
const storage = require("../miniprogram/core/vocabulary/storage.js");
const engine = require("../miniprogram/core/vocabulary/engine.js");
const flush = () => new Promise((resolve) => setImmediate(resolve));
function setup(name) {
  const data = {},
    messages = [];
  global.wx = {
    getStorageSync: (key) => structuredClone(data[key]),
    setStorageSync: (key, value) => {
      data[key] = structuredClone(value);
    },
    removeStorageSync: (key) => {
      delete data[key];
    },
    showModal: async (opts) => {
      messages.push(opts);
      return { confirm: true };
    },
  };
  let definition;
  global.Page = (p) => {
    definition = p;
  };
  const file = `../miniprogram/vocabulary/pages/${name}/${name}.js`;
  delete require.cache[require.resolve(file)];
  require(file);
  return {
    data,
    messages,
    page: {
      ...definition,
      data: structuredClone(definition.data),
      setData(patch) {
        Object.assign(this.data, patch);
      },
    },
  };
}
test("study page: initial card, duplicate rating clicks, spelling persistence and failed writes", async () => {
  const original = content.getEntry;
  content.getEntry = async (id) => ({
    id,
    word: content.metadata(id).word,
    variants: [],
    senses: [
      {
        id: "sense",
        pos: "n",
        definition: "a test concept",
        examples: [],
        synonyms: [],
      },
    ],
    ipa: "",
  });
  try {
    const { page: p, data } = setup("study");
    p.onLoad();
    p.onShow();
    await flush();
    assert.equal(p.data.headword, "apple");
    assert.equal(p.data.answer, true);
    const action = { currentTarget: { dataset: { rating: "known" } } };
    await Promise.all([p.rate(action), p.rate(action)]);
    assert.equal(storage.read().progress["w-apple"].stage, 0);
    assert.equal(storage.read().daily[engine.today()].newIds.length, 1);
    assert.equal(p.data.headword, "book");
    p.toggleSpelling();
    await flush();
    assert.equal(p.data.entry, null);
    p.spellingInput({ detail: { value: "book" } });
    p.checkSpelling();
    p.checkSpelling();
    assert.equal(storage.read().daily[engine.today()].spellingAttempts, 1);
    p.toggleSpelling();
    await flush();
    p.toggleSpelling();
    await flush();
    p.spellingInput({ detail: { value: "book" } });
    p.checkSpelling();
    assert.equal(storage.read().daily[engine.today()].spellingAttempts, 1);
    const before = structuredClone(data);
    global.wx.setStorageSync = () => {
      throw new Error("disk full");
    };
    await p.rate(action);
    assert.deepEqual(data, before);
    assert.match(p.data.loadError, /disk full/);
  } finally {
    content.getEntry = original;
  }
});
test("settings: invalid restore preserves data; confirmed valid restore recovers damaged storage only", async () => {
  const { page: p, data } = setup("settings");
  data["xiaojiao.v1"] = { courses: ["untouched"] };
  data[storage.KEY] = { broken: true };
  p.onLoad();
  assert.ok(p.data.loadError);
  p.input({ detail: { value: '{"not":"a backup"}' } });
  p.validate();
  assert.equal(p.data.preview, "");
  assert.deepEqual(data[storage.KEY], { broken: true });
  p.input({ detail: { value: storage.backup(engine.empty()) } });
  p.validate();
  assert.ok(p.data.preview);
  await p.confirm();
  assert.equal(storage.read().schemaVersion, 1);
  assert.deepEqual(data["xiaojiao.v1"], { courses: ["untouched"] });
  assert.equal(p.data.preview, "");
});
test("question page discards answers after leaving and keeps the default endpoint inactive", async () => {
  const qa = require("../miniprogram/core/vocabulary/qa.js");
  const original = content.getEntry;
  content.getEntry = async (id) => ({
    id,
    word: "apple",
    senses: [{ id: "sense", definition: "fruit" }],
  });
  try {
    qa.configureQuestionProvider(null);
    const { page: p } = setup("ask");
    await p.onLoad({ id: "w-apple", sense: "sense" });
    assert.equal(p.data.available, false);
    p.input({ detail: { value: "Why?" } });
    await p.submit();
    assert.match(p.data.message, /尚未接入/);
    let resolve;
    qa.configureQuestionProvider({
      ask: () =>
        new Promise((r) => {
          resolve = r;
        }),
    });
    const pending = p.submit();
    await flush();
    p.onUnload();
    resolve({ answer: "Late answer", sources: [] });
    await pending;
    assert.equal(p.data.answer, "");
  } finally {
    content.getEntry = original;
    qa.configureQuestionProvider(null);
  }
});
