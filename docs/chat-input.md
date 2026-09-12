# 私聊输入与设置

入口：聊天底部「＋」→「设置」→「输入与发送」。这组输入习惯对当前设备上的所有私聊生效，修改后点击底部「保存设置」。

## 表情包智能匹配

- 默认关闭；旧存档缺少该字段时也保持关闭。
- 输入“抱”可匹配“抱抱”“给你抱抱”等名称，完全匹配优先，其次是名称开头、名称中包含输入文字。短句里出现完整表情名称也可匹配。
- 从当前角色可见的所有分类中查找，不受表情面板当前分类限制。相同图片去重，最多显示八个候选，可左右滑动。
- 点击候选通过现有表情发送流程发送一次，保留未发送的文字草稿。当前候选行收起；继续修改输入后重新匹配。
- 输入法组词时不显示联想，选字回车不会误发。空输入、无匹配、消息多选或展开底部其他面板时不显示候选行。
- 只在本地匹配表情名称，不请求模型，也不新增输入内容埋点。

`utils/chatInputPreferences.ts` 的 `emojiSuggestions` 与其他输入偏好一起存到 `sully-chat-input-preferences-v1`，沿用现有完整备份的输入偏好字段。匹配逻辑在 `utils/emojiSuggestions.ts`，候选显示在 `ChatInputArea`；私聊传入已有的角色可见表情列表，群聊复用输入组件时默认不开启。

### 与社区美化兼容

表情联想和自动回复倒计时位于 `.sully-chat-inputbar` 外侧的同级区域，不插入输入栏内部。显示、收起辅助提示不会改变原有 `> div:first-child` / `:nth-child(1)` 的输入行目标，也不会重建输入框、丢失草稿或光标。

新美化建议使用固定钩子：`.sully-chat-composer`（输入行）、`.sully-chat-input-wrap`（输入框外壳）、`.sully-chat-textarea`、`.sully-chat-actions-button`、`.sully-chat-send-button`。联想区可单独用 `.sully-chat-emoji-suggestions` 定制（旧 `.sully-emoji-suggestions` 仍保留），倒计时用 `.sully-chat-auto-reply`。不改写用户保存的 CSS。

## 折叠设置

聊天设置分为六组，默认全部收起：输入与发送、聊天外观、上下文与记忆、翻译与语音、扩展功能、聊天记录。标题行常显，点击或键盘操作可展开；折叠不会丢失未保存的修改。各项原有的保存方式和执行行为不变。

```sh
pnpm vitest run utils/emojiSuggestions.test.ts utils/chatInputInteraction.test.ts utils/chatAutoReply.test.ts utils/sarReleaseBackup.test.ts
```
