import { index, manifest } from "../../core/vocabulary/content";
import { read, error } from "../../core/vocabulary/storage";
import { summary, LEVEL_NAMES, LEVELS } from "../../core/vocabulary/engine";
Page({
  data: {
    stats: null as any,
    loadError: "",
    manifest,
    levels: LEVELS.map((id, i) => ({
      id,
      name: LEVEL_NAMES[i],
      count: index.filter((e) => e.level === id).length,
    })),
  },
  onShow() {
    try {
      this.setData({ stats: summary(read(), index), loadError: "" });
    } catch (e) {
      this.setData({ loadError: e instanceof Error ? e.message : "读取失败" });
    }
  },
  start() {
    wx.navigateTo({ url: "/vocabulary/pages/study/study" });
  },
  library(e: any) {
    wx.navigateTo({
      url:
        "/vocabulary/pages/library/library?level=" +
        (e.currentTarget.dataset.level || ""),
    });
  },
  list(e: any) {
    wx.navigateTo({
      url:
        "/vocabulary/pages/library/library?filter=" +
        e.currentTarget.dataset.filter,
    });
  },
  settings() {
    wx.navigateTo({ url: "/vocabulary/pages/settings/settings" });
  },
});
