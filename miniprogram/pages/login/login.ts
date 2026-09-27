import { IMPORT_API_BASE } from "../../config";
import { read, write, error } from "../../core/storage";
import { parse } from "../../core/validation";
import { mergeImported } from "../../core/import";

Page({
  data: {
    username: "",
    password: "",
    busy: false,
    configured: /^https:\/\/[A-Za-z0-9.-]+$/.test(IMPORT_API_BASE),
  },
  input(e: any) {
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
  },
  json() {
    wx.navigateTo({ url: "/pages/transfer/transfer" });
  },
  async submit() {
    if (this.data.busy) return;
    const username = this.data.username.trim();
    const password = this.data.password;
    if (!username || !password) {
      error(new Error("请输入账号和密码"));
      return;
    }
    if (!this.data.configured) {
      this.setData({ password: "" });
      error(new Error("自动导入尚未配置 HTTPS 服务域名。可先使用 JSON 导入或手动添加。"));
      return;
    }
    this.setData({ busy: true, password: "" });
    wx.request({
      url: IMPORT_API_BASE + "/api/gmis/import",
      method: "POST",
      header: { "content-type": "application/json" },
      data: { username, password },
      timeout: 60000,
      success: (response) => {
        try {
          if (response.statusCode !== 200) throw new Error("登录或获取课表失败，请检查账号密码后重试");
          const incoming = parse(JSON.stringify(response.data));
          write(mergeImported(read(), incoming));
          wx.showToast({ title: `已导入${incoming.courses.length}门课` });
          wx.navigateBack();
        } catch (e) {
          error(e);
        }
      },
      fail: () => error(new Error("无法连接导入服务，请检查网络后重试")),
      complete: () => this.setData({ busy: false }),
    });
  },
});
