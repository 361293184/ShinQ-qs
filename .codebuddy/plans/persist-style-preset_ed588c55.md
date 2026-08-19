---
name: persist-style-preset
overview: 让生图面板当前选中的风格持久化到 localStorage，关闭重开后保持上次选择，而不是跳回第一个。
todos:
  - id: persist-style-preset
    content: 在 ImageGenPanel.tsx 新增 STYLE_PRESET_KEY 常量并用惰性 useState 初始化，选择/新增/删除时同步写入 localStorage
    status: completed
  - id: verify-lint
    content: 验证 ImageGenPanel.tsx 无 lint 错误
    status: completed
    dependencies:
      - persist-style-preset
---

## 产品概述
生图面板的风格预设下拉中，用户选择某个风格（含新增的自定义风格）后，保存并关闭面板，再次打开却跳回第一个「动漫」风格。需求：记住用户上次选择的风格，重开面板后保持一致。

## 核心功能
- 面板重开后记住上次选择的风格预设（内置 + 自定义）
- 新增自定义风格后立即选中并持久化该选择
- 删除当前自定义风格时兜底重置并持久化该重置结果


## 技术栈
- React + TypeScript（现有 Vite 项目），localStorage 本地持久化
- 沿用项目现有 `os_imagegen_*` 存储 key 命名约定

## 实现方案
根因：`components/chat/ImageGenPanel.tsx` 第 71 行 `const [stylePreset, setStylePreset] = useState('anime');` 硬编码初始值，且选择后从不写入 localStorage，因此每次重开面板必然回到默认 'anime'。

修复方式为集中在该文件内的局部改动：

1. **新增存储 key 常量**：在常量区（`CHAR_SETTINGS_PREFIX` 附近）新增 `const STYLE_PRESET_KEY = 'os_imagegen_style_preset';`
2. **惰性初始化**：将初始值改为 `useState<string>(() => localStorage.getItem(STYLE_PRESET_KEY) || 'anime')`，用函数式 useState 避免每次渲染重复读取。
3. **选择时持久化**：`<select>` 的 `onChange`（L506）在 `setStylePreset` 的同时写入 `localStorage.setItem(STYLE_PRESET_KEY, e.target.value)`。
4. **新增自定义风格时持久化**：L582 新增风格后 `setStylePreset(id)` 处同步写入 localStorage。
5. **删除当前风格兜底时持久化**：L537 删除当前自定义风格并重置为 'anime' 处同步写入 localStorage。

## 实现注意
- localStorage 读取/写入用 try/catch 包裹，复用项目现有容错模式（如 `loadCustomStyles`），防止隐私模式或配额异常导致崩溃
- 仅修改 `ImageGenPanel.tsx` 一个文件，不触碰后端与其余逻辑，控制爆炸半径
- 修改后验证无 lint 错误

## 目录结构
```
components/chat/ImageGenPanel.tsx  # [MODIFY] 新增 STYLE_PRESET_KEY 常量 + 惰性初始化 + 三处持久化写入
```


## Agent Extensions
### Skill
- **planning-with-files**
  - Purpose: 使用持久化文件式规划，将本次修复的根因、改动点记录到 findings/task 文件，便于在后续对话或 /clear 后恢复上下文
  - Expected outcome: 修复方案与执行状态持久化在磁盘，供后续会话复用
