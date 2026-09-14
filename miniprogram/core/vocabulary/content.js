"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SOURCE_URL = exports.SOURCE = exports.index = exports.manifest = void 0;
exports.metadata = metadata;
exports.search = search;
exports.getEntry = getEntry;
exports.prepareAll = prepareAll;
const shards_1 = require("./shards");
const catalog = require("./catalog.js");
exports.manifest = catalog.manifest;
exports.index = catalog.entries;
const lookup = Object.create(null);
exports.index.forEach((e) => {
    lookup[e.id] = e;
});
const cache = Object.create(null);
const pending = Object.create(null);
let recent = [];
function metadata(id) {
    return lookup[id];
}
function search(query, level = "", filter = () => true) {
    const q = query.trim().toLowerCase();
    const match = (e) => (!level || e.level === level) && filter(e);
    if (!q)
        return exports.index.filter(match);
    const exact = exports.index.filter((e) => match(e) && (e.word === q || e.variants.includes(q)));
    const ids = new Set(exact.map((e) => e.id));
    return exact.concat(exports.index.filter((e) => match(e) &&
        !ids.has(e.id) &&
        (e.word.startsWith(q) || e.variants.some((v) => v.startsWith(q)))));
}
function load(shard) {
    if (cache[shard])
        return Promise.resolve(cache[shard]);
    const existing = pending[shard];
    if (existing)
        return existing;
    pending[shard] = (0, shards_1.loadShard)(shard)
        .then((rows) => {
        if (!Array.isArray(rows) ||
            rows.some((e) => !lookup[e.id] || !Array.isArray(e.senses) || !e.senses.length))
            throw new Error("词包结构错误");
        cache[shard] = rows;
        recent = recent.filter((x) => x !== shard).concat(shard);
        while (recent.length > 2)
            delete cache[recent.shift()];
        return rows;
    })
        .then((rows) => {
        delete pending[shard];
        return rows;
    }, () => {
        delete pending[shard];
        throw new Error("词包加载失败，请联网重试并确认微信版本支持分包异步加载");
    });
    return pending[shard];
}
async function getEntry(id) {
    const m = lookup[id];
    if (!m)
        throw new Error("当前词库未收录此词");
    const rows = await load(m.shard);
    const e = rows.find((x) => x.id === id);
    if (!e)
        throw new Error("词包缺少该词条");
    return e;
}
async function prepareAll(progress) {
    const shards = exports.manifest.shards;
    for (let i = 0; i < shards.length; i++) {
        await load(shards[i]);
        progress(i + 1, shards.length);
    }
}
exports.SOURCE = "Open English Wordnet 2025 · Open English Wordnet Community，源自 Princeton WordNet。CC BY 4.0。已筛选并转换格式；中文与五步为原创教学补充。";
exports.SOURCE_URL = "https://en-word.net/downloads";
