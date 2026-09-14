# Open English Wordnet 2025

2026-09-14 从[官方下载页](https://en-word.net/downloads)直连下载标准版 JSON，未启用临时代理。标准版面向普通词汇；本次不下载额外收录专有名称的 plus 版。

- 原始文件：`english-wordnet-2025-json.zip`，9,986,555 字节。
- 解压目录：`json/`，73 个 JSON 文件，共 72,404,635 字节；全部通过 JSON 解析和 ZIP CRC 检查。
- 顶层词头键合计 128,009；同义词集（synset）107,558。前者包含短语等，不等于产品去重单词数或雅思词汇量。
- SHA-256：`7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51`。这是本地校验值，未与发布者签名或校验文件比对。
- 机器可读来源记录：[source.json](source.json)。许可全文：[CC-BY-4.0.txt](CC-BY-4.0.txt)。

## 署名与使用

Open English Wordnet 2025, by the Open English Wordnet Community, derived from Princeton WordNet. Source: https://en-word.net/downloads . Licensed under Creative Commons Attribution 4.0 International: https://creativecommons.org/licenses/by/4.0/ .

本目录保留原始压缩包，解压内容未修改。后续筛选、格式转换、翻译或改编须保留署名和许可链接，并说明修改。不得暗示原作者认可本产品，也不得对许可覆盖的内容附加与许可冲突的限制。官方发布的开放许可支持免费复制、改编和离线分发，不需要将免费 API 额度作为获取途径。

## 接入边界

用户已指定此资源作为英文释义来源。它是开放词汇语义资源，具有英文释义、词义及语义关系；不是剑桥或牛津学习词典，也不是现成的分级雅思词书。词条筛选、学段依据、英文可理解性审核、中文辅助和五步解析仍需制作；不能假定每个词都有三个合适近义词或足够例句。

原始数据在小程序目录之外，完整原料约 69 MiB。已从中筛选 10,000 个词头及其词义接入应用，见[实现说明](../../docs/vocabulary-implementation.md)；原料下载不等于全部教学内容已完成。压缩包和解压副本通过本目录 `.gitignore` 排除日常 Git 提交，来源记录和许可说明可提交；文件仍保留在本地供后续处理。
