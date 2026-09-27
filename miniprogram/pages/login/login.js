"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = require("../../config");
const storage_1 = require("../../core/storage");
const validation_1 = require("../../core/validation");
const import_1 = require("../../core/import");
Page({
    data: {
        username: "",
        password: "",
        busy: false,
        configured: /^https:\/\/[A-Za-z0-9.-]+$/.test(config_1.IMPORT_API_BASE),
    },
    input(e) {
        this.setData({ [e.currentTarget.dataset.field]: e.detail.value });
    },
    json() {
        wx.navigateTo({ url: "/pages/transfer/transfer" });
    },
    async submit() {
        if (this.data.busy)
            return;
        const username = this.data.username.trim();
        const password = this.data.password;
        if (!username || !password) {
            (0, storage_1.error)(new Error("请输入账号和密码"));
            return;
        }
        if (!this.data.configured) {
            this.setData({ password: "" });
            (0, storage_1.error)(new Error("自动导入尚未配置 HTTPS 服务域名。可先使用 JSON 导入或手动添加。"));
            return;
        }
        this.setData({ busy: true, password: "" });
        wx.request({
            url: config_1.IMPORT_API_BASE + "/api/gmis/import",
            method: "POST",
            header: { "content-type": "application/json" },
            data: { username, password },
            timeout: 60000,
            success: (response) => {
                try {
                    if (response.statusCode !== 200)
                        throw new Error("登录或获取课表失败，请检查账号密码后重试");
                    const incoming = (0, validation_1.parse)(JSON.stringify(response.data));
                    (0, storage_1.write)((0, import_1.mergeImported)((0, storage_1.read)(), incoming));
                    wx.showToast({ title: `已导入${incoming.courses.length}门课` });
                    wx.navigateBack();
                }
                catch (e) {
                    (0, storage_1.error)(e);
                }
            },
            fail: () => (0, storage_1.error)(new Error("无法连接导入服务，请检查网络后重试")),
            complete: () => this.setData({ busy: false }),
        });
    },
});
