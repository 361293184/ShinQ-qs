/**
 * 日程并入主 API —— 当天第一条消息顺带把今天的日程生成掉。
 *
 * 过去这一天第一次打开聊天页时，会单独发一次「生成当日日程」请求（完整角色上下文 +
 * 聊天历史重复发一遍）。现在改成：主请求里追加一段日程任务说明，模型在正文之前先输出
 *
 *     <日程>{"slots":[…],"flowNarrative":{…},"homeVisits":…}</日程>
 *
 * 客户端剥离后走既有解析/落库（buildScheduleFromParsed + persistGeneratedSchedule），
 * 与独立生成路径共用同一份归一化逻辑。
 *
 * 边界与情绪内联一致：
 * 1. 块绝不能进聊天气泡（流式预览扣住、落库前剥离）；
 * 2. 只有「今天还没有日程」时才注入，有日程的那一天一个字都不多花；
 * 3. 解析失败 / 没吐块都不算事故：正文照常落库，下一轮再试。
 */

const OPEN_RE = /<\s*日\s*程\s*>/;
const CLOSE_RE = /<\s*\/\s*日\s*程\s*>/;

export interface InlineScheduleExtract {
    /** 剥掉控制块之后的正文。 */
    content: string;
    /** 控制块里的原文；没有块时为空串。 */
    raw: string;
    /** 是否找到了完整闭合的块。 */
    closed: boolean;
}

const trimBlankEdges = (text: string): string =>
    text.replace(/^[ \t]*\r?\n/, '').replace(/\s+$/, '');

/** 从模型输出里剥出日程控制块（规则与情绪块一致，见 utils/emotionInline.ts）。 */
export function extractInlineScheduleBlock(text: string): InlineScheduleExtract {
    const source = typeof text === 'string' ? text : '';
    if (!source) return { content: '', raw: '', closed: false };

    const open = source.match(OPEN_RE);
    if (!open || open.index == null) return { content: source, raw: '', closed: false };

    const before = source.slice(0, open.index);
    const afterOpen = source.slice(open.index + open[0].length);
    const close = afterOpen.match(CLOSE_RE);

    if (!close || close.index == null) {
        return {
            content: trimBlankEdges(before),
            raw: trimBlankEdges(afterOpen),
            closed: false,
        };
    }

    const raw = afterOpen.slice(0, close.index);
    const after = afterOpen.slice(close.index + close[0].length);
    const head = trimBlankEdges(before);
    const tail = trimBlankEdges(after);
    const content = head && tail ? `${head}\n${tail}` : (head || tail);
    return { content, raw: trimBlankEdges(raw), closed: true };
}

/**
 * 拼出注入主请求的日程任务段。
 *
 * `taskPrompt` 直接复用 `buildScheduleTaskPrompt`（生活系 / 意识系 + 家园 + 串门），
 * 保证与独立生成路径的规则逐字同源；这里只补「什么时候输出、放在哪」。
 */
export function buildInlineScheduleInstruction(taskPrompt: string): string {
    return `【系统内部任务 · 不改变你现在扮演的角色】
今天你还没为自己安排过这一天的作息。请先按下面的要求生成今天的日程，再按这份日程回复对方。
不要向对方提起这段任务。

${taskPrompt}

## 输出方式（本轮与聊天回复同一次生成）

把上面要求的 JSON 放进下面这个控制块（整块不会显示给对方）：

${'<日程>'}
{"slots": [], "flowNarrative": {}}
${'</日程>'}

硬性要求：
- 先输出日程块，再写聊天正文；正文里此刻在做什么，要和这份日程对得上。
- 块内只放一个 JSON 对象，不要 Markdown 代码围栏、不要在块外解释。
- 只输出今天这一份，不要写明天的。`;
}
