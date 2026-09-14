# 英文沉浸背词：需求与边界

状态：最终产品需求；学习系统已实现，整库教学内容及真机验收尚未完成。确认日期：2026-09-14。实际覆盖与差异见[实现说明](vocabulary-implementation.md)，原技术方案见[技术设计](vocabulary-design.md)。

## 1. 目标与已确认决策

在“小交课表”原生微信小程序中加入独立背词模块，服务希望减少基础词重复学习、逐步提升英语理解与表达能力的学生。核心特色是英文解释英文，以及有明确顺序的五步深度解析。

| 事项 | 已确认要求 |
| --- | --- |
| 学习目标 | 面向雅思 8.0 的词汇能力培养；不是分数预测或保分工具 |
| 完整词库 | 约 10,000 个去重单词，四层分级；不是首批内容已完成的声明 |
| 基础词 | 中国小学、初中词合并为一层，便于快速筛熟 |
| 熟词 | 点击“熟”整词跳过，所有等级可用，可撤销、可恢复学习 |
| 内容方式 | 提前制作、审核、打包；用户学习时不调用在线 AI |
| 释义来源 | 权威词典，且必须免费合法使用；许可未落实就阻塞正式内容发布 |
| 深度学习 | 大学与雅思核心层、雅思高阶层提供完整五步及综合示例 |
| 语言 | 学习内容默认英文；中文逐项展开，操作界面使用中文 |
| 本轮交付 | 需求、技术设计和 README 文档入口；不实施小程序功能 |

雅思词汇能力还涉及准确性、搭配、语域和灵活运用。官方讨论的约 8,000–9,000 个词族阅读覆盖量是研究背景，不是“雅思 8 分词数线”，也不等于本产品按词条统计的 10,000 个单词。[IELTS 官方说明](https://ielts.org/news-and-insights/how-to-address-vocabulary-in-an-ielts-preparation-course)

## 2. 词库分层与计数

| 等级 | 显示名称 | 学习目的 | 内容要求 |
| --- | --- | --- | --- |
| L1 | 基础词：小学／初中 | 快速识别已熟悉的常用词，补齐基础 | 英文释义、词性、例句、隐藏中文 |
| L2 | 高中衔接 | 扩展一般阅读和表达 | 简洁词卡、典型搭配、隐藏中文 |
| L3 | 大学与雅思核心 | 理解常见议题，提升搭配和表达准确性 | 基础字段及完整五步、综合示例 |
| L4 | 雅思高阶 | 训练细微差别、学术及正式语境 | 基础字段及完整五步、综合示例 |

分级是编辑分类，不宣称官方雅思分级。学段标签必须记录所依据的课程标准或有合法使用权的词表及版本；CEFR 标签只有来源支持时才填写，不将中国学段机械换算为 CEFR。现阶段不预设各层配额，也不以低价值生僻词凑足总量。

一个规范词头对应一个稳定词条，可含多词性、多词义。屈折变化和拼写变体挂在词条下，不重复计数；派生词如具有独立词头可单列；多词短语单列并单独统计，不灌入单词总数。每词仅有一个主等级，可有多个议题标签，跨词表出现不得重复创建学习进度。高阶用法可以属于基础词，但整词标熟仍会一并跳过，恢复后可查看所有已收录词义。

每次发布显示实际词数、各层覆盖量、版本和未覆盖范围。约一万词是最终规模目标，样本不能包装成完整词库。

## 3. 页面与日常学习

新增“背词”导航入口，内部包含今日学习、分级词库、词条详情、熟词本／收藏、学习设置与备份。课表仍为默认首页。

1. 初次进入可选择一个或多个等级，并提示先筛基础熟词；允许跳过筛选直接学习，不强迫重新背小学词。
2. 默认每日 20 个新词，可设为 0–100 的整数；0 表示暂停新词，到期复习继续提供。
3. 今日学习先复习到期词，再学新词；可随时结束并保留已完成进度，不以连续打卡惩罚用户。
4. 复习先展示词头，用户主动回忆后点击“看释义”，再按“不认识／模糊／认识”反馈。新词先展示英文词卡；L3、L4 按顺序呈现全部五步与综合示例，不强制计时，也不把滚动到底当作掌握。
5. 完成页分别显示今日新学、复习词数、复习次数、熟词数和待复习量。熟词不是测试掌握；进入最长复习间隔也不宣称永久掌握。

“熟”在筛词、详情和学习过程中均可点击，独立于“认识”。保存成功后即退出所有学习队列，显示撤销入口；熟词本支持搜索和“重新学习”。首次使用明确说明“将跳过这个单词的全部已收录词义”。首版不提供整层一键标熟。收藏与学习状态相互独立，收藏不会自动改变复习日期。

提供可选拼写练习：先给英文释义或原创语境提示，再输入词头；错误时展示正确拼写。不强迫先看中文；拼写练习结果独立统计，不自动改变主复习安排。搜索覆盖已发布词条的词头、变体和短语，不承诺任意输入词都能在线查到。

## 4. 英文优先与深度解析合同

学习区的释义、例句、五步正文、表格、解释说明均先显示英文。每个内容块有独立“显示中文／隐藏中文”，进入下一个词或重新进入详情后全部恢复隐藏；中文不得通过题目、预览或提示提前泄露。标题可使用中文步骤名帮助导航。英文难度尽量低于目标词的理解难度；不得为了简化而改写后仍冒充词典原文。必要的原创简明解释与词典释义分栏标注。

英文内容中的词可打开库内查词浮层，返回保留原页面位置；查不到时提示未收录，不触发在线查询。此入口不能形成强制跳转链。学习素材来源、授权和编辑说明放在“来源”面板，避免干扰主学习流程。

以下合同对 L3、L4 每个收录词义生效。多义词分词义呈现，不能将不同词义的近义词或语域混成一组；主学习流程首先学习编辑指定的重点词义，详情保留其他词义入口。

| 顺序 | 必须输出 | 验收要求 |
| --- | --- | --- |
| 1. 画面锚定 | 具体场景、颜色、质感、动作，允许戏剧或幽默 | 画面能体现当前词义；首版纯文字，不能只说“想象一个画面” |
| 2. 语义场对比 | 至少 3 个不同近义词，与目标词共同组成画面光谱 | 比较强度、方式、可逆性、范围；不适用的维度说明不适用，不制造绝对排序 |
| 3. 语域感知 | 语域标签、1–2 个原创典型语境、适合或不适合的原因 | 区分口语、正式书面、学术、文学、俚语等，允许多标签 |
| 4. 语义韵感知 | 倾向说明、2–3 个典型搭配及各自解释 | 区分不良事物与积极缓解行为；没有频次证据不得声称“最常见”或已验证 COCA |
| 5. 联想网络 | 至少 3 个相关词或概念，以及完整微型故事或逻辑链 | 预制内容写“相关词／概念”，不能声称用户已学过；库内关联可点击 |
| 6. 综合示例 | 50–100 个英文单词的原创段落，以及五步对应说明 | 虽原提示写可选，本产品固定提供；“字”按英文单词数落实，中文翻译不计入 |

基础层与高中衔接层不强制五步；若提供五步，也须遵守同一完整性合同。首版不因用户点熟而删减词条内容，熟词仍可完整浏览。

### 内容制作模板

```text
Word / part of speech / selected sense / level:
Authoritative English definition:
Dictionary / edition / entry URL / checked date / permission evidence:
Original plain-English note (optional, explicitly editorial):
Chinese support (hidden by default):

Step 1 — Picture anchor:
Scene + colour + texture + action + connection to this sense.
Step 2 — Semantic spectrum:
Target + at least 3 neighbours; intensity, manner, reversibility, scope.
Step 3 — Register:
Labels + 1–2 original contexts + explanation of fit.
Step 4 — Semantic prosody:
Tendency + 2–3 collocations + explanation + evidence status.
Step 5 — Association network:
At least 3 related words/concepts + a connected story or chain.
Integrated example:
50–100 English words + explicit mapping to Steps 1–5.

Chinese support for each block (hidden separately):
Editorial references / reviewer / review date / content version:
```

### 填充示例：mitigate

以下为设计说明样例，不是已授权发布的词库条目，也未经过独立语言审核。短引文来源核查于 2026-09-14；除该引文外，下文均为原创教学示范。将该词用于正式离线词包前仍须解决授权及人工审核。

**Word:** mitigate · verb · L4（产品示例分级）。**Selected sense:** reducing the severity of something bad.

**Dictionary definition:** “to make something less harmful, unpleasant, or bad”. — [Cambridge Dictionary](https://dictionary.cambridge.org/us/dictionary/english/mitigate)。这段引文仅说明释义展示方式，不构成批量存储许可。

<details>
<summary>显示中文：词义</summary>

减轻、缓和有害或令人不快的情况；不等于消除问题。
</details>

#### Step 1 — Picture anchor

Imagine a bright red flood rushing towards a tiny library. A librarian in yellow boots stacks rough, heavy sandbags across the doorway. Muddy water still seeps through, but the roaring wave becomes a shallow trickle. A rubber duck floats safely past the lowest bookshelf. The bags mitigate the damage: they make the flood less harmful without stopping the storm.

<details>
<summary>显示中文：画面锚定</summary>

鲜红色的洪水冲向小图书馆，穿黄靴子的管理员用粗糙沉重的沙袋堵住门口。水仍渗入，但巨浪变成浅流，一只橡皮鸭漂过最低层书架。沙袋减轻损害，却没有让暴风雨消失。
</details>

#### Step 2 — Semantic spectrum

These pictures compare typical uses, not a fixed scale of strength.

| Word | Picture and manner | Intensity or outcome | Reversibility | Typical scope |
| --- | --- | --- | --- | --- |
| mitigate | Sandbags soften the impact of a flood | Harm becomes less severe; removal is not promised | The word itself does not say whether the change lasts | Harm, risks, damaging effects; often formal |
| alleviate | Someone lifts part of a heavy backpack | Suffering or a burden becomes easier to bear | Relief may be temporary; duration needs context | Pain, distress, poverty, pressure |
| reduce | A dial moves from eight to four | An amount or degree becomes smaller; not necessarily something bad | The word does not specify whether it can rise again | Broad: cost, speed, quantity, risk |
| ease | A tight knot slowly loosens | Difficulty, discomfort or tension becomes less intense | The improvement may last or fade | Pain, tension, restrictions, everyday difficulties |

<details>
<summary>显示中文：语义场对比</summary>

mitigate 像沙袋缓冲冲击，重在减轻不良影响；alleviate 像卸下一部分重担，重在缓解痛苦或负担；reduce 像调低刻度，泛指数量或程度减少；ease 像松开绳结，重在舒缓困难或紧张。这些词本身都不保证结果永久，也不存在固定的强弱排名。
</details>

#### Step 3 — Register

**Register:** formal writing, policy discussion and academic explanation. It is possible in speech, especially when discussing technical problems.

**Original report-style sentence:** “The council introduced drainage measures to mitigate flood damage.” The word fits a report evaluating the effects of an intervention.

**Original conversation:** “Let's put towels by the door to make the flooding less bad.” This simpler wording is more natural in casual conversation; “mitigate the damage” would sound unusually formal, though it would still be understandable.

<details>
<summary>显示中文：语域感知</summary>

适合正式报告、政策讨论和学术解释，也可用于技术性口语。市政报告讨论排水措施减轻洪灾损失时很合适；朋友临时拿毛巾挡水时，简单说“让情况不那么糟”通常更自然，不代表 mitigate 在口语中语法错误。
</details>

#### Step 4 — Semantic prosody

Mitigate often takes an undesirable situation or effect as its object. The surrounding problem is negative, while the act of limiting it is usually presented as helpful. This is not a claim that the word is always emotionally positive.

- **mitigate risk:** presents a possible bad outcome as something to limit, not necessarily eliminate.
- **mitigate damage:** focuses on reducing harmful consequences rather than undoing everything that happened.
- **mitigate the effects:** needs context; in this sense, the effects being discussed are undesirable.

**Evidence status:** editorial examples illustrating the selected sense; no corpus frequency ranking or COCA query has been performed.

<details>
<summary>显示中文：语义韵感知</summary>

宾语通常是风险、损害或不良影响；问题本身偏负面，减轻它的行动通常有帮助。不能据此把这个词简单判为“永远正面”。三个搭配是教学示例，未作语料频次排名。
</details>

#### Step 5 — Association network

**Related concepts:** forecast → prepare → barrier → damage.

A forecast warns the librarian about a storm. She prepares sandbags and builds a barrier. The storm still arrives, but fewer books get wet. Preparing a barrier helps mitigate damage. These are related concepts, not a claim about words you have already studied.

<details>
<summary>显示中文：联想网络</summary>

预报提醒管理员暴风雨将至，她准备沙袋并搭起屏障。风雨照常到来，但浸湿的书更少了：预报 → 准备 → 屏障 → 损害，用准备和屏障减轻损害。这些是相关概念，不假设用户已学过。
</details>

#### Integrated example

When the forecast warned of heavy rain, Maya helped prepare the village library. She carried rough sandbags to the door and built a low barrier. The storm still flooded the street, but the bags helped mitigate the damage inside. In her report, Maya explained that the barrier reduced the flow of water; it did not eliminate the danger. Next time, the village would need better drainage as well as emergency supplies.

**Mapping:** Step 1 appears in the rough sandbags and moving water. Step 2 appears in reducing harm without eliminating danger. Step 3 appears in Maya's report. Step 4 appears in “mitigate the damage”. Step 5 connects forecast, prepare, barrier and damage.

<details>
<summary>显示中文：综合示例与说明</summary>

预报提示大雨，玛雅帮村里的图书馆做准备，把粗糙的沙袋搬到门口筑起矮屏障。街道仍被淹没，但沙袋减轻了室内损害。她在报告中说明：屏障减少了进水，没有消除危险；下次还需要更好的排水设施和应急物资。画面是沙袋与水流，对比是减轻而非消除，语域是报告，搭配是减轻损害，联想链连接预报、准备、屏障与损害。
</details>

## 5. 来源、版权和真实性边界

正式词条必须保留词典名称、版本或数据版本、词条链接、词义定位、核查日期及许可凭证。展示署名和归属；不能声称与词典方合作或获得背书，除非确有依据。

**B1 更新（2026-09-14）：用户指定 Open English Wordnet，英文释义的免费离线来源已落实。** 已从[官方下载页](https://en-word.net/downloads)下载 2025 标准版 JSON，并验证压缩包及全部 JSON。官方明确使用 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)；保留署名、许可链接并说明改动后可复制、改编及离线分发。原始数据、许可及校验记录见[数据说明](../data/wordnet/README.md)。它是用户接受的开放词汇语义来源，不标称剑桥、牛津词典；分级词表、内容审核和五步制作仍未完成。原先“没有免费离线来源”的阻塞解除，不代表功能或一万词教学内容可发布。

韦氏 API 的免费条件包括非商业、每日每部参考作品不超过 1,000 次查询、最多两部参考作品；条款另限制未经书面批准的自动化或录制查询。因此不能把免费额度解释为批量建库、存储或离线分发许可。[官方条款](https://dictionaryapi.com/info/terms-of-service)

剑桥 API 的初始条款限定评估用途，实际应用需申请对应密钥；FAQ 将存储及离线设备使用列为需要协商许可的情况。免费访问网站不等于可复制其词库。[API 条款](https://dictionary-api.cambridge.org/api/terms-and-conditions) · [FAQ](https://dictionary-api.cambridge.org/api/faq)

首版来源锁定用户指定的 Open English Wordnet 2025，直接使用其官方离线发行包。新增来源时仍须逐项确认应用展示、批量获取、存储、离线分发、翻译及署名条件；缺少证据的权限记为 unknown，不能默认允许。以上韦氏、剑桥记录保留为其他来源的比较依据，不再作为本项目必须等待其授权的前提。

音频、音标、例句、图片和词表的权利分别核实；首版不引入图片素材，音频许可未落实时不显示播放按钮。原创五步可由 AI 辅助草拟，但必须标注编辑属性并人工复核。无语料检索就不声称已查语料，无权威出处就不冒充词典释义；网络访问受限时不绕过限制。

## 6. 验收、发布与范围控制

| 编号 | 验收场景与预期 |
| --- | --- |
| A1 | 基础词合并展示；层级切换与重复词表不创建重复进度 |
| A2 | 点击熟后当前词立即移出所有队列；撤销恢复先前状态；熟词本可重学 |
| A3 | 英文释义、解析、题目默认无中文答案；按块展开后切换词条再次隐藏 |
| A4 | L3、L4 所有发布词义五步齐全；至少 3 个近义词、1–2 个语境、2–3 个搭配、3 个关联概念 |
| A5 | 综合示例 50–100 个英文单词，包含目标词或登记词形，并逐项解释五步 |
| A6 | 到期复习优先；新词额度、三种反馈、重试上限、跨日和重复操作结果符合技术设计 |
| A7 | 离线重启恢复进度；内容尚未下载不可冒充可离线学习；写入失败不显示成功 |
| A8 | 背词备份恢复、清空与课表相互隔离；损坏或未来版本数据不覆盖现有数据 |
| A9 | 每条正式释义均有来源、许可证据和审核；未授权内容、伪造语料频次、演示占位不能发布 |
| A10 | 搜索、收藏、拼写与熟词状态独立；统计不把点击熟算作测试掌握 |
| A11 | 完整词库单独通过包体、设备存储、启动和搜索性能验收，不用少量样本替代 |

分期：先落地本套文档；后续开发用少量许可明确的内容验证端到端流程；授权及内容审核完成后再逐步扩充至目标规模。每期分别报告实现状态、许可状态、实际内容数量、自动化验证和真机验证。

首版不提供在线生成任意单词解析、用户已学词的 AI 个性化故事、联网词典查询、云同步、排行榜、广告、付费功能、发音评分或雅思成绩推算。未来引入其中任一项需修订需求、隐私和成本边界。

## 7. 设计参考与核查记录

下列为官方资料，核查日期 2026-09-14。产品参考只提取公开的行为理念，不复制内容或专有算法。

| 来源 | 本设计使用方式 | 核查范围 |
| --- | --- | --- |
| [不背单词](https://www.bbdc.cn/) | 原创语境与词汇用法结合 | 官方页面的语境学习理念；未实测其客户端 |
| [墨墨百科](https://memodocs.maimemo.com/docs/support_wordmachine) | 记忆反馈、间隔复习和进度反馈 | 公开说明；本产品不用其专有算法 |
| [IELTS](https://ielts.org/news-and-insights/how-to-address-vocabulary-in-an-ielts-preparation-course) | 区分词汇规模与运用能力 | 不据此推导官方 8 分词表 |
| [韦氏学习词典 API](https://dictionaryapi.com/products/api-learners-dictionary) | 权威学习型内容候选 | 产品页可访问；不等于已获许可 |
| [韦氏条款](https://dictionaryapi.com/info/terms-of-service) | 免费条件与自动化查询限制 | 本次已读取条款；正式接入前复核 |
| [剑桥开发页](https://dictionary.cambridge.org/develop.html)、[条款](https://dictionary-api.cambridge.org/api/terms-and-conditions)、[FAQ](https://dictionary-api.cambridge.org/api/faq) | 评估、存储及分发边界 | 搜索可见官方摘要；FAQ 本次直接读取返回 403，未声称完整审阅 |
| [Cambridge: mitigate](https://dictionary.cambridge.org/us/dictionary/english/mitigate) | 示例中的短释义引文 | 官方搜索结果核对；不是离线发布许可 |

正文中的搭配、语域和故事为原创教学分析，未声称经过语料统计或独立语言专家验收。
