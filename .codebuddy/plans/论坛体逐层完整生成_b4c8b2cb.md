---
name: 论坛体逐层完整生成
overview: 解决论坛体番外生成时省略楼层的问题：强化论坛模板与 prompt，让 AI 从 1 楼逐层完整生成到指令要求的楼层数（编号连续、每层独立结构、绝不省略）。
todos:
  - id: floor-example
    content: 论坛模板 replies 占位改为带 1 个完整楼层结构示例（编号/头像/正文/点赞）
    status: completed
  - id: floor-extract
    content: formatDetector 新增 extractFloorCount 楼层数提取函数并补测试
    status: completed
    dependencies:
      - floor-example
  - id: floor-prompt
    content: buildHtmlFormatBlock 加论坛逐层专项约束 + 楼层数注入 prompt
    status: completed
    dependencies:
      - floor-extract
  - id: verify
    content: 验证：lint + tsc + 跑 formatDetector 测试
    status: completed
    dependencies:
      - floor-prompt
---

## 用户需求
论坛体番外生成时，AI 会省略楼层（如指令要求「论坛不少于80层楼」，AI 只写几层 + 省略）。需要确保论坛体番外**逐层完整生成**，从 1 楼到指令要求的 N 楼每一层都完整显示，绝不省略或合并楼层。

## 核心功能
- 论坛模板给出明确的楼层结构范式，AI 按此逐层生成
- 生成时专项约束：楼层编号从 1 连续递增，绝不省略/合并/用「其余楼层类似」概括
- 从指令提取具体楼层数（如「80层楼」→80），明确告诉 AI「必须生成到第 80 楼」增强目标感
- 保持向后兼容：非论坛体、无楼层数指令时行为不变


## 技术栈
沿用现有 React + TypeScript 架构，改动集中在番外 HTML 生成链路：`utils/fanwai/htmlTemplates.ts`（论坛模板）、`utils/fanwai/formatDetector.ts`（楼层数提取）、`utils/fanwaiGenerator.ts`（prompt 专项约束）。

## 实现方案
核心思路：三层保障解决「省略楼层」问题——①模板给出楼层结构范式（AI 照抄结构）；②prompt 加论坛逐层专项约束（不省略/编号连续）；③从指令提取具体楼层数注入 prompt（增强目标感，避免 AI 不知道要写多少楼）。

### 关键决策
1. **论坛模板给出结构示例**：`buildForumTemplate` 的 `{{replies}}` 占位从「空 div」改为「带 1 个完整楼层示例结构」——含「1楼」编号、头像圆、正文、点赞 `:checked`，让 AI 明确复制该结构逐层 +1 生成。
2. **prompt 专项约束**：`buildHtmlFormatBlock`（已接收 `type` 参数）当 `type === 'forum'` 时，额外追加论坛专项约束块：「楼层编号从 1 连续到总楼层数，每层独立 .fw-floor，绝不合并/省略/用『其余楼层类似』『（中间略）』」。该约束不影响 phone/statusbar/custom。
3. **楼层数提取**：在 `utils/fanwai/formatDetector.ts` 新增 `extractFloorCount(worldSetting?): number | undefined`，用正则提取「N 层/楼」的具体数字；提取成功则注入 prompt「必须完整生成到第 N 楼」，失败则让 AI 按指令文本自然判断。
4. **性能与可靠性**：均为纯字符串/正则处理，无性能开销；保持向后兼容（非论坛/无楼层数时不改变行为）；不改动文字番外、不动 max_tokens。

## 目录结构
```
utils/fanwai/htmlTemplates.ts       [MODIFY] 论坛模板 replies 区加楼层结构示例
utils/fanwai/formatDetector.ts      [MODIFY] 新增 extractFloorCount 楼层数提取纯函数
utils/fanwai/formatDetector.test.ts [MODIFY] 补充 extractFloorCount 测试用例
utils/fanwaiGenerator.ts            [MODIFY] buildHtmlFormatBlock 加论坛逐层专项约束 + 楼层数注入
```

## 实现注意
- 论坛模板的楼层示例必须用模板 `<style>` 里已定义的 `.fw-floor` 类（保持类名一致，避免 AI 发明新结构）
- `extractFloorCount` 正则需兼容「N 层 / N 楼 / N 层楼」多种表述
- 专项约束只在 `type === 'forum'` 时追加，不污染其他模板类型
- 复用现有「严禁省略」约束，新增的论坛约束是强化补充


## Agent Extensions
### SubAgent
- **code-explorer**
  - 用途：核对论坛模板 replies 占位结构、buildHtmlFormatBlock 的 type 参数注入位置、extractFloorCount 与现有 detectExplicitQuantity 的衔接，确保改动精准落在现有类名与注入点
  - 预期产出：精确到行号/函数签名的落点清单，确认新增约束与楼层示例与现有 `.fw-floor` 结构一致
