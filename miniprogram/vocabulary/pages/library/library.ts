import { search, index } from "../../../core/vocabulary/content";
import { read, write, change, error } from "../../../core/vocabulary/storage";
import {
  familiar,
  favorite,
  relearn,
  LEVEL_NAMES,
} from "../../../core/vocabulary/engine";
Page({
  data: {
    query: "",
    level: "",
    filter: "",
    rows: [] as any[],
    count: 0,
    limit: 40,
    levels: ["全部等级", ...LEVEL_NAMES],
    levelIndex: 0,
    filters: ["全部", "熟词本", "收藏本", "五步深学"],
    filterIndex: 0,
    undoAvailable: false,
    loadError: "",
  },
  onLoad(q: any) {
    const i = ["L1", "L2", "L3", "L4"].indexOf(q.level);
    const f = ["", "familiar", "favorites", "deep"].indexOf(q.filter || "");
    this.setData({
      level: i >= 0 ? q.level : "",
      levelIndex: i + 1,
      filter: f >= 0 ? q.filter || "" : "",
      filterIndex: Math.max(0, f),
    });
  },
  onShow() {
    this._undo = null;
    this.setData({ undoAvailable: false });
    this.refresh();
  },
  refresh() {
    try {
      const s = read();
      const results = search(this.data.query, this.data.level, (e) =>
        this.data.filter === "familiar"
          ? s.progress[e.id]?.state === "familiar"
          : this.data.filter === "favorites"
            ? s.favorites.includes(e.id)
            : this.data.filter === "deep"
              ? e.deep
              : true,
      );
      this.setData({
        rows: results.slice(0, this.data.limit).map((e) => ({
          ...e,
          familiar: s.progress[e.id]?.state === "familiar",
          favorite: s.favorites.includes(e.id),
        })),
        count: results.length,
        loadError: "",
      });
    } catch (e) {
      this.setData({
        rows: [],
        loadError: e instanceof Error ? e.message : "读取失败",
      });
    }
  },
  input(e: any) {
    this.setData({ query: e.detail.value, limit: 40 });
    this.refresh();
  },
  levelPick(e: any) {
    const n = Number(e.detail.value);
    this.setData({ levelIndex: n, level: n ? "L" + n : "", limit: 40 });
    this.refresh();
  },
  filterPick(e: any) {
    const n = Number(e.detail.value);
    this.setData({
      filterIndex: n,
      filter: ["", "familiar", "favorites", "deep"][n],
      limit: 40,
    });
    this.refresh();
  },
  onReachBottom() {
    this.more();
  },
  more() {
    this.setData({ limit: this.data.limit + 40 });
    this.refresh();
  },
  open(e: any) {
    wx.navigateTo({
      url: "/vocabulary/pages/word/word?id=" + e.currentTarget.dataset.id,
    });
  },
  async known(e: any) {
    if (this._busy) return;
    this._busy = true;
    try {
      const id = e.currentTarget.dataset.id,
        s = read();
      if (s.progress[id]?.state === "familiar")
        change((now) => relearn(now, id));
      else {
        if (!s.settings.familiarHintSeen) {
          const r = await wx.showModal({
            title: "加入熟词本",
            content:
              "将跳过这个单词的全部已收录词义，退出新词和复习队列。可在熟词本重新学习。",
          });
          if (!r.confirm) return;
        }
        const before = read(),
          after = write(familiar(before, id), before.revision);
        this._undo = { before, revision: after.revision };
        this.setData({ undoAvailable: true });
      }
      this.refresh();
    } catch (e) {
      error(e);
    } finally {
      this._busy = false;
    }
  },
  undo() {
    try {
      if (!this._undo) return;
      write(this._undo.before, this._undo.revision);
      this._undo = null;
      this.setData({ undoAvailable: false });
      this.refresh();
    } catch (e) {
      this._undo = null;
      this.setData({ undoAvailable: false });
      error(e);
    }
  },
  star(e: any) {
    try {
      change((s) => favorite(s, e.currentTarget.dataset.id));
      this._undo = null;
      this.setData({ undoAvailable: false });
      this.refresh();
    } catch (e) {
      error(e);
    }
  },
});
