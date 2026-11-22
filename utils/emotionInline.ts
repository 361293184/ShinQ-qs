/**
 * 情绪并入主 API —— 让主回复顺带产出情绪自评，不再单独发一次评估请求。
 *
 * 过去情绪评估是一次独立请求（副 API）：同一份 system prompt + 完整对话历史要再发一遍，
 * 再等模型生成 1~2k token 的 JSON。并入后主模型在正常回复结束处多输出一个控制块：
 *
 *     <情绪>{"changed":true,"buffs":[…],"injection":"…","innerState":"…"}</情绪>
 *
 * 客户端在落库前把它整块剥出来（正文一个字都不改），再交给既有的
 * `applyEmotionEvalRaw` 落地 —— 解析容错、buff 写库、意识流缓存全部复用，不另起一套。
 *
 * 三条红线：
 * 1. 控制块**绝不能**出现在聊天气泡里：流式预览扣住、落库前剥离，两道都要有。
 * 2. 没吐块 / 吐了半截都不算事故：正文照常落库，情绪这一轮不更新即可。
 * 3. 这个模块是纯函数叶子（零浏览器 / 零 DB 依赖），worker 侧也能引。
 */

/** 控制块的开闭标记。标签内的空白容错（模型偶尔写成 `< 情绪 >`）。 */
const OPEN_RE = /<\s*情\s*绪\s*>/;
const CLOSE_RE = /<\s*\/\s*情\s*绪\s*>/;

export interface InlineEmotionExtract {
    /** 剥掉控制块之后的正文（可以原样交给后处理管线）。 */
    content: string;
    /** 控制块里的原文；没有块时为空串。 */
    raw: string;
    /** 是否找到了完整闭合的块。false 时 content 仍然可用，只是情绪可能不完整。 */
    closed: boolean;
}

/** 去掉首尾空行，但保留正文内部的换行。 */
const trimBlankEdges = (text: string): string => text.replace(/^[ \t]*\r?\n/, '').replace(/\s+$/, '');

/**
 * 从模型输出里剥出情绪控制块。
 *
 * - 完整块：正文 = 块前 + 块后（中间补一个换行，避免前后粘连）。
 * - 未闭合（被 max_tokens 截断）：正文 = 块前，raw 取块后全部；此时情绪能否解析交给
 *   parseEmotionEvalOutput 的修复链，正文绝不会跟着烂掉。
 * - 没有块：原样返回。
 */
export function extractInlineEmotionBlock(text: string): InlineEmotionExtract {
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
 * 拼出注入主请求的那段 system 指令。
 *
 * `ruleBody` 直接复用 `buildEmotionEvalPrompt(..., 'none')` 的规则正文 —— 情绪判断的
 * 全部细则（共情模式、锚定型、语气信号…）与独立评估逐字同源，不维护第二份会漂移的规则。
 * 这里只补「什么时候输出、输出成什么样」。
 */
export function buildInlineEmotionInstruction(ruleBody: string): string {
    return `【系统内部任务 · 不改变你现在扮演的角色】
下面这段是给你自己的后台自评：先照常把这一轮的话说完，再在末尾附上情绪控制块。
不要向对方提起这段任务，也不要因此切成「分析者」的口吻。

${ruleBody}

## 输出方式（本轮与正常回复同一次生成）

按上面的人设与规则，先把这一轮该说的话**正常说完**。全部正文结束后，另起一行输出一个控制块：

${'<情绪>'}
{"changed": true, "buffs": [], "injection": "", "innerState": "第一人称的内心独白"}
${'</情绪>'}

硬性要求：
- 这个块是系统读的，**绝不会显示给对方**，一个字都不要写进聊天气泡，也不要为它加开场白。
- 块内只放一个 JSON 对象，不要 Markdown 代码围栏、不要注释、不要块外再解释。
- 情绪没有明显变化时：changed 为 false，buffs 与 injection 可以省略，但 innerState 每次都要写。
- 正文里已经说出口的话不要在这里重复；这里只写情绪结论与没说出口的心里话。`;
}
