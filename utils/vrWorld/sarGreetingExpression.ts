import type { SARExpression } from './sarArt';

/** 只给三句日常问候配表情；有原稿的剧情仍严格使用原稿，尤其不提前泄露 embarrassed 包袱。 */
function preferredGreetingExpression(npc: 'caian' | 'aiven', text: string, index: number): SARExpression {
    if (npc === 'caian') {
        if (/深了|上学|周一|下雨|带伞/.test(text)) return 'serious';
        if (/[？?]|怎么|研究|艾文/.test(text)) return 'curious';
        if (/好|不错|加油|休息|周末|耶|太阳/.test(text)) return 'happy';
        return (['happy', 'normal', 'curious'] as const)[index % 3];
    }
    if (/没睡|夜深|早起|通宵/.test(text)) return 'sleeping';
    if (/上课|周一|还有四天/.test(text)) return 'sad';
    if (/鱼|水|雨|浮标|太阳|云/.test(text)) return 'interested';
    if (/好|不用|周末/.test(text)) return 'happy';
    return (['normal', 'interested', 'happy'] as const)[index % 3];
}

export function sarGreetingExpression(npc: 'caian' | 'aiven', text: string, index: number, previous?: SARExpression): SARExpression {
    const preferred = preferredGreetingExpression(npc, text, index);
    return preferred === previous ? previous === 'normal' ? (npc === 'caian' ? 'curious' : 'interested') : 'normal' : preferred;
}
