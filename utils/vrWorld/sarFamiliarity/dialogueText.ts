/** Presentation only: keep authored line indices (and saved story progress) intact. */
export function dialogueSentences(text: string): string[] {
    return (text.match(/[^。！？!?\n]*[。！？!?]+[”’」』）)]*|[^。！？!?\n]+/gu) || [])
        .map(sentence => sentence.trim()).filter(Boolean);
}
