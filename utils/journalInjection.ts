/**
 * 手账感知注入 —— 把用户手账（techo）作为「潜意识背景」注入角色对话上下文。
 *
 * 设计原则（与生活记录注入 buildLifeRecordInjection 同源）：
 *   - 手账是用户自己写的，所以措辞是「自然流露」——角色像「隐约知道」你今天干嘛，
 *     而不是像在看报表。不要主动点破、不要逐条复述。
 *   - 角色要不要说、怎么说，完全按角色性格来；这里只提供背景，不驱动角色必须开口。
 *   - 同步实现（手账存 localStorage），在 buildSystemPromptParts 里加 1 行即可，
 *     不碰消息组装的并发取数结构。
 */
import { CharacterProfile } from '../types';
import { todayStr, getDay, getHabits } from './techoStore';

/** 门控：角色是否开启「手账感知」。默认关（opt-in）。 */
export const isJournalSensingOn = (char: CharacterProfile): boolean => char.journalSensingEnabled === true;

/**
 * 生成手账「潜意识背景」文本。返回 '' 表示不注入。
 *
 * 注入内容（都是用户自己写进手账的）：
 *   - 今天的时间轴任务 & Todo（做了的、没做的）
 *   - 今天未打卡的习惯
 *   - 今天的碎碎念
 *
 * 措辞照抄生活记录：潜意识背景 / 不要点破 / 自然流露 / 不逐条复述。
 */
export const buildJournalInjection = (
    char: CharacterProfile,
    userName: string,
): string => {
    if (!isJournalSensingOn(char)) return '';

    try {
        const today = todayStr();
        const day = getDay(today);
        const habits = getHabits();

        const timeline = day.timeline || [];
        const todos = day.todos || [];
        const notes = day.notes || '';
        const pendingHabits = habits.filter(h => !(h.checkins && h.checkins[today]));

        // 今天要做的事（时间轴 + todo）
        const plans = [...timeline.map(t => `${t.time} ${t.text}${t.done ? '（已做）' : '（待做）'}`),
            ...todos.map(t => `${t.text}${t.done ? '（已做）' : '（待做）'}`)];

        if (plans.length === 0 && pendingHabits.length === 0 && !notes.trim()) {
            return ''; // 今天手账是空的，不注入
        }

        let s = `\n### ${userName} 的手账（潜意识背景）\n`;
        s += `以下是 ${userName} 自己写的手账内容，是你了解 TA 今天安排的背景依据——**不要主动点破、不要逐条复述、不要表现得像在看报表**。` +
            `只在自然的时机自然地流露出来（例如 TA 提到要去某处时，你"隐约记得"TA 手账里确实有这一笔）。说与不说、怎么说，随你的性格与当下氛围决定。\n\n`;

        const lines: string[] = [];
        if (plans.length > 0) {
            lines.push(`- 今天打算/要做：${plans.join('；')}`);
        }
        if (pendingHabits.length > 0) {
            lines.push(`- 今天还没打卡的习惯：${pendingHabits.map(h => `${h.icon}${h.name}`).join('、')}`);
        }
        if (notes.trim()) {
            lines.push(`- 碎碎念里提到：${notes.trim()}`);
        }
        s += lines.join('\n');
        s += '\n';
        return s;
    } catch (e) {
        return ''; // 任何异常不阻断对话
    }
};
