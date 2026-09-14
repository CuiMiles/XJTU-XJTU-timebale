# 背词系统：实现与接入说明

2026-09-14。本文记录已经落地的代码及现有限制；[需求文档](vocabulary-requirements.md)中的最终内容目标仍然保留。

## 已实现的学习流程

- 新增“背词” tab，保留课表默认首页。可选择四个等级、搜索词头及已登记的英美变体、浏览多词性和多词义。
- 已打包 10,000 个精选 WordNet 词头及其全部收录词义，分为 6 个内容包。原始英文释义保留来源；中文提示默认隐藏，进入新词义后重新隐藏。支持点击释义词汇查词并回到原位置。
- 所有词均可“熟”，整词退出新词和复习队列；支持当前操作撤销、熟词本重新学习和独立收藏。熟词不计为测试掌握。
- 每日新词默认 20，可调为 0–100。到期词优先，暂停新词不停止复习。间隔为 1、3、7、14、30、60 天，最长阶段继续每 60 天复习。
- “模糊”不升级并次日复习；“不认识”重置并最多额外重试两次，重试尽量间隔三个其他词；当天失败后不会因当轮重试正确而提升间隔。
- 英文回忆与拼写两种练习视图，拼写不自动改变复习安排。单张卡片拼写提交去重，词卡反馈独立提交。
- 每张卡片回答即保存，恢复学习保留同一天队列次序；跨日重建队列。统计区显示新学、复习、熟词和拼写结果。
- 背词状态独立存储、独立 JSON 备份／恢复及文件分享、双确认清空。损坏数据不自动覆盖，可导出原始数据。文件备份不包含词典正文。

用户学习状态只保存在 `xiaojiao.vocabulary.v1`，课程键 `xiaojiao.v1` 不变。状态写入通过 revision 校验保护撤销和过期操作，写入失败不前进词卡。未知词条 ID 保留在备份中，暂不进入队列。

## 内容覆盖与分包

当前的 10,000 词不等于 10,000 份已审核教学材料。已有 362 个中文词头提示、8 个完整原创五步词条（mitigate、alleviate、resilient、ambiguous、coherent、inevitable、sustainable、exacerbate），其余词义显示“尚未收录”而不是生成空洞占位段落。五步对应特定 senseId，其他词义不会误用同一解析。

分级使用 wordfreq 英文词频初筛，并把原创基础词清单放在前面，将八个深学示例放入高阶层。它不是中国课标或 CEFR 的正式映射，也不是雅思官方词书。整个分级、中文覆盖、例句可理解性和全部 L3/L4 五步仍需内容审核与扩充；这些是原需求的未完成内容项，不因为系统代码可运行就宣称达标。

`data/vocabulary/selection.json` 固化词表和词频来源说明，常规重建只需 Python 标准库，不依赖在线词典或 Python wordfreq。Open English Wordnet 原始数据按 [下载说明](../data/wordnet/README.md)放好后执行：

```sh
python3 scripts/build-vocabulary.py
npm run build
npm run check
npm test
```

生成的 `catalog.js` 及 `worddata*/data.js` 应随代码提交；WordNet 原始大压缩包与解压副本仍被 Git 忽略。修改 `basic.tsv` 或 `deep.json` 后重新构建。构建器会检查词义引用、六个内容块、英文示例字数；语言正确性不能靠结构检查代替。未来扩充时还需补齐近义词、搭配和语料来源的人工审阅记录。

小程序通过 `require.async` 异步跨分包加载 JS 数据模块，使用当前配置的基础库 3.7.1。没有调用仅适用于其他微信产品的 `wx.loadSubpackage`。首次加载分包需要联网，已加载模块可读取；清缓存后可能需要再次下载。用户可在设置中准备全部词包。模块运行时自身可能缓存已加载数据，业务缓存上限不等于微信进程内存上限。

参考：[微信分包异步化文档](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/async.html)。本地静态检查使用主包／单包低于 2 MiB、总量低于 20 MiB 的保守门槛；这些不是平台当前最大配额的声明，最终仍以开发者工具上传分析为准。

## 大模型问答扩展接口

实现位于 `miniprogram/core/vocabulary/qa.ts`。默认 provider 为 null，不发网络请求。用户仍可输入问题、使用预设问题、复制问题与当前英文词义。只有主动配置 provider 后才出现发送按钮；不会后台自动发送问题、学习历史或课表。

```ts
interface QuestionRequest {
  version: 1;
  requestId: string;
  question: string; // 非空，最多 1000 字符
  context: { word: string; senseId: string; definition: string };
  language: 'en';
}
interface QuestionAnswer {
  answer: string; // 非空，最多 20000 字符，以纯文本展示
  chinese?: string; // 最多 20000 字符，默认隐藏
  sources: Array<{ title: string; url: string }>; // 最多 20 条，HTTPS
}
interface QuestionProvider {
  ask(input: QuestionRequest): Promise<QuestionAnswer>;
}
```

公共入口为 `configureQuestionProvider(provider | null)`、`questionAvailable()`、`askQuestion(request)`。页面不引用某家模型的 SDK，可以用自定义 provider 或现有 `createHttpProvider(endpoint, getSessionToken)` 适配器。适配器接受自有 HTTPS 后端地址和返回短期应用会话令牌的函数；此令牌不是模型 API key。

未来配置示例（目前没有执行，也没有部署该后端）：

```ts
configureQuestionProvider(
  createHttpProvider('https://YOUR_BACKEND/api/v1/vocabulary/questions', getSessionToken),
);
```

后端合同为 POST，JSON 请求／响应使用上述结构。模型 API key 仅置于后端环境变量；后端必须验证应用身份、限制调用频率与消耗、独立校验输入，并将用户问题及词义视作非可信数据。requestId 用于关联及去重，不是身份凭据。把后端域名加入微信 request 合法域名后，方可真机请求。

当前适配器超时 30 秒；401／403 报认证失败，429 报请求过频，其他非 200 或连接失败报服务不可用。均不自动重试或切换供应商。返回值重新验证，模型正文按纯文本显示，不执行 HTML；模型回答明确标为模型解释，不冒充词典原文。离开页面后的旧响应不覆盖新页面。

后端、登录／令牌获取、真实模型调用、计费和流式输出不在本次实现中；本次交付的是可替换接口、HTTP 适配器及问答界面。

## 验证边界

本次已执行 `npm run check`、`npm test`（54 项全部通过）、`git diff --check` 与文档本地链接检查。含 TypeScript 源码的保守文件统计：主包约 1.07 MiB，最大内容包约 1.38 MiB，总计约 8.71 MiB；这不是开发者工具上传后的精确包体分析。

自动化验证覆盖复习时间和状态、重试及跨日、暂停新词、筛熟恢复、重复反馈、保存失败、备份校验、问答关闭／模拟响应／失败映射、词条引用、原始释义一致性、包体、页面及组件事件绑定。

尚需 Windows 微信开发者工具与真机验收：异步分包真实加载、WXML 渲染、小屏表格与长文、输入键盘、后台切换、离线启动、文件分享、真实设备内存及交互延迟。Linux 单元测试不能代替这些验证，当前也未部署任何在线问答服务。
