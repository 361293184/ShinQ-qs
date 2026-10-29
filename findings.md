# 微信桥 · 关键事实沉淀

## 微信官方 iLink Bot API（协议要点）
- 基址 https://ilinkai.weixin.qq.com（登录确认可能返回专属 baseurl，须持久化优先使用）
- 扫码：POST /ilink/bot/get_bot_qrcode?bot_type=3 → {qrcode, qrcode_img_content}
- 轮询扫码：POST /ilink/bot/get_qrcode_status?qrcode= → {status: wait|scaned|confirmed|expired, bot_token, ilink_bot_id}
- 收消息：POST /ilink/bot/getupdates（35s 长轮询，游标 get_updates_buf 不透明串须持久化；error_code=-14 = token 过期只能重扫）
- 发消息：POST /ilink/bot/sendmessage，msg{to_user_id, client_id, message_type:2, message_state:2, context_token(必须回传入站的), item_list:[{type:1,text_item:{text}}]}；协议只能被动回复
- 头：iLink-App-ClientVersion:1、AuthorizationType:ilink_bot_token、X-WECHAT-UIN:base64(随机uint32十进制串)
- 协议参考：wechatbot.dev/zh/protocol；上游实现：ai-virtual-phone-main/tools/weixin-local-assistant/assistant-core.mjs

## 本项目架构（已上线）
- Worker 地址 https://sullyos-wechat-bridge.qiana-s.workers.dev；健康检查 /health 返回 version
- D1：cb7e97ae-d1d7-40ec-80ee-534e889e5881；四表 wx_config/wx_packs/wx_messages/wx_outbox
- bot token 与 LLM 凭据均用 MASTER_KEY AES-GCM 加密（盐分别为 wechat-bridge-bot-v1 / wechat-bridge-v1）
- 满血大脑：pack.chat.messages 原样 + buildInstantTimelyBlock 时效块（不拼自己的提示词，防 OOC 根本保证）
- 防丢更新：wx_packs.chat_built_at 版本守卫，对话只许往前
- 回流：wx_outbox → App drainWechatOutbox → chat-glue 幂等合并（metadata.wechat_bridge_msg_id 去重）
- 输出整理（reply.ts）：剥 <think>/[[SEND_EMOJI]]/[html]/[[...]]，按 --- 分段，双语拆两条
- 构建脚本 scripts/build-workers.mjs 的 WORKERS 清单含 wechat-bridge（public 副本供复制部署）

## 环境事实
- wrangler 4.131.1 已登录 361293184@qq.com（子域 qiana-s.workers.dev；注意用户的 amsg worker 在另一个账号 yukine0v0）
- 仓库根目录有 wrangler.jsonc（sully-os-site 站点），wrangler 会向上发现配置——部署 worker 必须显式 --config
- execute_command 的 shell 在 PowerShell / cmd 间漂移；长构建（vite build ~35s）会被监控超时打断，需后台跑完再用产物时间戳确认
