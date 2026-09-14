# 背词内容构建输入

- `selection.json`：固定的 10,000 个 OEWN 词头，来源为 Robyn Speer 的 wordfreq 3.1.1 英文词频顺序，结合 `basic.tsv` 的原创基础词清单及少量编辑筛选。英文词频是一般使用背景，不是中国学段或雅思等级证明。
- `basic.tsv`：原创的中文词头提示和基础词学习顺序。提示不是各个词义的逐条翻译。
- `deep.json`：8 个原创英文五步解析及中文辅助，含 50–100 词示例，按 OEWN senseId 绑定。标为 editorial，不声称已通过独立专家或语料频次审核。
- `wordfreq-NOTICE.md`：完整的上游署名与许可说明。wordfreq 数据 CC BY-SA 4.0，词频派生的筛选索引及编排按相同许可提供。原 WordNet 释义保留 CC BY 4.0，不冒充 wordfreq 提供的释义。
- `build-report.json`：实际构建的版本、覆盖量、分包字节数及本地 SHA-256。

构建方式及限制见[实现文档](../../docs/vocabulary-implementation.md)。生成数据是筛选和格式转换的结果，保留全量已收录词义；没有为缺失例句、中文或五步自动编造文本。

署名：Robyn Speer, wordfreq 3.1.1, https://github.com/rspeer/wordfreq 。致谢免费开放的 SUBTLEX 数据及 Marc Brysbaert 等作者、OpenSubtitles、Google Books Ngrams、Wikipedia、Leeds、ParaCrawl 等，详情见 NOTICE。许可：https://creativecommons.org/licenses/by-sa/4.0/ 。原始英文释义：Open English Wordnet Community，源自 Princeton WordNet，https://en-word.net/downloads ，https://creativecommons.org/licenses/by/4.0/ 。未暗示上述作者为本产品背书。
