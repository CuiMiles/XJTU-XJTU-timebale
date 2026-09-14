import { getEntry, index } from "../../../core/vocabulary/content";
import { change, read, write, error } from "../../../core/vocabulary/storage";
import {
  queue,
  rate,
  today,
  summary,
  spelling,
  dayStats,
} from "../../../core/vocabulary/engine";
import {
  lookupMethods,
  lookupData,
  markKnown,
} from "../../../core/vocabulary/page-actions";
Page({
  data: {
    ...lookupData,
    entry: null as any,
    prompt: "",
    headword: "",
    loading: true,
    loadError: "",
    answer: false,
    done: false,
    remaining: 0,
    mode: "",
    favorite: false,
    stats: null as any,
    spellingMode: false,
    spellingText: "",
    spellingResult: "",
    undoAvailable: false,
    busy: false,
  },
  ...lookupMethods,
  onLoad() {
    this._loaded = true;
    this.initialize();
  },
  onShow() {
    if (this._shown) this.initialize();
    this._shown = true;
  },
  onUnload() {
    this._epoch = (this._epoch || 0) + 1;
    this.closeLookup();
  },
  initialize() {
    try {
      change((s) => queue(s, index));
      this.render();
    } catch (e) {
      this.setData({
        loading: false,
        loadError: e instanceof Error ? e.message : "读取失败",
      });
    }
  },
  async render() {
    const key = (this._epoch = (this._epoch || 0) + 1);
    this.closeLookup();
    this._senseId = "";
    this._entry = null;
    this.setData({
      loading: true,
      loadError: "",
      entry: null,
      prompt: "",
      headword: "",
      answer: false,
      spellingText: "",
      spellingResult: "",
    });
    try {
      const s = read();
      if (s.session?.day !== today()) {
        this.initialize();
        return;
      }
      const a = s.session.queue[0];
      this._attempt = a;
      this._spellingRecorded =
        !!a && dayStats(s, today()).spellingIds.includes(a.id);
      if (!a) {
        this.setData({ done: true, stats: summary(s, index), remaining: 0 });
        return;
      }
      const e = await getEntry(a.entryId);
      if (key !== this._epoch) return;
      this._entry = e;
      const selected = e.deep
        ? e.senses.find((x) => x.id === e.deep!.senseId) || e.senses[0]
        : e.senses[0];
      const reveal = a.mode === "new" && !this.data.spellingMode;
      this.setData({
        done: false,
        entry: reveal ? e : null,
        headword: e.word,
        prompt: selected.definition,
        answer: reveal,
        remaining: s.session.queue.length,
        mode:
          a.mode === "new"
            ? "新词"
            : a.mode === "retry"
              ? "再试一次"
              : "到期复习",
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
  reveal() {
    if (this._entry) this.setData({ answer: true, entry: this._entry });
  },
  async known() {
    if (!this._entry || this.data.busy) return;
    this.setData({ busy: true });
    try {
      const undo = await markKnown(this._entry.id);
      if (undo) {
        this._undo = undo;
        this.setData({ undoAvailable: true });
        change((s) => queue(s, index));
        this._undo.revision = read().revision;
        await this.render();
      }
    } catch (e) {
      error(e);
    } finally {
      this.setData({ busy: false });
    }
  },
  undo() {
    try {
      if (!this._undo) return;
      write(this._undo.before, this._undo.revision);
      this._undo = null;
      this.setData({ undoAvailable: false });
      this.render();
    } catch (e) {
      this.setData({ undoAvailable: false });
      error(e);
    }
  },
  async rate(e: any) {
    if (!this._attempt || !this.data.answer || this.data.busy) return;
    this.setData({ busy: true });
    const id = this._attempt.id;
    try {
      change((s) => rate(s, id, e.currentTarget.dataset.rating));
      this._undo = null;
      this.setData({ undoAvailable: false });
      await this.render();
    } catch (e) {
      error(e);
      this.initialize();
    } finally {
      this.setData({ busy: false });
    }
  },
  toggleSpelling() {
    this.setData({ spellingMode: !this.data.spellingMode });
    this.render();
  },
  spellingInput(e: any) {
    this.setData({ spellingText: e.detail.value });
  },
  checkSpelling() {
    if (!this._entry || !this._attempt || !this.data.spellingText.trim())
      return;
    if (this._spellingRecorded) {
      this.setData({
        spellingResult: "本张词卡的拼写已记录：" + this._entry.word,
      });
      this.reveal();
      return;
    }
    try {
      const ok = spelling(
          this.data.spellingText,
          this._entry.word,
          this._entry.variants,
        ),
        attemptId = this._attempt.id;
      change((s) => {
        const day = today();
        if (s.session?.day !== day || s.session.queue[0]?.id !== attemptId)
          throw new Error("学习队列已变化，请重新加载");
        const d = (s.daily[day] = dayStats(s, day));
        if (d.spellingIds.includes(attemptId)) return s;
        d.spellingAttempts++;
        if (ok) d.spellingCorrect++;
        d.spellingIds = d.spellingIds.concat(attemptId).slice(-1000);
        return s;
      });
      this._spellingRecorded = true;
      this.setData({
        spellingResult: ok ? "拼写正确" : "正确拼写：" + this._entry.word,
      });
      this.reveal();
    } catch (e) {
      error(e);
    }
  },
  finish() {
    wx.navigateBack();
  },
});
