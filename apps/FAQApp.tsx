
import React, { useEffect, useState } from 'react';
import { useOS } from '../context/OSContext';
import { Sparkle } from '@phosphor-icons/react';
import {
    FAQ_TARGET_SECTION_KEY,
    CHANGELOG_2026_04,
    CHANGELOG_2026_05,
    CHANGELOG_2026_05_10,
    CHANGELOG_2026_05_17,
    CHANGELOG_2026_05_27,
    CHANGELOG_2026_06_05,
    CHANGELOG_2026_06_14,
    CHANGELOG_2026_06_21,
    CHANGELOG_2026_06_26,
    CHANGELOG_2026_07_10,
    CHANGELOG_2026_08_03,
    CHANGELOG_2026_08_10,
} from '../components/UpdateNotificationEvent';
import { trackEvent } from '../utils/analytics';

const FAQ_DATA = [
    {
        q: "1. 进不去网页 / 白屏 / 点了没反应",
        reason: "网络有点小脾气，不够通畅。",
        solution: "需要一点点“魔法”才能连上外网。\n如果你不知道什么是“梯子/魔法”，请自行搜索一下~ \n这不是软件坏啦，是网路不通。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1fa84.png",
        color: "bg-blue-50 text-blue-700"
    },
    {
        q: "2. 发了消息，角色不回我？",
        reason: "为了帮大家省额度，角色不会自动秒回，他在等你戳他。",
        solution: "发完消息后，请注意观察顶部标题栏右边的 **闪电按钮**。\n点一下它，戳戳他，他就会思考并回复啦！",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4a4.png",
        color: "bg-yellow-50 text-yellow-700"
    },
    {
        q: "3. 为什么拉取不到模型列表？",
        reason: "很多时候是填写的地址（URL）差了一点点。",
        solution: "请仔细检查你的链接：\n1. 后面是不是漏掉了 `/v1` 这个小尾巴？\n2. 复制时是否多带了空格？\n3. 地址不对是敲不开门的哦。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f50d.png",
        color: "bg-red-50 text-red-700"
    },
    {
        q: "4. 出现红色弹窗 (API 报错)",
        reason: "情况A：如果你最近发了很多高清图，或者聊得太久了。\n情况B：没发图也报错？可能是提供接口的那边欠费或波动。",
        solution: "**情况A**：进【设置】，把“上下文条数”调低一点（例如 20-50）。\n**情况B**：请直接联系你购买/获取 API 的那个渠道哦，模拟器本身是无辜哒。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/26a0.png",
        color: "bg-orange-50 text-orange-700"
    },
    {
        q: "5. 气泡主题 / 导入角色",
        reason: "想要个性化？想换角色？",
        solution: "**换气泡**：\n点顶部的名字 → 下滑找“气泡样式”。\n\n**导角色**：\n只支持导入本模拟器导出的 .json 文件（专属护照），不兼容酒馆图片卡和其他小手机角色卡。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3a8.png",
        color: "bg-purple-50 text-purple-700"
    },
    {
        q: "6. 碎碎念：关于 API（接口）",
        reason: "用公益/白嫖的不稳定？花钱买的报错？",
        solution: "公益的不稳定是常态。\n花钱买的请找卖家售后。\n作者和群友也是为爱发电，但是大家并不是专业的。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4ac.png",
        color: "bg-slate-50 text-slate-700"
    },
    {
        q: "7. 遇到奇怪的 Bug 怎么办？",
        reason: "可以在群里问，但严肃报修需要“病历本”。",
        solution: "请去桌面【设置】→【数据备份】导出 JSON 文件发给我。\n只有复现了问题，才能修好它。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f691.png",
        color: "bg-rose-50 text-rose-700"
    },
    {
        q: "8. 关于提问礼仪",
        reason: "拒绝低气压。",
        solution: "遇到问题深呼吸，直接发截图 + 描述发生了什么。\n欢迎大家积极讨论，但是避免通篇抱怨，散发负面情绪解决不了问题，还会劝退想帮你的人。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2764.png",
        color: "bg-pink-50 text-pink-700"
    },
    {
        q: "9. 小屋里角色立绘怎么更换？",
        reason: "想给角色换个造型/衣服。",
        solution: "1. 进入小屋，点击顶部的「装修」按钮进入编辑模式。\n2. **直接点击**画面中央的角色小人。\n3. 选择一张透明背景的图片上传即可。\n(注意：这里更换的是小屋专属的 Q 版/Chibi 立绘，不是聊天头像哦)",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3e0.png",
        color: "bg-indigo-50 text-indigo-700"
    },
    {
        q: "10. 导入的表情包不显示 / 导入没反应？",
        reason: "通常是格式不对，或者链接无效。",
        solution: "1. **严格检查格式**：必须是 `名字--URL`，中间是**两个减号**！\n   错误：`滑稽 http://...`\n   正确：`滑稽--http://...`\n2. **检查链接**：必须是图片直链（.jpg/.png/.gif 结尾）。\n3. **一行一个**：不要把所有内容写在一行里。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f5bc.png",
        color: "bg-cyan-50 text-cyan-700"
    },
    {
        q: "11. 点聊天输入框没反应 / 键盘唤不起来？",
        reason: "多半是随备份一起导入的美化在捣乱：白框自定义 CSS、气泡主题或聊天背景把输入框盖住/禁用了。这类数据跟着备份走，所以重启、重新导入备份都没用，而全新页面（没导数据）反而正常。",
        solution: "按顺序排查：\n1. 【外观】→【聊天界面】→ **还原白框美化**（一键清掉全局和所有角色的白框 CSS）。\n2. 点顶部角色名 → 把「气泡样式」换回默认。\n3. 关掉该角色的聊天背景图。\n4. 还不行：换个浏览器（如 Safari）打开同一链接导入备份试试；仍复现请把备份 JSON 按第 7 条发给作者。",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2328.png",
        color: "bg-teal-50 text-teal-700"
    }
];

interface ChangelogEntry {
    id: string;
    title: string;
    subtitle: string;
    date: string;
    src: string;
    accent: string;
}

const CHANGELOG_ENTRIES: ChangelogEntry[] = [
    {
        id: CHANGELOG_2026_08_10,
        title: '2026 年 8 月 10 日 · Live2D 陪伴升级',
        subtitle: '新增 VRM / Live2D 视频通话 · 新增面向 Live2D 的「触感陪伴」桌面主题',
        date: '2026-08-10',
        src: 'changelogs/2026-8-10.html',
        accent: 'from-emerald-100 to-sky-100 border-emerald-200',
    },
    {
        id: CHANGELOG_2026_08_03,
        title: '2026 年 8 月 3 日 · 主动消息 2.0',
        subtitle: '角色到点自己发消息，App 关着也收得到 · 三种排任务的方式（面板 / 聊天里说一句 / 角色给自己排）· 到点现取时间天气节日热搜与当天作息 · 连发不重样、只做事时不推空消息 · 后台照样能用 MCP 与搜索 · 想找话说的那类会让路，闹钟和承诺照发 · 需自部署 Cloudflare Worker + D1',
        date: '2026-08-03',
        src: 'changelogs/2026-8-3.html',
        accent: 'from-violet-100 to-sky-100 border-violet-200',
    },
    {
        id: CHANGELOG_2026_07_10,
        title: '2026 年 7 月 10 日 · 生活统计',
        subtitle: '档案「生活统计」四模块 + 角色注入代记 · 彼方全服写诗 · 捏人换画风 + PSD 批量导入 + 手办区 · 神经链接角色分组 · 小屋装修大升级 + 家园「凌晨」段 · 记忆宫殿门牌（测试中）· 专属提示铃声 · 壁纸/小屋图改存 Blob · 一大批 iOS 适配与散修',
        date: '2026-07-10',
        src: 'changelogs/2026-7-10.html',
        accent: 'from-rose-100 to-violet-100 border-rose-200',
    },
    {
        id: CHANGELOG_2026_06_26,
        title: '2026 年 6 月 26 日 · 梦境盲盒',
        subtitle: '小屋梦境系统（进屋刷新 · 集齐 13 款梦境盲盒）· 查手机联系人模式 + 智能体（char 的小手机）· 见面状态栏与设置前移 · 日程窥得更细 · 时间感知归位神经链接 · TTS 新增鱼声 API',
        date: '2026-06-26',
        src: 'changelogs/2026-6-26.html',
        accent: 'from-indigo-100 to-violet-100 border-indigo-200',
    },
    {
        id: CHANGELOG_2026_06_21,
        title: '2026 年 6 月 21 日 · 查手机翻新',
        subtitle: '查手机 UI 翻新 + 新增「人格模拟」（可指定一场 Screenlife 演出，设置里可选是否发送给角色）· 外观新增手游风 · 小红书 Lite 可直接分享帖子给角色',
        date: '2026-06-21',
        src: 'changelogs/2026-6-21.html',
        accent: 'from-violet-100 to-fuchsia-100 border-violet-200',
    },
    {
        id: CHANGELOG_2026_06_14,
        title: '2026 年 6 月 14 日 · 家园上线',
        subtitle: '小屋翻新 · 「家园」多角色大世界（真实时间 / 模拟时间二选一）· 瑞幸咖啡点单',
        date: '2026-06-14',
        src: 'changelogs/2026-6-14.html',
        accent: 'from-violet-100 to-purple-100 border-violet-200',
    },
    {
        id: CHANGELOG_2026_06_05,
        title: '2026 年 6 月 5 日 · 彼方上线',
        subtitle: '角色自主登入的 VR 小世界 · 邮局漂流信 · 留言簿原话上墙 · 隐藏小人',
        date: '2026-06-05',
        src: 'changelogs/2026-6-5.html',
        accent: 'from-indigo-100 to-purple-100 border-indigo-200',
    },
    {
        id: CHANGELOG_2026_05_27,
        title: '2026 年 5 月 27 日 · 小更新',
        subtitle: '情绪 buff 也接入 Instant Push · 发完即走，聊天和情绪都不用一直开着 App（附配置视频）',
        date: '2026-05-27',
        src: 'changelogs/2026-5-27.html',
        accent: 'from-rose-100 to-amber-100 border-rose-200',
    },
    {
        id: CHANGELOG_2026_05_17,
        title: '2026 年 5 月 17 日 · 小更新',
        subtitle: 'Instant Push 上线 · 发完文本就能锁屏走人，AI 回复自己回来',
        date: '2026-05-17',
        src: 'changelogs/2026-5-17.html',
        accent: 'from-teal-100 to-sky-100 border-teal-200',
    },
    {
        id: CHANGELOG_2026_05_10,
        title: '2026 年 5 月 10 日 · 小更新',
        subtitle: '「心象」上线 · 模型思考链可视化 + 约会（见面模式）bug 修复',
        date: '2026-05-10',
        src: 'changelogs/2026-5-10.html',
        accent: 'from-purple-100 to-indigo-100 border-purple-200',
    },
    {
        id: CHANGELOG_2026_05,
        title: '2026 年 5 月更新',
        subtitle: 'GitHub 备份 · 音乐 App 网络优化 · 麦当劳 MCP · SULLY 默认皮肤 等',
        date: '2026-05',
        src: 'changelogs/2026-5.html',
        accent: 'from-amber-100 to-orange-100 border-amber-200',
    },
    {
        id: CHANGELOG_2026_04,
        title: '2026 年 4 月更新',
        subtitle: '向量记忆 · 更新说明与配置指南',
        date: '2026-04',
        src: 'changelogs/2026-4.html',
        accent: 'from-indigo-100 to-purple-100 border-indigo-200',
    },
];

type Tab = 'faq' | 'changelog' | 'guide';

// 「使用说明」：把 SullyOS 里目前所有 App 列出来，讲清用途、怎么用、会关联到哪个 App。
// 数据源参考 constants.tsx 的 INSTALLED_APPS 与 types.ts 的 AppID 注释，保持一致。
interface GuideEntry {
    name: string;      // 桌面上显示的名字
    icon: string;      // twemoji 图
    color: string;     // 卡片配色
    desc: string;      // 这个 App 是干嘛的
    how: string[];     // 怎么用（几条步骤）
    links: string[];   // 会关联到哪些 App
}

const GUIDE_DATA: GuideEntry[] = [
    {
        name: '神经链接',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f916.png',
        color: 'from-indigo-50 to-violet-50 border-indigo-200',
        desc: '角色管理中枢。你所有的角色都住在这里，可以新建、编辑、切换。',
        how: [
            '打开后先选一个角色，或点「新建」创造新角色。',
            '可以编辑角色名字、头像、性格、世界观、世界书、立绘等。',
            '时间感知、记忆开关、日程开关等也在这里配置。',
        ],
        links: ['聊天', '记忆宫殿', '世界书', '查手机'],
    },
    {
        name: '记忆宫殿',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f9e0.png',
        color: 'from-violet-50 to-purple-50 border-violet-200',
        desc: '把角色对你的记忆整理成可视化的房间，每个房间装一类记忆。',
        how: [
            '进入后能看到七个房间，分别对应不同的记忆类型。',
            '点开房间查看具体记忆条目，可以翻看或清理。',
        ],
        links: ['神经链接', '聊天'],
    },
    {
        name: 'Message（聊天）',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4ac.png',
        color: 'from-green-50 to-emerald-50 border-green-200',
        desc: '和角色私聊的主阵地。发消息、看角色回复、上下翻历史。',
        how: [
            '发完消息后，点顶部标题栏右侧的闪电按钮，角色才会思考并回复。',
            '点顶部角色名可以切换角色、换气泡样式、看世界书等。',
            '右上角「+」可以发图片、引用回忆等。',
        ],
        links: ['神经链接', '记忆宫殿', '世界书', '拾光', '手账'],
    },
    {
        name: '电话',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4de.png',
        color: 'from-emerald-50 to-teal-50 border-emerald-200',
        desc: '和角色语音/视频通话（VRM / Live2D），真人语音陪伴。',
        how: [
            '选一个角色，点拨打即可接通。',
            '可在设置里选择音色（可到「捏声音」定制）。',
        ],
        links: ['神经链接', '捏声音'],
    },
    {
        name: '群聊',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f465.png',
        color: 'from-violet-50 to-indigo-50 border-violet-200',
        desc: '把多个角色拉到一个群里，大家一起聊天。',
        how: [
            '新建群聊，把角色们加进来。',
            '在群里发消息，多个角色会互相回应、一起讨论。',
        ],
        links: ['神经链接', '聊天'],
    },
    {
        name: '小小窝',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3e0.png',
        color: 'from-rose-50 to-pink-50 border-rose-200',
        desc: '角色的家，可以装修、摆放家具、换立绘。',
        how: [
            '进入后点顶部「装修」进入编辑模式。',
            '直接点画面中央的角色小人可以换 Q 版立绘。',
            '家园（多角色大世界）也从这里进入。',
        ],
        links: ['家园', '神经链接'],
    },
    {
        name: '家园',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f305.png',
        color: 'from-emerald-50 to-lime-50 border-emerald-200',
        desc: '同世界观的多角色大世界，多个角色一起生活、互相联动。',
        how: [
            '从「小小窝 · 像素家园」进入（桌面没有独立图标）。',
            '每个角色独立思考，观察驱动演绎，会主动发生互动。',
        ],
        links: ['小小窝', '神经链接', '聊天'],
    },
    {
        name: '查手机',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4f1.png',
        color: 'from-slate-50 to-gray-50 border-slate-200',
        desc: '查看角色手机的屏幕画面（Screenlife），看他在刷什么、和谁聊天。',
        how: [
            '选一个角色，就能看到他手机上的实时画面。',
            '可以触发查手机，或指定一场「人格模拟」演出。',
        ],
        links: ['神经链接', '聊天', '日程'],
    },
    {
        name: '见面',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f495.png',
        color: 'from-pink-50 to-rose-50 border-pink-200',
        desc: '和角色约会的模式，面对面对话、一起经历当下时刻。',
        how: [
            '选好角色和场景，进入「见面」模式。',
            '对话会在约会界面进行，有实时的时间与氛围。',
        ],
        links: ['神经链接', '聊天'],
    },
    {
        name: '档案',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4c3.png',
        color: 'from-blue-50 to-sky-50 border-blue-200',
        desc: '看你和角色相处的完整档案、相处数据、生活统计。',
        how: [
            '打开查看角色与你相处的各项记录与统计。',
            '「生活统计」会记录作息、习惯、纪念日等。',
        ],
        links: ['神经链接', '聊天', '手账'],
    },
    {
        name: '存钱罐',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1fa99.png',
        color: 'from-lime-50 to-green-50 border-lime-200',
        desc: '和角色一起存钱、记账的小游戏，培养默契。',
        how: [
            '每天和角色一起存一笔，攒下来的钱可以用来做一些事。',
            '看共同存款的成长曲线。',
        ],
        links: ['神经链接', '聊天'],
    },
    {
        name: '交换日记',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4dd.png',
        color: 'from-amber-50 to-yellow-50 border-amber-200',
        desc: '和角色互写日记，记录每天的心情和事。',
        how: [
            '写下今天想说的话，角色也会回一篇。',
            '可以翻看往期的往来日记。',
        ],
        links: ['神经链接', '聊天'],
    },
    {
        name: '手账（Techo）',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4d3.png',
        color: 'from-fuchsia-50 to-pink-50 border-fuchsia-200',
        desc: '个人日程/打卡/碎碎念手账，有封面、日、周、月、年、习惯、设置。',
        how: [
            '底部导航可切换 日 / 周 / 月 / 年 / 习惯 / 设置。',
            '月视图会显示节假日、纪念日和当日完成的任务。',
            '设置里可以开「角色感知」，让角色读到你的手账并在聊天里自然提起。',
        ],
        links: ['聊天', '神经链接', '日程'],
    },
    {
        name: 'Spark',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f525.png',
        color: 'from-red-50 to-orange-50 border-red-200',
        desc: '角色「生活流」社交动态，角色会发一些日常碎片动态。',
        how: [
            '像刷朋友圈一样刷角色的动态。',
            '可以点赞、评论，角色可能会回应。',
        ],
        links: ['神经链接', '聊天'],
    },
    {
        name: '自习室',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4da.png',
        color: 'from-emerald-50 to-green-50 border-emerald-200',
        desc: '和角色一起学习/自习，番茄钟陪伴。',
        how: [
            '选一个专注时长，和角色一起进入自习状态。',
            '角色会陪着你，结束时互相总结。',
        ],
        links: ['神经链接', '聊天'],
    },
    {
        name: 'TRPG',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3ae.png',
        color: 'from-orange-50 to-amber-50 border-orange-200',
        desc: '和角色玩文字冒险 / TRPG 跑团小游戏。',
        how: [
            '选角色、选剧本，进入冒险。',
            '角色扮演 GM 推进剧情，你做选择。',
        ],
        links: ['神经链接', '聊天'],
    },
    {
        name: '笔友会',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4d6.png',
        color: 'from-amber-50 to-orange-50 border-amber-200',
        desc: '和角色写小说 / 接龙，共同创作故事。',
        how: [
            '开一篇新故事，和角色轮流写下去。',
            '也可以续写、改写已有篇章。',
        ],
        links: ['神经链接', '聊天', '拾光'],
    },
    {
        name: '拾光（番外）',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1fab6.png',
        color: 'from-amber-50 to-yellow-50 border-amber-200',
        desc: '把你们的故事生成小说式番外，收藏后可以转发给角色。',
        how: [
            '输入一个「指令」（如：写一段周末约会），生成番外。',
            '生成的小说可以收藏、回看，也可转发给角色——会写入记忆并注入聊天。',
        ],
        links: ['聊天', '记忆宫殿', '笔友会'],
    },
    {
        name: '写歌',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3b5.png',
        color: 'from-fuchsia-50 to-purple-50 border-fuchsia-200',
        desc: '和角色一起写歌词、写歌。',
        how: [
            '定主题和曲风，角色帮你想词、你一起改。',
            '写好的歌可以保存下来。',
        ],
        links: ['神经链接', '聊天', '音乐'],
    },
    {
        name: '彼方',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f30d.png',
        color: 'from-indigo-50 to-blue-50 border-indigo-200',
        desc: '角色自主登入的虚拟世界，角色会自己在里面看书、听歌、留言。',
        how: [
            '进入彼方看角色的小世界和活动卡。',
            '角色活动会自动注入聊天与记忆，成为话题。',
        ],
        links: ['聊天', '记忆宫殿', '神经链接'],
    },
    {
        name: '时光契约',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4c5.png',
        color: 'from-cyan-50 to-sky-50 border-cyan-200',
        desc: '日程管理。给角色安排一天作息、任务、约会、纪念日。',
        how: [
            '按「日期」给角色排日程，角色会按此作息。',
            '加纪念日（♥），会显示在桌面月历、手账和聊天里。',
            '「日历」页能看当月节假日和纪念日。',
        ],
        links: ['神经链接', '聊天', '查手机', '手账'],
    },
    {
        name: '世界书',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f30f.png',
        color: 'from-indigo-50 to-violet-50 border-indigo-200',
        desc: '给角色附加世界观、设定、剧情细节，让角色更立体。',
        how: [
            '新建世界书条目，写设定内容。',
            '在「神经链接」或聊天顶部把世界书挂到角色身上。',
        ],
        links: ['神经链接', '聊天'],
    },
    {
        name: '热点',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4f0.png',
        color: 'from-red-50 to-rose-50 border-red-200',
        desc: '分时段的多平台热榜，决定角色可能聊起的话题。',
        how: [
            '打开看当前热点。',
            '角色可能会根据热点跟你聊起相关话题。',
        ],
        links: ['聊天', '神经链接'],
    },
    {
        name: '使用帮助',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4da.png',
        color: 'from-indigo-50 to-sky-50 border-indigo-200',
        desc: '就是你现在看的这个 App：常见问题、更新日志、使用说明。',
        how: [
            '顶部切换「常见问题 / 更新日志 / 使用说明」。',
        ],
        links: [],
    },
    {
        name: '相册',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4f7.png',
        color: 'from-orange-50 to-amber-50 border-orange-200',
        desc: '存放你和角色一起产生的图片。',
        how: [
            '浏览、查看聊天里生成的图片和截图。',
        ],
        links: ['聊天', '神经链接'],
    },
    {
        name: '自由活动',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6b6.png',
        color: 'from-rose-50 to-pink-50 border-rose-200',
        desc: '角色的「小红书」自由活动，角色自主逛、发布内容。',
        how: [
            '看角色发布的动态和逛街记录。',
        ],
        links: ['神经链接', '聊天', '小红书图库'],
    },
    {
        name: '小红书图库',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3f7.png',
        color: 'from-red-50 to-rose-50 border-red-200',
        desc: '小红书风格的图片素材库，可用来发布/分享。',
        how: [
            '选图、编辑，用于角色发布动态或分享给角色。',
        ],
        links: ['自由活动', '聊天'],
    },
    {
        name: '气泡工坊',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3a8.png',
        color: 'from-purple-50 to-fuchsia-50 border-purple-200',
        desc: '自定义聊天气泡样式，给角色做专属皮肤。',
        how: [
            '新建/编辑气泡主题，改配色、圆角、边框等。',
            '在聊天顶部「气泡样式」里选用。',
        ],
        links: ['聊天', '外观', '神经链接'],
    },
    {
        name: '外观',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3a8.png',
        color: 'from-slate-50 to-gray-50 border-slate-200',
        desc: '系统外观设置：主题、壁纸、启动器组件、聊天界面美化。',
        how: [
            '切主题、换壁纸、布置桌面组件和小部件。',
            '「聊天界面」里能还原白框美化、关背景图等（排查输入框问题也在这）。',
        ],
        links: ['设置', '气泡工坊', '启动器'],
    },
    {
        name: '设置',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f6e0.png',
        color: 'from-slate-50 to-gray-50 border-slate-200',
        desc: '系统设置：API、模型、上下文、数据备份等。',
        how: [
            '配置 API 地址（记得带 /v1）、模型、上下文条数。',
            '「数据备份」可以导出 JSON 文件，出 bug 时发给作者。',
        ],
        links: ['外观', '使用帮助'],
    },
    {
        name: '攻略本',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4dc.png',
        color: 'from-slate-50 to-gray-50 border-slate-200',
        desc: '角色攻略你的小游戏，回合制培养好感度。',
        how: [
            '选角色、选场景，一回合回合一回合地攻略。',
            '结局会有结算卡片，可回放历史攻略。',
        ],
        links: ['神经链接', '聊天'],
    },
    {
        name: '都市人生',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3db.png',
        color: 'from-purple-50 to-violet-50 border-purple-200',
        desc: '和角色共同经营的小世界 / 模拟人生。',
        how: [
            '进入后和角色一起生活、经营日常。',
        ],
        links: ['神经链接', '聊天'],
    },
    {
        name: '特别时光',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f338.png',
        color: 'from-pink-50 to-rose-50 border-pink-200',
        desc: '节日 / 纪念日特别活动（情人节、生日等）。',
        how: [
            '在特定日子打开，会有对应角色的特别互动。',
        ],
        links: ['神经链接', '聊天', '日程'],
    },
    {
        name: '音乐',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3b6.png',
        color: 'from-rose-50 to-pink-50 border-rose-200',
        desc: '听歌、音乐播放器。',
        how: [
            '选歌播放，桌面会有正在播放的小组件。',
        ],
        links: ['写歌', '外观'],
    },
    {
        name: '捏声音',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f3a4.png',
        color: 'from-amber-50 to-yellow-50 border-amber-200',
        desc: '给角色定制声音音色（MiniMax）。',
        how: [
            '在「电话」的「捏声音」入口进入，定制音色后用于语音通话。',
        ],
        links: ['电话', '神经链接'],
    },
    {
        name: '捏脸·开发',
        icon: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f527.png',
        color: 'from-amber-50 to-orange-50 border-amber-200',
        desc: '仅开发模式可见。向捏人器指定类目追加自定义部件。',
        how: [
            '在设置页连点 5 下解锁开发模式后出现。',
        ],
        links: ['设置', '神经链接'],
    },
];

const FAQApp: React.FC = () => {
    const { closeApp } = useOS();
    const [tab, setTab] = useState<Tab>('faq');
    const [activeChangelog, setActiveChangelog] = useState<ChangelogEntry | null>(null);

    useEffect(() => {
        try {
            const target = sessionStorage.getItem(FAQ_TARGET_SECTION_KEY);
            if (target) {
                sessionStorage.removeItem(FAQ_TARGET_SECTION_KEY);
                const entry = CHANGELOG_ENTRIES.find(e => e.id === target);
                if (entry) {
                    setTab('changelog');
                    setActiveChangelog(entry);
                }
            }
        } catch { /* ignore */ }
    }, []);

    const handleBack = () => {
        if (activeChangelog) {
            setActiveChangelog(null);
            return;
        }
        closeApp();
    };

    const headerTitle = activeChangelog
        ? activeChangelog.title
        : tab === 'changelog' ? '更新日志'
        : tab === 'guide' ? '使用说明'
        : '常见问题';

    return (
        <div className="h-full w-full bg-slate-50 flex flex-col font-light">
            {/* Header */}
            <div className="bg-white/70 backdrop-blur-md border-b border-white/40 shrink-0 sticky top-0 z-10" style={{ paddingTop: 'var(--safe-top)' }}>
                <div className="flex items-center px-4 py-3">
                    <div className="flex items-center gap-2 w-full">
                        <button onClick={handleBack} className="p-2 -ml-2 rounded-full hover:bg-black/5 active:scale-90 transition-transform">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-slate-600">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                            </svg>
                        </button>
                        <h1 className="text-xl font-medium text-slate-700 tracking-wide">{headerTitle}</h1>
                    </div>
                </div>
            </div>

            {/* Tab switcher (hidden when viewing a specific changelog) */}
            {!activeChangelog && (
                <div className="shrink-0 bg-white/60 backdrop-blur-md border-b border-slate-200/60 px-4 py-2">
                    <div className="inline-flex bg-slate-100 rounded-full p-1 gap-1">
                        <button
                            onClick={() => { setTab('faq'); trackEvent('切换常见问题标签页', { tab: 'faq' }); }}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                tab === 'faq'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-500 active:scale-95'
                            }`}
                        >
                            常见问题
                        </button>
                        <button
                            onClick={() => { setTab('changelog'); trackEvent('切换常见问题标签页', { tab: 'changelog' }); }}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                tab === 'changelog'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-500 active:scale-95'
                            }`}
                        >
                            更新日志
                        </button>
                        <button
                            onClick={() => { setTab('guide'); trackEvent('切换常见问题标签页', { tab: 'guide' }); }}
                            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                                tab === 'guide'
                                    ? 'bg-white text-indigo-600 shadow-sm'
                                    : 'text-slate-500 active:scale-95'
                            }`}
                        >
                            使用说明
                        </button>
                    </div>
                </div>
            )}

            {/* Content area */}
            {activeChangelog ? (
                <div className="flex-1 bg-[#faf7f2] overflow-hidden">
                    <iframe
                        key={activeChangelog.id}
                        src={activeChangelog.src}
                        title={activeChangelog.title}
                        className="w-full h-full border-0"
                    />
                </div>
            ) : tab === 'faq' ? (
                <div className="flex-1 overflow-y-auto p-5 pb-20 no-scrollbar">
                    {/* Intro Banner */}
                    <div className="bg-gradient-to-r from-pink-100 to-indigo-100 p-5 rounded-3xl mb-6 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f338.png" className="w-5 h-5 inline" alt="" /> 新手必读小贴士 <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f338.png" className="w-5 h-5 inline" alt="" />
                        </h2>
                        <p className="text-xs text-slate-600 leading-relaxed opacity-90">
                            欢迎来到这里！为了让你和角色的互动更顺畅，如果遇到问题，请先看看下面有没有答案哦~
                            <br/>
                            (如果不看公告直接提问，大家可能不知道怎么帮你，也会消耗群友的耐心呢)
                        </p>
                    </div>

                    {/* FAQ Cards */}
                    <div className="space-y-4">
                        {FAQ_DATA.map((item, index) => (
                            <div key={index} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
                                <div className="flex items-start gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${item.color.split(' ')[0]}`}>
                                        <img src={item.icon} className="w-5 h-5 inline" alt="" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`text-sm font-bold mb-2 ${item.color.split(' ')[1]}`}>{item.q}</h3>

                                        <div className="space-y-2">
                                            <div className="flex gap-2 items-start">
                                                <span className="text-xs font-bold text-slate-400 shrink-0 mt-0.5">原因:</span>
                                                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap">{item.reason}</p>
                                            </div>
                                            <div className="flex gap-2 items-start bg-slate-50 p-2 rounded-lg">
                                                <span className="text-xs font-bold text-green-500 shrink-0 mt-0.5 flex items-center gap-0.5"><Sparkle size={12} weight="fill" /> 解决:</span>
                                                <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap font-medium">{item.solution}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 text-center text-[10px] text-slate-400">
                        SullyOS Help Center • v1.1
                    </div>
                </div>
            ) : tab === 'changelog' ? (
                <div className="flex-1 overflow-y-auto p-5 pb-20 no-scrollbar">
                    <div className="bg-gradient-to-r from-indigo-100 to-purple-100 p-5 rounded-3xl mb-6 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/2728.png" className="w-5 h-5 inline" alt="" /> 版本更新记录
                        </h2>
                        <p className="text-xs text-slate-600 leading-relaxed opacity-90">
                            这里存放每一次重要更新的详细说明。点击卡片查看完整内容。
                        </p>
                    </div>

                    <div className="space-y-3">
                        {CHANGELOG_ENTRIES.map((entry) => (
                            <button
                                key={entry.id}
                                onClick={() => setActiveChangelog(entry)}
                                className={`w-full text-left bg-gradient-to-br ${entry.accent} border rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform`}
                            >
                                <div className="flex items-start gap-3">
                                    <div className="w-12 h-12 rounded-2xl bg-white/70 flex items-center justify-center shrink-0 shadow-sm">
                                        <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4d6.png" className="w-6 h-6" alt="" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <h3 className="text-sm font-bold text-slate-800">{entry.title}</h3>
                                            <span className="text-[10px] text-slate-500 font-mono shrink-0">{entry.date}</span>
                                        </div>
                                        <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">{entry.subtitle}</p>
                                        <div className="mt-2 text-[11px] font-bold text-indigo-600 flex items-center gap-1">
                                            查看完整更新说明
                                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3"><path d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="mt-8 text-center text-[10px] text-slate-400">
                        SullyOS Changelog • 更多版本将在这里陆续归档
                    </div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto p-5 pb-20 no-scrollbar">
                    {/* Intro Banner */}
                    <div className="bg-gradient-to-r from-sky-100 to-indigo-100 p-5 rounded-3xl mb-6 shadow-sm">
                        <h2 className="text-lg font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f4d6.png" className="w-5 h-5 inline" alt="" /> SullyOS 使用说明
                        </h2>
                        <p className="text-xs text-slate-600 leading-relaxed opacity-90">
                            这里整理了目前系统里所有的 App：它是什么、怎么用、会关联到哪些 App。
                            内容会随版本持续补充，欢迎按名字在桌面找对应的图标。
                        </p>
                    </div>

                    {/* Guide Cards */}
                    <div className="space-y-4">
                        {GUIDE_DATA.map((item, index) => (
                            <div key={item.name} className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 animate-slide-up" style={{ animationDelay: `${index * 30}ms` }}>
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-100">
                                        <img src={item.icon} className="w-5 h-5" alt="" />
                                    </div>
                                    <h3 className="text-sm font-bold text-slate-800">{item.name}</h3>
                                </div>

                                <p className="text-xs text-slate-600 leading-relaxed mb-3">{item.desc}</p>

                                {item.how.length > 0 && (
                                    <div className="bg-slate-50 rounded-lg p-3 space-y-1.5 mb-3">
                                        {item.how.map((step, i) => (
                                            <div key={i} className="flex gap-2 items-start">
                                                <span className="text-xs font-bold text-indigo-500 shrink-0 mt-0.5">{i + 1}.</span>
                                                <p className="text-xs text-slate-700 leading-relaxed">{step}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {item.links.length > 0 && (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <span className="text-[10px] font-bold text-slate-400 shrink-0">关联:</span>
                                        {item.links.map(link => (
                                            <span key={link} className="text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-full px-2 py-0.5">
                                                {link}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 text-center text-[10px] text-slate-400">
                        SullyOS Guide • 使用说明会随新 App 陆续补充
                    </div>
                </div>
            )}
        </div>
    );
};

export default FAQApp;
