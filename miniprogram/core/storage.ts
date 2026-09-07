import { Store } from "./types";
import { parse } from "./validation";
const KEY = "xiaojiao.v1";
export const empty = (): Store => ({
  schemaVersion: 1,
  semesterId: "2026-fall",
  courses: [],
  adjustments: [],
});
export function read(): Store {
  const v = wx.getStorageSync(KEY);
  if (v === "" || v === undefined) return empty();
  return parse(JSON.stringify({ ...v, backupVersion: 1 }), true);
}
export function write(v: Store): void {
  const checked = parse(JSON.stringify({ ...v, backupVersion: 1 }), true);
  wx.setStorageSync(KEY, checked);
}
export function id(): string {
  return (
    Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 11)
  );
}
export function error(e: unknown): void {
  wx.showModal({
    title: "未能完成",
    content: e instanceof Error ? e.message : "本地存储不可用，请稍后重试",
    showCancel: false,
  });
}
export function backupRaw(): string {
  return JSON.stringify(wx.getStorageSync(KEY) || empty(), null, 2);
}
export function clear(): void {
  wx.removeStorageSync(KEY);
}
