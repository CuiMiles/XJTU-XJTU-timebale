import { IndexEntry, Entry } from "./types";
import { loadShard } from "./shards";
declare const require: (path: string) => any;
const catalog = require("./catalog.js");
export const manifest = catalog.manifest;
export const index: IndexEntry[] = catalog.entries;
const lookup: Record<string, IndexEntry> = Object.create(null);
index.forEach((e) => {
  lookup[e.id] = e;
});
const cache: Record<string, Entry[]> = Object.create(null);
const pending: Record<string, Promise<Entry[]> | undefined> =
  Object.create(null);
let recent: string[] = [];
export function metadata(id: string): IndexEntry | undefined {
  return lookup[id];
}
export function search(
  query: string,
  level = "",
  filter: (e: IndexEntry) => boolean = () => true,
): IndexEntry[] {
  const q = query.trim().toLowerCase();
  const match = (e: IndexEntry) => (!level || e.level === level) && filter(e);
  if (!q) return index.filter(match);
  const exact = index.filter(
    (e) => match(e) && (e.word === q || e.variants.includes(q)),
  );
  const ids = new Set(exact.map((e) => e.id));
  return exact.concat(
    index.filter(
      (e) =>
        match(e) &&
        !ids.has(e.id) &&
        (e.word.startsWith(q) || e.variants.some((v) => v.startsWith(q))),
    ),
  );
}
function load(shard: string): Promise<Entry[]> {
  if (cache[shard]) return Promise.resolve(cache[shard]);
  const existing = pending[shard];
  if (existing) return existing;
  pending[shard] = loadShard(shard)
    .then((rows) => {
      if (
        !Array.isArray(rows) ||
        rows.some(
          (e) => !lookup[e.id] || !Array.isArray(e.senses) || !e.senses.length,
        )
      )
        throw new Error("词包结构错误");
      cache[shard] = rows;
      recent = recent.filter((x) => x !== shard).concat(shard);
      while (recent.length > 2) delete cache[recent.shift()!];
      return rows;
    })
    .then(
      (rows) => {
        delete pending[shard];
        return rows;
      },
      () => {
        delete pending[shard];
        throw new Error(
          "词包加载失败，请联网重试并确认微信版本支持分包异步加载",
        );
      },
    );
  return pending[shard]!;
}
export async function getEntry(id: string): Promise<Entry> {
  const m = lookup[id];
  if (!m) throw new Error("当前词库未收录此词");
  const rows = await load(m.shard);
  const e = rows.find((x) => x.id === id);
  if (!e) throw new Error("词包缺少该词条");
  return e;
}
export async function prepareAll(
  progress: (done: number, total: number) => void,
): Promise<void> {
  const shards: string[] = manifest.shards;
  for (let i = 0; i < shards.length; i++) {
    await load(shards[i]);
    progress(i + 1, shards.length);
  }
}
export const SOURCE =
  "Open English Wordnet 2025 · Open English Wordnet Community，源自 Princeton WordNet。CC BY 4.0。已筛选并转换格式；中文与五步为原创教学补充。";
export const SOURCE_URL = "https://en-word.net/downloads";
