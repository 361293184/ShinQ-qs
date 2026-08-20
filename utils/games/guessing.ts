/**
 * 「你说我猜」代码判定层（零 AI）。
 *
 * - 严格匹配：猜词 === 答案 或 猜词包含答案全文（如答案"大象"，猜"大象""大象吗"均算对）。
 * - 谐音/同义词不判定为对（用户已定：不放宽）。
 * - 描述者违禁字检测：描述里出现答案中任意字 → 违规（累计 2 次换人）。
 */

/** 猜词判定：返回是否命中。猜词先去掉常见语气词/标点再判断。 */
export function isCorrectGuess(guessRaw: string, answer: string): boolean {
    const guess = normalizeGuess(guessRaw);
    const ans = answer.trim().toLowerCase();
    if (!guess || !ans) return false;
    if (guess === ans) return true;
    // 猜词包含答案全文（如"大象""大象吗""是不是大象"）均算对
    if (guess.includes(ans)) return true;
    // 答案若为单字（少见），等长单字也可
    if (ans.length === 1 && guess.includes(ans)) return true;
    return false;
}

/** 描述者违禁字检测：描述中是否出现答案中的任意字（答案整体不计） */
export function forbiddenInGuess(descriptionRaw: string, answer: string): string | null {
    const desc = descriptionRaw.trim().toLowerCase();
    const ans = answer.trim().toLowerCase();
    if (!desc || !ans) return null;
    // 去掉标点/空格，逐字匹配（中文单字命中即违规）
    const chars = [...ans];
    for (const ch of chars) {
        if (ch.trim() && desc.includes(ch)) {
            return ch;
        }
    }
    return null;
}

/** 去掉语气词、问号、标点、空格，归一化为可用于严格匹配的形式。 */
function normalizeGuess(raw: string): string {
    return raw
        .toLowerCase()
        // 去掉常见语气/提问后缀
        .replace(/吗|呢|吧|啊|呀|嘛|？|\?|！|!|。|，|,|的$|是不是|对不对/g, '')
        // 去掉开头"是/是"等
        .replace(/^(是|是|嗯|对|对的对的|我猜|我觉得|我知道了|应该是|是不是)/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, '')
        .trim();
}
