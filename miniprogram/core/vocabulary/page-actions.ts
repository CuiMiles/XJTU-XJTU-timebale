import { getEntry, search } from "./content";
import { change, error, read, write } from "./storage";
import { favorite, familiar, relearn } from "./engine";
import { Store } from "./types";
export const lookupData = {
  lookupWord: "",
  lookupDefinition: "",
  lookupLoading: false,
};
export const lookupMethods = {
  async lookup(this: any, event: any) {
    const word = String(event.detail.word || "").toLowerCase(),
      key = (this._lookupEpoch || 0) + 1;
    this._lookupEpoch = key;
    this.setData({
      lookupWord: word,
      lookupDefinition: "",
      lookupLoading: true,
    });
    try {
      const m = search(word).find(
        (e) => e.word === word || e.variants.includes(word),
      );
      if (!m) throw new Error("当前词库未收录此词");
      const e = await getEntry(m.id);
      if (key === this._lookupEpoch)
        this.setData({ lookupDefinition: e.senses[0].definition });
    } catch (e) {
      if (key === this._lookupEpoch)
        this.setData({
          lookupDefinition: e instanceof Error ? e.message : "查词失败",
        });
    } finally {
      if (key === this._lookupEpoch) this.setData({ lookupLoading: false });
    }
  },
  closeLookup(this: any) {
    this._lookupEpoch = (this._lookupEpoch || 0) + 1;
    this.setData({ lookupWord: "", lookupDefinition: "" });
  },
  sense(this: any, e: any) {
    this._senseId = e.detail.senseId;
  },
  ask(this: any) {
    if (this.data.entry)
      wx.navigateTo({
        url:
          "/vocabulary/pages/ask/ask?id=" +
          this.data.entry.id +
          "&sense=" +
          encodeURIComponent(this._senseId || ""),
      });
  },
  star(this: any) {
    try {
      const id = this.data.entry.id;
      const s = change((s) => favorite(s, id));
      this._undo = null;
      this.setData({
        favorite: s.favorites.includes(id),
        undoAvailable: false,
      });
    } catch (e) {
      error(e);
    }
  },
};
export async function markKnown(
  id: string,
): Promise<{ before: Store; revision: number } | null> {
  const s = read();
  if (s.progress[id]?.state === "familiar") {
    const after = write(relearn(s, id), s.revision);
    return { before: s, revision: after.revision };
  }
  if (!s.settings.familiarHintSeen) {
    const r = await wx.showModal({
      title: "加入熟词本",
      content:
        "跳过这个单词的全部已收录词义，退出新词与复习队列。可在熟词本重新学习。",
    });
    if (!r.confirm) return null;
  }
  const fresh = read();
  const after = write(familiar(fresh, id), fresh.revision);
  return { before: fresh, revision: after.revision };
}
