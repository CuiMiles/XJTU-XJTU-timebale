import { parse } from "../../core/validation";
import { read, write, id, error } from "../../core/storage";
import { Store } from "../../core/types";
import { PROMPT, EXAMPLE } from "../../core/prompt";
import { DAYS } from "../../core/calendar";
let preview: Store | null = null;
Page({
  data: {
    mode: "import",
    text: "",
    prompt: PROMPT,
    preview: false,
    rows: [] as any[],
    count: 0,
    adjustmentCount: 0,
    message: "",
    exportText: "",
  },
  onLoad(q: any) {
    preview = null;
    this.setData({ mode: q.mode === "backup" ? "backup" : "import" });
  },
  mode(e: any) {
    preview = null;
    this.setData({
      mode: e.currentTarget.dataset.mode,
      preview: false,
      message: "",
      exportText: "",
    });
  },
  input(e: any) {
    preview = null;
    this.setData({ text: e.detail.value, preview: false, message: "" });
  },
  copyPrompt() {
    wx.setClipboardData({ data: PROMPT });
  },
  example() {
    preview = null;
    this.setData({
      text: JSON.stringify(EXAMPLE, null, 2),
      preview: false,
      message: "",
    });
  },
  validate() {
    try {
      preview = parse(this.data.text, this.data.mode === "backup");
      this.setData({
        preview: true,
        count: preview.courses.length,
        adjustmentCount: preview.adjustments.length,
        rows: preview.courses.map((c) => ({
          name: c.name,
          room: c.room,
          day: DAYS[c.weekday - 1],
          sections: c.sections.join("、"),
          weeks: c.weeks.join("、"),
        })),
        message: "",
      });
    } catch (e) {
      preview = null;
      this.setData({
        preview: false,
        message: e instanceof Error ? e.message : "校验失败",
      });
    }
  },
  async confirm() {
    if (!preview) return;
    try {
      const isBackup = this.data.mode === "backup";
      const r = await wx.showModal({
        title: isBackup ? "恢复完整备份？" : "确认替换课表？",
        content: isBackup
          ? "当前课程和所有调课记录将替换为预览中的备份。"
          : "当前课程和所有调课记录将被替换。建议先导出备份。",
        confirmText: "确认替换",
      });
      if (!r.confirm || !preview) return;
      const s: Store = {
        ...preview,
        courses: preview.courses.map((c) => ({
          ...c,
          id: isBackup ? c.id : id(),
        })),
      };
      write(s);
      preview = null;
      this.setData({
        preview: false,
        message: "已保存到本机，可返回课表查看。",
      });
      wx.showToast({ title: "保存成功" });
    } catch (e) {
      error(e);
    }
  },
  export() {
    try {
      const data = JSON.stringify({ ...read(), backupVersion: 1 }, null, 2);
      this.setData({ exportText: data });
      wx.setClipboardData({
        data,
        fail: () => error(new Error("复制失败，可长按下方备份文本复制")),
      });
    } catch (e) {
      error(e);
    }
  },
  file() {
    try {
      const data = JSON.stringify({ ...read(), backupVersion: 1 }, null, 2);
      const path = wx.env.USER_DATA_PATH + "/xiaojiao-2026-fall-backup.json";
      wx.getFileSystemManager().writeFile({
        filePath: path,
        data,
        encoding: "utf8",
        success: () => {
          if (wx.canIUse("shareFileMessage"))
            wx.shareFileMessage({
              filePath: path,
              fileName: "xiaojiao-2026-fall-backup.json",
              fail: () =>
                error(new Error("文件分享未完成，可使用复制JSON备份")),
            });
          else error(new Error("当前环境不支持分享文件，请复制JSON保存"));
        },
        fail: () => error(new Error("备份文件写入失败，请复制JSON保存")),
      });
    } catch (e) {
      error(e);
    }
  },
});
