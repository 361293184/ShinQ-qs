/**
 * 微信读书「角色感知」注入块组装（纯前端即时对话路径）。
 * 开关开 + cookie 有效时才拉取；失败静默返回 ''，不打断聊天构建。
 */
import { isWereadRoleAwareReady } from './wereadConfig';
import { fetchWereadShelf, fetchWereadNotes } from './wereadApi';
import type { WereadBook } from './types';

const MAX_BOOKS = 5;
const MAX_NOTES_PER_BOOK = 2;
const MAX_NOTE_CHARS = 140;

function pickNoteBooks(shelf: WereadBook[]): WereadBook[] {
  const ranked = [...shelf];
  ranked.sort((a, b) => {
    const av = a.readingStatus === 'finished' ? 1 : a.progress > 0 ? 2 : 3;
    const bv = b.readingStatus === 'finished' ? 1 : b.progress > 0 ? 2 : 3;
    if (av !== bv) return av - bv;
    return (b.updated || 0) - (a.updated || 0);
  });
  return ranked.slice(0, MAX_BOOKS);
}

/**
 * 生成注入块：返回 '' 表示无感知数据（开关关 / 未登录 / 书架空 / 出错）。
 * 内容含「可自然聊起但不点破数据源、不逐条播报、不硬转话题」的提示。
 */
export async function buildWereadPerceptionContext(): Promise<string> {
  try {
    if (!isWereadRoleAwareReady()) return '';
    const shelf = await fetchWereadShelf();
    const picks = pickNoteBooks(shelf);
    if (picks.length === 0) return '';

    const lines: string[] = [];
    for (const b of picks) {
      const statusNote = b.readingStatus === 'finished'
        ? '已读完'
        : b.progress > 0
          ? `读到 ${Math.round(b.progress)}%`
          : b.readingStatus === 'wish'
            ? '想读'
            : '在读';
      const head = `- 《${b.title}》${statusNote}${b.author ? `（${b.author}）` : ''}`;
      const sub: string[] = [head];
      try {
        const notes = await fetchWereadNotes(b.bookId);
        for (const n of notes.slice(0, MAX_NOTES_PER_BOOK)) {
          const raw = n.noteType === 'thought' ? (n.content || n.markText) : (n.markText || n.content);
          if (!raw) continue;
          const clipped = raw.length > MAX_NOTE_CHARS ? `${raw.slice(0, MAX_NOTE_CHARS)}…` : raw;
          sub.push(n.noteType === 'thought' ? `    · 想法：${clipped}` : `    · 划线：「${clipped}」`);
        }
      } catch {
        // 单本笔记失败跳过，不影响其余书目
      }
      lines.push(sub.join('\n'));
    }

    return [
      '',
      '【用户最近在读】（角色感知开关已开，这是用户本人微信读书账号的真实数据）：',
      '（规则：可以自然聊起这些书或划线；但不要点破这是"感知/数据源/读出来的"，不要逐条播报，不要硬把话题转去书）',
      lines.join('\n'),
      '',
    ].join('\n');
  } catch (e) {
    console.warn('[Weread] perception context build failed:', e);
    return '';
  }
}
