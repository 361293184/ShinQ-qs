/**
 * 微信读书域内共享类型（config / shelf / notes / reader）。
 * 字段统一以"宽松 fallback"思路设计：上游网页版内部接口字段偶有变动，
 * 归一化放在 utils/weread/wereadApi.ts 一处，App 组件不直接依赖原始字段。
 */

/** 微信读书在 SullyOS 的本地配置（App『我』页管理，不外发、不写明文日志） */
export interface WereadProfile {
  /** 网页版登录态 cookie（vid / wr_vid / wr_skey 等整串） */
  cookie: string;
  /** 角色感知开关：开 = 角色在聊天里能自然提起最近在读/划线 */
  roleAwareEnabled: boolean;
  /** 最近一次校验成功时的昵称（仅用于『我』页展示，可为空） */
  nickname?: string;
  /** 最近一次校验成功时的用户 vid（辅助书架/感知请求，可为空） */
  vid?: string;
  /** 是否已通过"测试连接"校验过 cookie */
  verified?: boolean;
}

export type WereadReadingStatus = 'reading' | 'finished' | 'wish' | 'unknown';

/** 书架里的书（归一化后） */
export interface WereadBook {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  /** 归一化阅读状态 */
  readingStatus: WereadReadingStatus;
  /** 阅读进度（0-100，网页版 ratio 字段常见，也可能没有） */
  progress: number;
  /** 划线/笔记数（展示用，可为空） */
  markCount?: number;
  noteCount?: number;
  /** 最近阅读/更新时间戳（ms，可为空） */
  updated?: number;
  /** 原始 readingStatus 值（调试/兜底） */
  rawStatus?: number;
}

/** 书籍详情（归一化后） */
export interface WereadBookInfo {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  intro: string;
  category?: string;
}

/** 目录章节（阅读页/续读用） */
export interface WereadChapter {
  /** 章节 uid（正文接口需要） */
  uid: string;
  title: string;
  level: number;
}

/** 划线 / 想法（归一化后） */
export interface WereadNote {
  /** 该笔记所在书 */
  bookId: string;
  bookTitle?: string;
  noteType: 'highlight' | 'thought';
  /** 划线原文 */
  markText?: string;
  /** 想法正文（可在划线之外追加） */
  content?: string;
  chapterTitle?: string;
  /** 创建/更新时间戳 ms（可为空） */
  createdAt?: number;
}

/** 搜索书籍结果（归一化后） */
export interface WereadSearchHit {
  bookId: string;
  title: string;
  author: string;
  cover: string;
  intro: string;
}
