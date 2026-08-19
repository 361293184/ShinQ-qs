---
name: custom-style-dropdown
overview: 将生图面板的风格预设从原生 select 改为自定义 button+弹层下拉，统一各浏览器外观并美化（圆角、阴影、分组、hover 高亮、选中态）。
todos:
  - id: add-styleopen-state
    content: 新增 styleOpen 状态用于控制自定义下拉开合
    status: completed
  - id: replace-select
    content: 用 button + 绝对定位弹层替换原生 select，含分组/hover/选中态/对勾与箭头 SVG，并用透明遮罩实现点击外部关闭，保留 STYLE_PRESET_KEY 持久化
    status: completed
    dependencies:
      - add-styleopen-state
  - id: verify-lint
    content: 验证 ImageGenPanel.tsx 无 lint 错误
    status: completed
    dependencies:
      - replace-select
---


## 产品概述
将生图面板「风格预设」的原生 `<select>` 下拉，改为自研的 button + 弹层式自定义下拉，统一所有浏览器外观，并美化视觉（圆角、阴影、分组、hover 高亮、选中态）。

## 核心功能
- 闭合态显示当前选中风格的名称，右侧带可旋转箭头图标
- 展开后以自定义弹层展示「内置风格」与「我的自定义」两组风格
- 选项 hover 高亮、当前选中项以玫瑰色强调并带对勾标识
- 选中风格后写入 localStorage（沿用 STYLE_PRESET_KEY），重开面板保持选择
- 点击面板外任意处自动关闭弹层
- 保留原有「当前风格描述」「删除自定义风格」「添加自定义风格」功能不动



## 技术栈
- React + TypeScript（现有 Vite 项目）
- Tailwind CSS 样式（复用项目现有玫瑰色主题类）
- 内联 SVG 图标（箭头、对勾），不引入额外图标库
- localStorage 持久化（key `os_imagegen_style_preset`）

## 实现方案
在 `components/chat/ImageGenPanel.tsx` 中，将 L507-524 的原生 `<select>` 替换为自定义下拉组件，核心是「按钮 + 绝对定位弹层 + 透明遮罩」的组合：

1. **新增 state**：`const [styleOpen, setStyleOpen] = useState(false);`
2. **闭合态按钮**：`relative` 容器包裹一个 button，显示当前选中风格 label（从 `allStyles` 查找），右侧 SVG 箭头在展开时旋转 180°。
3. **展开弹层**：`absolute z-[70] mt-1 w-full rounded-2xl bg-white shadow-xl border border-slate-100 py-1 overflow-y-auto max-h-60`，内部按「内置风格」/「我的自定义」分组渲染，每组一个标题 + 若干选项 button。
4. **选中逻辑**：复用原 select 的 onChange 逻辑（`setStylePreset(v)` + `localStorage.setItem(STYLE_PRESET_KEY, v)`），选中后 `setStyleOpen(false)`。
5. **点击外部关闭**：展开时渲染一个 `fixed inset-0 z-[60]` 的透明遮罩，点击即关闭；弹层 z 高于遮罩，保证可交互。
6. **保留**：当前风格描述块（L526-550）、删除自定义风格按钮、添加自定义风格弹层（L552-596）全部原样保留。

### 实现注意
- 只替换 L507-524 这一段，控制爆炸半径
- 选项复用玫瑰色主题（`bg-rose-50`、`text-rose-600`、`hover:bg-rose-50`）
- 若 `stylePreset` 指向的自定义风格已被删除导致找不到，回退显示「未选择」
- 修改后验证无 lint 错误

## 目录结构
```
components/chat/ImageGenPanel.tsx  # [MODIFY] 原生 select 替换为自定义 button+弹层下拉，新增 styleOpen state
```


## Agent Extensions
### Skill
- **frontend-design**
  - Purpose: 指导自定义下拉弹层的视觉设计，确保圆角、阴影、配色与项目玫瑰色主题协调
  - Expected outcome: 产出美观、一致、非模板化的下拉 UI 样式
