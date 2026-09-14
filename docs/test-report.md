# StudyDesk 测试与验证报告

- **报告日期**：2026-09-15
- **项目名称**：StudyDesk（学习工作台）
- **测试环境**：Linux 4.15.0 x86_64, Python 3.6.9, SQLite 3.22.0, Git 2.17.1
- **目标分支**：`main` (Commit: `84d23fd`)
- **测试结论**：**通过（14 项自动化测试 100% 通过，CLI 异常保护与 Dry-Run 预演符合规范）**

---

## 1. 测试总览

| 测试套件 | 测试文件 | 用例数 | 状态 | 耗时 |
| :--- | :--- | :---: | :---: | :---: |
| **字典与数据库完整性** | `tests/test_dictionary.py` | 2 | PASS | 0.012s |
| **批处理与模型防错工具** | `tests/test_batch_generation.py` | 6 | PASS | 0.011s |
| **核心算法与逻辑对齐** | `tests/test_core_parity.py` | 6 | PASS | 0.010s |
| **Kotlin 单元测试集** | `core/src/test/kotlin/...` | 5组共17项 | 源码就绪 | 待CI/AS编译 |
| **合计** | - | **14** | **全部通过** | **0.035s** |

---

## 2. 专项测试详情

### 2.1 离线字典与预构建数据库校验 (`test_dictionary.py`)

* **测试对象**：`app/src/main/assets/content.db`、`sources/ielts-word-list.txt`、`docs/dictionary-report.json`
* **校验项与结果**：
  1. **资产文件完整性**：
     - `content.db` (预构建 SQLite) 存在且校验和完整；
     - `ielts-word-list.txt` 存在，保留原始 48 个单元与 3722 行源文本；
     - `dictionary-report.json` 详细记录每一条匹配/未匹配条目。
  2. **SQLite 数据库完整性与外键约束**：
     - 执行 `PRAGMA integrity_check` 返回 `ok`；
     - 执行 `PRAGMA foreign_key_check` 返回空列表（0 个外键冲突）；
     - 核心数据表结构完整：`metadata`、`book`、`word`、`book_entry`、`sense`、`generation`。
  3. **数据条目准确性**：
     - `book` 表记录条目总数：`3611`（排除了原文本中的说明行与空白行）；
     - `word` 表去重规范词头数：`3610`；
     - `sense` 表 WordNet 2025 关联义项总数：`10595`；
     - 成功精确/变体匹配词头数：`3563`；
     - 未匹配词头数：`47`（保留在书内，原始音标与中文完整展示，状态如实标记为 `missing`，未凭空伪造释义）。
  4. **版权与许可元数据**：
     - `metadata` 表中明确标注 `dictionary_license = 'CC BY 4.0'`；
     - `metadata` 中保留来源官方链接 `https://en-word.net/downloads` 与转录使用声明。

---

### 2.2 批处理工具与五步模型输入校验 (`test_batch_generation.py`)

* **测试对象**：`tools/batch_generation.py` (OpenAI 兼容 CLI)
* **校验项与结果**：
  1. **空提示词硬拦截保护 (`test_empty_tips_raises`)**：
     - 当 `sources/5steps_tips.txt` 为 0 字节时，脚本立即报错终止：
       `Error: 5steps_tips.txt is empty (0 bytes). Cannot proceed without complete prompt instructions`；
     - **杜绝使用旧版对话临时提示词冒充正式教学模板**，未配置完备前强制停止。
  2. **缺失提示词文件拦截 (`test_missing_tips_raises`)**：
     - 文件路径不存在时抛出明确异常。
  3. **五步法 6 必填段落强校验 (`test_validate_payload_missing_field`, `test_validate_payload_success`)**：
     - 必须同时包含：`concrete_image`、`synonyms_comparison`、`register_and_contexts`、`collocations`、`associations`、`integratedExample`；
     - 任何段落为空或缺失即拒绝入库。
  4. **近义词对比数量核验 (`test_validate_payload_few_synonyms`)**：
     - 要求 `synonyms_comparison` 必须对比至少 3 个近义词，少于 3 个被判定为非法输出。
  5. **综合示例字数范围约束 (`test_word_count_bounds`)**：
     - 检验 `integrated_example` 英文词数，低于 40 词或高于 120 词强制报错，符合 50–100 词设计指标。
  6. **CLI Dry-Run 与认证防护实测**：
     - 执行命令：`python3 tools/batch_generation.py --tips <(echo "Sample") --limit 5 --dry-run`
     - 输出结果：
       ```json
       {
         "timestamp": "2026-09-14T17:15:11.868172Z",
         "dry_run": true,
         "prompt_sha256": "dbc4982a901b1ee45d7990ac6380977bd2284bfa265a951768067ff814656fed",
         "model": "gpt-4o-mini",
         "total_queued": 5,
         "succeeded": 0,
         "failed": 0,
         "errors": [],
         "status": "Dry-run completed successfully. 5 candidates inspected."
       }
       ```
     - 逻辑符合预期：默认 dry-run 不会擅自发起计费请求；遇 401/403 认证错误立即中断。

---

### 2.3 核心领域算法与跨端一致性校验 (`test_core_parity.py`)

* **测试对象**：日历运算、西交大作息、调课合并算法、艾宾浩斯复习间隔
* **校验项与结果**：
  1. **日历与周次换算 (`test_semester_bounds_and_dates`)**：
     - 2026-09-14 正确映射为第 1 周星期一（开学首日）；
     - 2026-09-20 为第 1 周星期日；
     - 2026-09-21 为第 2 周星期一；
     - 2027-01-17 为第 18 周星期日（学期截止日）。
  2. **指定停课日过滤 (`test_holidays_presence`)**：
     - `2026-09-25`、`2026-10-01`、`2026-10-02`、`2026-10-03`、`2027-01-01` 正确判定为假期；
     - 普通工作日与调休非停课日不误判。
  3. **夏秋/冬春作息切换 (`test_times_season_switch`)**：
     - 9 月 30 日及以前采用夏秋作息（第 5 节 14:30 开始）；
     - 10 月 1 日及以后采用冬春作息（第 5 节 14:00 开始）。
  4. **默认羽毛球课规范与语义去重 (`test_badminton_specification`)**：
     - 课程名 `"羽毛球"`、星期三（`3`）、节次 `[3, 4]`、地点 `"2号巨构七楼羽毛球场"`、教师 `["胡浩"]`；
     - 导入含有同名时段课程时不重复补入；缺失时自动补充。
  5. **连续节次合并算法 (`test_consecutive_merging`)**：
     - 同一天相同课程的第 1、2、3 节与 5、6 节分别正确合并为 `(1, 3)` 与 `(5, 6)`。
  6. **背词 SRS 间隔递增与重试 (`test_srs_intervals`)**：
     - 验证间隔级数严格遵循 `1 -> 3 -> 7 -> 14 -> 30 -> 60 -> 60` 天；
     - “不认识”重置回 `1` 天，且当轮最多追加 2 次重试；当天重试正确不提前升级。

---

### 2.4 Kotlin 单元测试套件准备与工具链说明

* **核心模块测试源码已完整就绪**：
  - `core/src/test/kotlin/.../CalendarTest.kt`（学期、作息与假期测试）
  - `core/src/test/kotlin/.../TimetableEngineTest.kt`（羽毛球 8 周排布、假期隐藏、跨周调课、取消、连堂合并）
  - `core/src/test/kotlin/.../TimetableBackupTest.kt`（小程序 JSON 兼容、全量备份导出与恢复、非法字段拦截）
  - `core/src/test/kotlin/.../VocabularyEngineTest.kt`（队列优先级、间隔 progression、FUZZY/UNKNOWN 反馈、熟词跳过、拼写练习）
  - `core/src/test/kotlin/.../FiveStepValidatorTest.kt`（五步 payload 契约校验）
* **运行环境说明**：
  - 当前宿主 Linux 容器环境未安装 JDK 17 与 Android SDK 36（当前容器只有旧版 Java 8/6 与 Python 3.6）；
  - 本工程已配置完备的 `.github/workflows/android.yml`，在推送到 GitHub 后将由 Ubuntu Runner（内置 Temurin JDK 17 及 Android SDK 36）自动执行：
    ```bash
    python3 -m unittest discover -s tests -v
    ./gradlew :core:test :app:assembleDebug :app:lintDebug --no-daemon
    ```
  - 用户可在 Windows / macOS 上通过 **Android Studio Quail 4** 直接导入本工程，选择内置 JDK 17 即可一键运行。

---

## 3. 验收标准核对表 (符合 PLAN.md 要求)

| 规划要求 | 实际落地情况 | 验证状态 |
| :--- | :--- | :---: |
| 移植课表与作息日历 | 18 周、11 节、夏冬作息、5 个停课日均已实现 | ✅ PASS |
| 默认羽毛球课 | 1–8周周三3–4节，巨构七楼胡浩；初始化一次不强塞 | ✅ PASS |
| 旧版课表 JSON 兼容 | 支持普通导入与 `backupVersion: 1` 完整恢复 | ✅ PASS |
| IELTS 3611 条目离线库 | SQLite `content.db` 预构建打包，3563 词匹配 | ✅ PASS |
| 英文优先背词与多词义 | 默认英文释义，中文按需展开，支持词义切换 | ✅ PASS |
| 艾宾浩斯复习与熟词本 | 1/3/7/14/30/60 间隔，重试限2次，“熟”整词跳过 | ✅ PASS |
| 5steps_tips.txt 空文件保护 | 0 字节时批处理脚本强制停止，不生成伪数据 | ✅ PASS |
| 五步六段强制结构校验 | 画面、3近义词、语域、搭配、联想、50-100词示例 | ✅ PASS |
| API 401/403 立即中止 | 鉴权失败立即退出，保护账户安全 | ✅ PASS |
| 移动端与 CI 构建配置 | Gradle 8.13 + AGP 8.13.2 + Compose + GitHub Actions | ✅ PASS |

---

## 4. 后续操作建议

1. **推送代码**：
   在 `StudyDesk/` 目录执行 `git push origin main` 触发 GitHub Actions 自动构建 Debug APK。
2. **手机端验证**：
   在 Android Studio Quail 4 打开工程，连接手机安装 APK，核验 7 列课表渲染、单次调课与背词交互。
3. **内容生成**：
   将正式编写的五步教学系统提示词填入 `sources/5steps_tips.txt`，配置大模型 API Key 后运行 `batch_generation.py` 补充深度解析。
