# 英文沉浸背词：技术设计

状态：原设计基线，2026-09-14。学习系统已按此方向实现，实际字段、分包方式、问答接口及尚未完成内容见[实现说明](vocabulary-implementation.md)。产品合同与完整示例见[需求与边界](vocabulary-requirements.md)。下述设计类型不直接替代代码中的现行类型。

## 1. 架构与页面

现有应用为 TypeScript 原生微信小程序，无运行时 npm 依赖、服务端或账号。课程存储键为 `xiaojiao.v1`；新增模块不扩展课程 Store，不改其备份解析器，不使用其清空函数处理背词数据。

新增主包轻量页 `pages/vocabulary/vocabulary` 作为“背词” tab，tab 顺序为课表、背词、管理，默认首页仍为课表。词库、学习、详情、熟词／收藏、设置／备份页置于普通分包 `vocabulary/`。tab 页只读小型目录和本地进度摘要，通过导航进入分包，不依赖尚未载入的分包代码。

词库索引随背词分包加载；正文按词条分片放入内容分包，进入学习前通过微信分包加载能力准备必要内容，由统一内容访问层读出。不能将 tab 页直接放入分包。首次下载分包需要网络，“离线”仅保证已准备内容可读；未准备内容提示联网加载，失败不改变学习状态。平台清缓存可能移除资源，不承诺安装后永久离线。

目标规模暂采用静态分包，不搭建 CDN 或在线内容服务。进入整库制作前用估算后的真实结构验证平台当时的单包／总包限制；若完整内容无法容纳，将完整规模发布标为阻塞并修订交付架构，不能偷偷删去五步、少打包词条却显示一万词。

| 页面 | 主要行为 |
| --- | --- |
| 今日学习 tab | 等级选择入口、到期词数、剩余新词、继续学习；首次引导筛熟 |
| 词库 | 分层筛选、前缀搜索及变体命中、快速熟／撤销、详情 |
| 学习 | 复习回忆面／答案面、新词完整内容、三种反馈、熟、收藏、退出保存 |
| 详情 | 词义选择、英文释义、隐藏中文、五步、来源面板、库内查词浮层 |
| 熟词／收藏 | 两个独立筛选视图；熟词重新学习；收藏切换不影响状态 |
| 设置／备份 | 新词量、层级、进度统计、独立导入导出及两次确认清空 |

## 2. 内容数据和内部接口

不新增 HTTP API。以下为计划中的 TypeScript 领域接口；前端不得把供应商原始 JSON 当作业务类型。词典或制作工具凭据只在受控的制作环境使用，不进入小程序、词包、日志或仓库。

```ts
type Level = 'L1' | 'L2' | 'L3' | 'L4';
type LocalDate = string; // 严格 YYYY-MM-DD，北京时间
type Localized = { en: string; zh: string }; // 中文必备，显示状态不持久化
type Permission = 'allowed' | 'denied' | 'unknown';

interface SourceRecord {
  id: string;
  publisher: string;
  dictionary: string;
  editionOrDataVersion: string;
  entryUrl: string;
  sourceSense: string;
  checkedAt: LocalDate;
  attribution: string;
  licenseEvidence: string; // 公开许可链接或受控审核凭证编号，不含密钥
  rights: {
    inAppDisplay: Permission;
    bulkAcquisition: Permission;
    storage: Permission;
    offlineDistribution: Permission;
    translation: Permission;
  };
  cost: 'free' | 'paid' | 'unknown';
}

interface DeepAnalysis {
  picture: Localized;
  spectrum: Array<{
    word: string; // 目标词及 >=3 个不同近义词
    picture: Localized;
    intensity: Localized;
    manner: Localized;
    reversibility: Localized;
    scope: Localized;
  }>;
  register: {
    labels: string[];
    contexts: Array<{ text: Localized; explanation: Localized }>;
  };
  prosody: {
    assessment: Localized;
    collocations: Array<{ phrase: string; explanation: Localized }>;
    evidence: { kind: 'editorial' | 'corpus'; reference?: string; query?: string; checkedAt?: LocalDate };
  };
  network: {
    nodes: Array<{ label: string; entryId?: string }>;
    story: Localized;
  };
  integratedExample: Localized;
  stepMapping: [Localized, Localized, Localized, Localized, Localized];
}

interface Sense {
  id: string;
  partOfSpeech: string;
  definitionEn: string; // 词典原文，不混入编辑改写
  sourceId: string;
  glossZh: string; // 原创辅助解释；直接翻译词典时须有对应权利
  example: Localized; // 原创
  plainEnglishNote?: Localized; // 显式标注编辑补充
  collocations: string[];
  deep?: DeepAnalysis; // L3/L4 每个发布词义必须存在
}

interface WordEntry {
  id: string; // 发布后固定，不从等级或数组下标生成
  headword: string;
  kind: 'word' | 'phrase';
  variants: string[];
  level: Level;
  levelEvidence: string; // 学段来源及版本或编辑分层依据
  cefr?: { value: string; evidence: string };
  topics: string[];
  order: number;
  primarySenseId: string;
  senses: Sense[];
  pronunciation?: { ipa: string; sourceId: string };
  audio?: { asset: string; sourceId: string }; // 独立权利审核通过后才提供
  contentVersion: string;
  editorialReview: { state: 'draft' | 'reviewed'; reviewer?: string; date?: LocalDate };
}
```

内容清单包含 `schemaVersion`、`contentVersion`、各层实际词数、短语数、分片映射和校验摘要。索引只保留 ID、词头、变体、等级、顺序及分片，不携带全部解析。按主等级、编辑顺序、ID 排序，保证相同输入顺序稳定。大小写和首尾空白标准化用于搜索；屈折、英美拼写由显式变体映射，不靠删词尾猜测。多个同形结果展示对应词条，不静默选错。

内部内容接口固定为 `search(query, levels)`、`getEntry(id)`、`prepareContent(ids)`、`getManifest()`；未知 ID 返回可识别的 missing 状态，内容加载失败返回 unavailable，不伪造空词义。正文以纯文本及结构化表格渲染，不执行外部 HTML。

来源注册表可以在多个词义间复用。音标、音频及其他素材通过资产清单记录各自许可范围；仅释义来源合格不能连带放行音频。译自词典的内容需确认 translation 权限，自主编写的中文教学补充明确标为原创。

## 3. 用户状态、持久化和兼容

```ts
type Rating = 'unknown' | 'fuzzy' | 'known';
interface WordProgress {
  entryId: string;
  state: 'learning' | 'review' | 'familiar'; // 无记录即 new
  stage: number; // -1 尚未进入间隔；0..5 对应间隔表
  dueDate?: LocalDate; // familiar 不可有到期日
  firstStudiedAt?: string; // ISO 时间
  lastReviewedAt?: string;
  familiarAt?: string;
}
interface ReviewEvent {
  id: string; // 每次卡片尝试的固定 ID，重复提交复用
  entryId: string;
  at: string;
  localDate: LocalDate;
  mode: 'new' | 'review' | 'retry';
  rating: Rating;
  previousStage: number;
  nextStage: number;
}
interface VocabularyStore {
  schemaVersion: 1;
  contentVersion: string;
  settings: { dailyNewLimit: number; levels: Level[] };
  progress: Record<string, WordProgress>;
  favorites: string[];
  recentEvents: ReviewEvent[];
  daily: Record<LocalDate, {
    newIds: string[];
    reviewedIds: string[];
    reviewAttempts: number;
    spellingCorrect: number;
    spellingAttempts: number;
  }>;
  session?: {
    id: string;
    date: LocalDate;
    pending: Array<{ entryId: string; mode: 'new' | 'review' | 'retry'; attemptId: string }>;
    retryCount: Record<string, number>;
    failedIds: string[];
    lastAppliedAttemptId?: string;
  };
}
```

存储键使用 `xiaojiao.vocabulary.v1`。设置、状态、事件、统计和队列在内存中生成新快照，完整校验后一次 `wx.setStorageSync` 写入；成功后才更新界面，失败维持旧状态并提示重试。限制所有状态修改串行执行；当前 attemptId 已完成或不属于当前待处理卡片时拒绝重复提交。进入后台前不依赖额外写入，完成每张卡即持久化。

最近事件最多保留 1,000 条用于排错，按日聚合统计保留；去重依赖当前队列 attemptId 的消费状态，不依赖无限日志。首次回答新词即记为今日新学，不论反馈；复习词数按 ID 去重，重试计入次数但不重复计词。熟词数量直接由当前状态计算，不把熟操作记作新学或复习。无需保存中文展开状态。

点击“熟”保留词条原有历史统计，仅移除其待处理队列与到期日。当前页提供一次撤销，保存操作前完整的该词状态与队列快照；离开页面或下一次状态操作后撤销入口失效，避免覆盖后续修改。熟词本“重新学习”不是撤销：设为 learning、stage=-1、dueDate=今天，作为恢复学习任务，不消耗新词配额；旧历史不删除。

备份为独立 JSON：`kind: 'xiaojiao-vocabulary'`、`backupVersion: 1`、`exportedAt` 和 `store`。仅含用户状态，不导出词典正文、资源文件或凭据。恢复先校验、预览数量与未知 ID，再确认整体替换背词数据。默认限制文件 5 MiB、进度 20,000 条、最近事件 1,000 条；超限拒绝且保留原数据。未来提高限制需版本化评估，不静默截断。

内容更新通过固定 ID 保留熟词、收藏和学习进度；已撤下或备份带来的未知 ID 保留为孤立记录，计入“暂不可用”并排除队列，不删除。当前内容版本的分级用于展示；词义变化不自动重置整词状态。未知 schemaVersion 不自动降级；存储损坏时提供原始数据导出和显式清空，不自动覆盖。无需登录，不上传学习、课表或备份数据；清缓存、卸载、换机不会自动恢复。

## 4. 复习规则与队列

首版采用公开透明的固定间隔规则，不称为自适应记忆模型，也不输出未经校准的“记忆概率”。时间函数接受传入的时钟，按 UTC+8 得到学习日，不受设备所在时区影响；设备时钟不可信，但首版不联网校时，不涉及排名奖励。

间隔数组为 `[1, 3, 7, 14, 30, 60]` 天。stage=-1 表示还未通过首次认识反馈；stage=0 表示下次间隔 1 天，依此类推。

| 反馈 | 下个状态与日期 | 当轮行为 |
| --- | --- | --- |
| 认识 | stage 加 1，上限 5；review；今天加该 stage 间隔 | 移出本轮；stage=5 后仍每 60 天复习 |
| 模糊 | stage 不变；learning；明天到期 | 移出本轮，不升级 |
| 不认识 | stage=-1；learning；明天到期 | 加入当轮重试，额外最多 2 次 |
| 熟 | familiar；移除 dueDate | 删除当前词的全部本轮及未来待复习项 |

同一学习日内一旦该词出现“不认识”，后续重试用于纠错，不升级间隔，即使重试认识也保持 stage=-1、明天到期；避免在几分钟内连跳多个阶段。模糊或认识会结束该词当轮重试。重试放在至少三个其他待处理词之后；若其他词不足三个，结束现有队列后再呈现。首次回答加最多两次重试，总共不超过三次。

今日队列由全部等级已学词的到期项（dueDate<=今天）、熟词恢复项、所选等级的新词构成。已学词不因取消等级选择而漏复习；等级设置只影响新词。到期项按到期日、ID 排序，再排新词。新词限额扣除今日 newIds，熟操作不消耗配额；没有选等级时默认 L1，设置界面不允许空选。默认不是将 L1 全部背完才能选 L4。

退出再进入恢复 session，重新剔除熟词、不可用词和已消费尝试；跨日丢弃旧的展示队列，依据持久化进度重新构建，旧日历史保留。调低配额只移除未开始新词，不能回滚已学习记录。新词学习使用 primarySenseId；切换词义浏览不单独生成学习事件，整词进度不等于所有词义都经测试。

拼写答案去除首尾空白、统一英文大小写，短语内部连续空白归一；接受显式登记的词头及变体。不做模糊拼写匹配，不将近义词视为正确答案。该练习可随时退出，提交时独立防重复，只更新拼写统计。

## 5. 内容制作与发布校验

流程：来源及免费使用范围确认 → 合法词表整理和去重 → 词义与分级整理 → 原创中文辅助、例句、五步草稿 → 自动结构校验 → 人工语言审核 → 发布清单及资产权利审核 → 静态分包发布。

自动校验应拒绝：重复 ID、失效引用、主词义不存在、空释义、无来源、缺少免费展示／存储／分发依据、L3/L4 缺五步、目标词加近义词不足四行、语境数量不符、搭配数量不符、关联节点不足三个、五步映射不满五项、示例长度不符、未审核状态。批量获取实际发生时还需 bulkAcquisition=allowed；没有批量获取行为的手工整理记录必须留存获取方式，不能靠省略字段逃避许可核验。

英文示例计数规则：按英文词序列计数，内部撇号和连字符算同一词，忽略独立数字及标点；验证表达式为 `[A-Za-z]+(?:['’-][A-Za-z]+)*`。例句包含词头或登记变体；带 corpus 声明必须有语料来源、检索式和核查日期。人工审核负责语义、语域、搭配、画面准确性及英文可理解性，自动检查通过不能代替语言审核。

权利检查与语言检查独立；`reviewed` 不代表自动授权。制作记录保存来源版本、编辑／审核人、审核日期、修改记录和许可凭证。无授权的原文不提交到公开仓库；原创演示内容与正式内容分开，正式发布验证不得允许跳过许可检查的演示开关。

## 6. 验证计划与发布门槛

| 层次 | 必须验证 |
| --- | --- |
| 纯逻辑 | 间隔推进、上限、模糊、不认识重试及两次限制；日期跨月跨年、北京时间午夜、重复事件；熟／撤销／恢复；配额与跨等级去重 |
| Storage 模拟 | 写入失败不前进，损坏数据不覆盖，重启继续，未知版本拒绝，备份恢复隔离，内容删除保留孤立记录 |
| 内容校验 | 数量、引用、五步、英文示例长度、来源及权利、未审核拒绝；故意损坏样本必须被拦截 |
| 页面静态 | tab 与分包路由、事件绑定、中文默认隐藏、来源及熟词操作可达 |
| 开发者工具／真机 | 小屏与长表格、五步滚动、中文展开重置、查词浮层返回位置、键盘、后台重启、断网与未加载分包、存储失败、文件分享 |
| 整库性能 | 用约一万词和完整五步数据记录各包体积、冷／热加载、查询延迟和存储占用，写入测试设备型号及版本 |

后续代码实现执行 `npm run check`、`npm test`，修改 TypeScript 时按现有惯例提交生成的 JavaScript。本次只有 Markdown，检查链接、内容一致性与 `git diff --check` 即可，不为文档创建镜像测试。

整库验收的产品目标：已加载内容下，搜索响应和下一词切换的 p95 各不超过 300ms，进入背词已加载首页不超过 1s；在一台真实 iOS 和一台真实 Android 设备上各连续采样 30 次，记录设备与微信版本。首次网络下载时间单列，不计入离线切换耗时。平台体积配额按发布时官方文档核对，不得凭旧限制宣布通过。用户状态及备份上限之外的规模需另做压力验证。

发布门槛有四项：功能验收通过、语言审核通过、免费离线使用许可明确、目标内容规模通过平台和设备测试。2026-09-14 已按用户指定下载 Open English Wordnet 2025，确认官方 CC BY 4.0 许可；来源阻塞 B1 已解除，接入时须保留署名、许可链接及修改说明。其余三项尚未完成，不能将原始词库下载视为分级万词库或功能已发布。数据位置与校验结果见[数据说明](../data/wordnet/README.md)；后续适配器需将 entries 与 synset 文件关联为本设计的词条／词义结构，不直接将所有原始 JSON 放入小程序。

不新增远程埋点。运行错误以本地可理解提示呈现；开发验收记录失败场景，用户可主动导出不含内容正文的备份用于排错。词库版本回退不删除用户状态，未来不兼容的数据迁移必须先备份、提供迁移校验和失败保留路径。
