---
name: fix-usememo-import
overview: 修复 ImageGenPanel.tsx 中 useMemo 未导入导致的 ReferenceError，仅补一行 import。
todos:
  - id: fix-usememo-import
    content: 在 ImageGenPanel.tsx 第 1 行 React import 中加入 useMemo 并验证无 lint 错误
    status: completed
---

## 产品概述
修复生图面板无法打开的问题。当前 `components/chat/ImageGenPanel.tsx` 运行时抛出 `ReferenceError: useMemo is not defined`，导致面板加载崩溃。

## 核心功能
- 在 React import 中补全缺失的 `useMemo` hook
- 恢复生图面板正常渲染与功能

## 技术栈
- React + TypeScript（现有项目，Vite 构建）

## 实现方案
问题根因：`ImageGenPanel.tsx` 第 145 行使用了 `useMemo`，但第 1 行的 React import 中遗漏了该 hook，导致运行时 `ReferenceError`。

修复方式为单行改动——在第 1 行 import 中加入 `useMemo`：
```
import React, { useState, useEffect, useCallback, useMemo } from 'react';
```

此改动无副作用、不改变现有逻辑，仅补齐缺失依赖。

## 实现注意
- 仅修改第 1 行，不触碰其余逻辑，控制爆炸半径
- 修复后通过构建/本地检查确认无 lint 错误
- 无需新增文件或依赖

## 目录结构
```
components/chat/ImageGenPanel.tsx  # [MODIFY] 第 1 行 React import 加入 useMemo
```
