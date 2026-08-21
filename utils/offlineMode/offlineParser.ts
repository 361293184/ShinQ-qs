/**
 * 线下模式行级解析器。
 *
 * 核心思路（方案 v1）：只做「行首是不是引号」这一件事，不做任何语义判断。
 * - 行首引号 → 台词（dialogue）
 * - 否则 → 旁白（narration）
 * - 相邻同类合并成一段；台词段「未闭合」（有开引号没闭引号）时，后续旁白行继续并入，
 *   直到出现闭合引号或新台词行——这样模型把台词折行时不会中途被打断。
 * - 残留的 [emotion] 立绘标签（模型偶尔从 VN 风格里带出来）在旁白行行首清掉。
 *
 * 最坏情况永远是「可读的错位」，不会把格式炸掉。
 */

export interface OfflineSegment {
    type: 'narration' | 'dialogue';
    text: string;
}

/** 行首开引号（含 ASCII 半角双引号，模型很常用） */
const OPEN_QUOTE_RE = /^["「『"]/u;
/** 段尾闭引号 */
const CLOSE_QUOTE_RE = /["」』"]$/u;
/** 行首 [emotion] 立绘标签，如 [normal] [shy] [angry] */
const EMOTION_TAG_RE = /^\[[a-zA-Z_]+\]\s*/;
/** 成对引号整体剥掉（首尾都是引号时） */
const PAIRED_QUOTE_RE = /^["「『"]([\s\S]*?)["」』"]$/;

export const isQuoteStartLine = (line: string): boolean => OPEN_QUOTE_RE.test(line.trim());

const stripOuterQuotes = (text: string): string => {
    const t = text.trim();
    const paired = PAIRED_QUOTE_RE.exec(t);
    const inner = paired ? paired[1] : t.replace(OPEN_QUOTE_RE, '');
    // 多行台词合并后，行内残留的成对引号（每行各包一组的场景）一并清掉
    return inner.replace(/["」』"]/g, '').trim();
};

/** 台词段是否已闭合（以闭引号收尾） */
const isDialogueClosed = (text: string): boolean => CLOSE_QUOTE_RE.test(text.trim());

/**
 * 把线下模式原始文本解析成分段列表。
 * 段落按渲染类型合并：连续旁白/连续台词各自合并成一段；
 * 台词段未闭合时吸收后续旁白行（台词折行容错）。
 */
export const parseOfflineMessage = (text: string): OfflineSegment[] => {
    if (!text) return [];
    const lines = String(text).split('\n');
    const segs: OfflineSegment[] = [];
    let pendingType: 'narration' | 'dialogue' | null = null;
    let pending = '';

    const flush = () => {
        if (!pending) return;
        if (pendingType === 'dialogue') {
            segs.push({ type: 'dialogue', text: stripOuterQuotes(pending) });
        } else {
            segs.push({ type: 'narration', text: pending.trim() });
        }
        pending = '';
        pendingType = null;
    };

    for (const raw of lines) {
        const line = raw.trim();
        if (!line) {
            flush();
            continue;
        }
        let type: 'narration' | 'dialogue' = OPEN_QUOTE_RE.test(line) ? 'dialogue' : 'narration';

        // 台词折行容错：当前是旁白行，但上一段是未闭合台词 → 继续并入台词
        if (type === 'narration' && pendingType === 'dialogue' && !isDialogueClosed(pending)) {
            pending += '\n' + line;
            continue;
        }

        if (pendingType && type !== pendingType) flush();
        pendingType = type;
        pending += (pending ? '\n' : '') + (type === 'narration' ? line.replace(EMOTION_TAG_RE, '') : line);
    }
    flush();
    return segs;
};

/** 是否「含台词」（决定主动消息要不要打扰通知）：解析后存在 dialogue 段即算。 */
export const hasDialogue = (segs: OfflineSegment[]): boolean =>
    segs.some((s) => s.type === 'dialogue');
