# 小交课表 · 微信小程序

首页只显示一张七天课表：上方是周次、日期和刷新／今天／添加／更多四个图标；下方按可用屏幕高度铺满 1～11 节。左右滑动切周。今天列有淡色背景，当前时间线仅在今天列显示。课程按周次显示，点开后可查看、编辑、删除或调整单次课程。添加课程时可使用“体育课模板”（周三 3～4 节，1～8 周）并选择柔和颜色。更多菜单可导出完整备份和查看作者“西交研一”的小红书图片。

第一次打开是空课表。登录页准备了统一身份认证账号密码导入；后端已在本机通过真实教务网页面验证，可解析 17 条课程。密码只在当前请求中使用，不写入小程序本地存储。由于目前只有 ECS、没有可配置到微信的 HTTPS 域名，正式版的自动登录按钮暂时禁用；用户仍可从登录页导入 JSON 或手动添加课程。已有课表保存在当前微信设备本地，不与 StudyDesk 自动同步。刷新导入会保留手动课程及仍有效的单次调整。

## 本地预览

微信开发者工具打开仓库根目录，编译预览。`project.config.json` 暂用 `touristappid`，用户取得正式 AppID 后自行填写。JavaScript 已预编译，开发者工具不需要先安装 Node。

## 启用自动登录

`miniprogram-server/` 提供只监听回环地址的抓取 API。先为 ECS 配置备案域名、有效 HTTPS 证书和反向代理；把域名加入小程序后台的 `request` 合法域名，再在 `miniprogram/config.ts` 填写域名并重新构建。详见 [服务端说明](miniprogram-server/README.md)。不要用公网 IP、HTTP 或局域网明文端口传账号密码。

## 验证

```sh
npm ci
npm test
python -m pip install -r miniprogram-server/requirements.txt
PYTHONPATH=miniprogram-server python -m unittest discover -s miniprogram-server/tests
```

`npm test` 检查 TypeScript、课程周次和调课、单页路由、行高计算、体育课模板、导入合并与打包大小。服务端测试覆盖页面解析、主机限制和 HTTPS 反向代理约束。真机排版与正式域名下的登录仍需在填写 AppID、配置域名后验证。
