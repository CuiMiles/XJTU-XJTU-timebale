import { getEntry, metadata } from "../../../core/vocabulary/content";
import { read, error, write } from "../../../core/vocabulary/storage";
import {
  lookupMethods,
  lookupData,
  markKnown,
} from "../../../core/vocabulary/page-actions";
Page({
  data: {
    ...lookupData,
    entry: null as any,
    favorite: false,
    familiar: false,
    loading: true,
    loadError: "",
    undoAvailable: false,
  },
  ...lookupMethods,
  onLoad(q: any) {
    this._id = q.id;
    this.refresh();
  },
  onUnload() {
    this._epoch = (this._epoch || 0) + 1;
    this.closeLookup();
  },
  async refresh() {
    const key = (this._epoch = (this._epoch || 0) + 1);
    this.setData({ loading: true, loadError: "" });
    try {
      if (!metadata(this._id)) throw new Error("当前词库未收录此词");
      const e = await getEntry(this._id);
      if (key !== this._epoch) return;
      const s = read();
      this.setData({
        entry: e,
        familiar: s.progress[e.id]?.state === "familiar",
        favorite: s.favorites.includes(e.id),
      });
    } catch (e) {
      if (key === this._epoch)
        this.setData({
          loadError: e instanceof Error ? e.message : "加载失败",
        });
    } finally {
      if (key === this._epoch) this.setData({ loading: false });
    }
  },
  async known() {
    if (this._busy) return;
    this._busy = true;
    try {
      const undo = await markKnown(this._id);
      if (undo) {
        this._undo = undo;
        this.setData({ undoAvailable: true });
        await this.refresh();
      }
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
      this.setData({ undoAvailable: false });
      error(e);
    }
  },
});
