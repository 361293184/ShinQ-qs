import type { FamiliarityLine } from './types';

/** Spoken SAR prose ends consistently; UI labels and parenthesized stage directions stay separate. */
export function formatSARDialogue(text: string): string {
    const value = text.trim().replace(/\s+([，。！？])/gu, '$1').replace(/\?/g, '？').replace(/!/g, '！');
    if (!value || /^[（(][\s\S]*[）)]$/u.test(value) || /[。！？…—.][”’」』）)]*$/u.test(value)) return value;
    return value + '。';
}

/** Presentation only: keep authored line indices (and saved story progress) intact. */
export function dialogueSentences(text: string): string[] {
    return (text.match(/[^。！？!?\n]*[。！？!?]+[”’」』）)]*|[^。！？!?\n]+/gu) || [])
        .map(formatSARDialogue).filter(Boolean);
}

/** A completed authored line carries the expression from its final displayed sentence. */
export function familiarityLineExpression(line: FamiliarityLine, sentence = Math.max(0, dialogueSentences(line.text).length - 1)) {
    return line.sentenceExpressions?.[sentence] || line.expression || 'normal';
}
