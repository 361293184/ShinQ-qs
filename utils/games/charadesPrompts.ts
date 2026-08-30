/**
 * 「你说我猜」prompt 模板 + 主持人「牌灵」本地播报模板。
 *
 * - 主持人播报（出词/答对/揭晓/换人/违规）：本地模板，0ms，不调 API。
 * - 主持人趣味吐槽：低频调副 API（默认每 2 轮 1 次）。
 * - 描述 prompt / 猜词 prompt：结构化模板，适配 Gemini flash。
 */

/** 主持人名字 */
export const HOST_NAME = '牌灵';

/** 主持人本地播报模板 */
export function hostLine(kind: string, ...args: string[]): string {
    switch (kind) {
        case 'newWord':
            return `🔔 新词！大家准备好——`;
        case 'describeTurn':
            return `🎤 轮到 ${args[0]} 描述！限时 ${args[1]} 秒，开猜！`;
        case 'correct':
            return `🎉 答对！${args[0]} +1 分，${args[1]} +1 分！`;
        case 'reveal':
            return `😅 没人猜中，揭晓答案：${args[0]}！换下一个词~`;
        case 'summary':
            return `🏁 ${args[0]} 本轮共猜中 ${args[1]} 个！换下一位描述者！`;
        case 'forbidden':
            return `🚨 违规！不能说「${args[0]}」字（${args[1]} 次）！`;
        case 'describerOut':
            return `💥 ${args[0]} 违规 2 次，提前下台！换人！`;
        case 'roundAll':
            return `🏆 全部轮次结束！来看看最终成绩！`;
        case 'clue':
            return `🤔 再给点提示吧~`;
        case 'nextDescriber':
            return `🔄 下一位：${args[0]} 上场！`;
        default:
            return '';
    }
}

/** 主持人趣味吐槽（每 2 轮 1 次调副 API） */
export const HOST_BANTER_PROMPT = (context: string) =>
    `你是一个爱起哄、有梗的综艺节目主持人，叫「牌灵」。根据下面的你说我猜现场，说一句简短（30字内）的吐槽或起哄，活跃气氛，不用报结果。\n现场：${context}\n直接输出这句话。`;

/** 描述者 prompt：角色/NPC 描述当前词（不能说词中字） */
export function describePrompt(name: string, word: string, bannedChars: string[], personaHint: string, clueCount: number): string {
    return [
        `你是「${name}」${personaHint}，正在玩「你说我猜」综艺局。`,
        `现在轮到你描述词「${word}」给其他人猜。`,
        `规则：不能说词里的任何字（${bannedChars.join('、')}），也不能直接念出答案。`,
        `这是第 ${clueCount} 条提示。用一句简短（20字内）的话描述它，说一次就好。`,
        `直接输出你的描述，不要加引号和前缀。`,
    ].join('\n');
}

/** 猜词者 prompt：角色/NPC 根据线索猜词 */
export function guessPrompt(name: string, personaHint: string, clues: string[], guessCount: number): string {
    return [
        `你是「${name}」${personaHint}，正在玩「你说我猜」。`,
        `描述者给的线索如下：`,
        ...clues.map((c, i) => `${i + 1}. ${c}`),
        ``,
        `请你猜一个最可能的词。`,
        `规则：${guessCount === 0 ? '线索不足时，如果你不确定，就回一句短反问或"再给点提示"，别乱猜；只有线索足够明确才给出答案。' : '线索较多，请给出你的答案。'}`,
        `直接输出：要么是一个词（2~6字），要么是一句短反问（15字内）。不要解释。`,
    ].join('\n');
}

/** AI 出题：生成一个词（已定义在 gameApi.generateAWord，这里不放） */
