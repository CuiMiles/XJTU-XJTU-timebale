# 教务课表导入服务

小程序发给此服务账号密码，服务使用一次性 Chromium 会话登录交大统一身份认证，解析 GMIS 课表，只返回课程 JSON，不存储密码、Cookie 或原始页面，也不写访问日志。默认只监听 `127.0.0.1:8766`，不可直接暴露到公网。

当前尚无小程序可用的 HTTPS 域名，因此没有部署到 ECS，`miniprogram/config.ts` 中的地址也留空。ECS 公网 IP 不能直接配置为正式版 `request` 合法域名。获取备案域名并将它解析到 ECS 后：

1. 在服务器安装 Python 3.11、Chromium 和 `requirements.txt`，设置 `CHROMIUM_PATH`，以独立低权限用户运行 `server.py`。只监听回环地址。
2. 用 Nginx/Caddy 在域名上启用有效 HTTPS 证书，反向代理 `/api/gmis/import` 至 `127.0.0.1:8766`；反代需设置 `X-Forwarded-Proto: https`，限制请求大小、速率，不记录请求体。可参考 [`nginx.conf.example`](nginx.conf.example) 和 [`xiaojiao-import.service.example`](xiaojiao-import.service.example)。防火墙不要开放 8766。
3. 在微信小程序后台将 HTTPS 域名加入 `request` 合法域名，在 `miniprogram/config.ts` 填写不带结尾斜杠的域名，填写 `project.config.json` 的 AppID，再上传体验版测试真机登录。

单机运行示例：

```sh
python -m venv .venv
.venv/bin/pip install -r requirements.txt
CHROMIUM_PATH=/usr/bin/chromium .venv/bin/python server.py
```

上面的进程只供本机反代访问；没有完成 HTTPS 和微信域名配置前，不要开放登录入口。登录页面的 JSON 导入可用于预览和手动导入。
