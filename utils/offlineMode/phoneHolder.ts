/**
 * 线下模式 · 手机在谁手里（道具状态）。
 *
 * 三个状态就是方案文档 §4.1 的三种显示：
 *   me   = 你自己的手机在你手上（默认，老会话无感）
 *   none = 你手上是空的（你的手机在角色手里）
 *   char = 角色的手机在你手上
 *
 * 状态由**主 API 判断**、以一条内联标记的形式输出（`[[手机:他]]`），不由前端文案反推——
 * 因为「他顺手把你的手机拿走了，什么都没说」这种情况根本不存在可以拿来判断的句子。
 * 标记本身不进聊天流：落库前剥掉（见 applyAssistantPostProcessing 的 persistMessage）。
 *
 * 存储：按角色存在 localStorage。它不是"角色设定"，是"这一场戏的现场状态"，
 * 所以不进 IndexedDB 的角色档案（换设备不同步是预期行为）。
 */

export type PhoneHolder = 'me' | 'none' | 'char';

const KEY_PREFIX = 'os_offline_phone_holder_';
const EVENT_NAME = 'os-offline-phone-holder';

const keyFor = (charId: string) => `${KEY_PREFIX}${charId}`;

export const readPhoneHolder = (charId?: string): PhoneHolder => {
    if (!charId) return 'me';
    try {
        const raw = localStorage.getItem(keyFor(charId));
        return raw === 'none' || raw === 'char' ? raw : 'me';
    } catch {
        return 'me';
    }
};

export const writePhoneHolder = (charId: string, holder: PhoneHolder): void => {
    try {
        if (holder === 'me') localStorage.removeItem(keyFor(charId));
        else localStorage.setItem(keyFor(charId), holder);
    } catch { /* 存不下也不影响本场 */ }
    try {
        window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { charId, holder } }));
    } catch { /* 非浏览器环境忽略 */ }
};

/** 订阅状态变化（本场写入时触发），返回取消订阅函数 */
export const subscribePhoneHolder = (
    listener: (charId: string, holder: PhoneHolder) => void,
): (() => void) => {
    const handler = (event: Event) => {
        const detail = (event as CustomEvent<{ charId?: string; holder?: PhoneHolder }>).detail;
        if (!detail?.charId || !detail.holder) return;
        listener(detail.charId, detail.holder);
    };
    window.addEventListener(EVENT_NAME, handler);
    return () => window.removeEventListener(EVENT_NAME, handler);
};

/** 标记里允许写的值，中英文都收：「我 / 空 / 他 / ta / me / none / char」 */
const MARKER_RE = /\[\[\s*手机\s*[:：]\s*([^\]\s]{1,6})\s*\]\]/g;

const normalize = (token: string): PhoneHolder | null => {
    const value = token.trim().toLowerCase();
    if (value === 'me' || value === '我' || value === '我的') return 'me';
    if (value === 'none' || value === '空' || value === '无') return 'none';
    if (value === 'char' || value === '他' || value === '她' || value === 'ta' || value === '对方') return 'char';
    return null;
};

/**
 * 从模型输出里抽出手机状态标记：返回最后一次出现的状态 + 剥掉标记后的正文。
 * 标记只在真的易手时才出现，所以拿不到就是"没变化"，不要当成 me 覆盖掉当前状态。
 */
export const extractPhoneHolderMarker = (raw: string): { holder: PhoneHolder | null; text: string } => {
    if (!raw || !raw.includes('手机')) return { holder: null, text: raw };
    // 用对象装结果：写在 replace 回调里，TS 不会把变量窄化成 null
    const found: { value: PhoneHolder | null } = { value: null };
    const text = raw.replace(MARKER_RE, (_whole, token: string) => {
        const parsed = normalize(token);
        if (parsed) found.value = parsed;
        return '';
    });
    if (found.value === null) return { holder: null, text: raw };
    // 标记独占一行时剥掉会留下空行，顺手收掉
    const cleaned = text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return { holder: found.value, text: cleaned };
};

/** 只剥标记、不关心状态（落库前的保险） */
export const stripPhoneHolderMarker = (raw: string): string => extractPhoneHolderMarker(raw).text;
