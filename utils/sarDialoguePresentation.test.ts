import { describe, expect, it } from 'vitest';
import { dialogueSentences } from './vrWorld/sarFamiliarity/dialogueText';
import { keepDialogueGuest } from './vrWorld/sarDialogueStaging';
import { getSARDialogueNode, SAR_CAIAN_INTRO_DIALOGUE } from './vrWorld/sarClub';
import { familiarityScene } from './vrWorld/sarFamiliarity/catalog';

describe('SAR dialogue presentation',()=>{
    it('pages sentences without losing punctuation, quotes or quiet pauses',()=>{
        expect(dialogueSentences('你好！再坐一会儿。\n……好。你说“真的吗？！”')).toEqual(['你好！','再坐一会儿。','……好。','你说“真的吗？！”']);
        expect(dialogueSentences('……')).toEqual(['……']);
        expect(dialogueSentences('')).toEqual([]);
    });
    it('only brings in a new guest when they speak, then keeps the whole exchange together',()=>{
        const nodes=SAR_CAIAN_INTRO_DIALOGUE;
        expect(keepDialogueGuest(nodes,'about-sar',2,'caian',false)).toBe(false);
        for(let i=3;i<nodes['about-sar'].lines.length;i++)expect(keepDialogueGuest(nodes,'about-sar',i,'caian',false)).toBe(true);
        expect(keepDialogueGuest(nodes,'about-bioroid',0,'caian',true)).toBe(true);
        expect(keepDialogueGuest(nodes,'about-character-card',0,'caian',true)).toBe(false);
        expect(keepDialogueGuest(nodes,'about-character-card',15,'caian',true)).toBe(false);
        expect(keepDialogueGuest(nodes,'end',0,'caian',true)).toBe(false);
    });
    it('keeps a guest for the reply in a personal scene and tolerates graph cycles',()=>{
        const scene=familiarityScene('A1-SPECIAL')!;
        expect(keepDialogueGuest(scene.nodes,'working',0,'aiven',false)).toBe(false);
        expect(keepDialogueGuest(scene.nodes,'working',1,'aiven',false)).toBe(true);
        expect(keepDialogueGuest(scene.nodes,'working',2,'aiven',true)).toBe(true);
        expect(keepDialogueGuest({loop:{lines:[],next:'loop'}},'loop',0,'aiven',true)).toBe(false);
    });
    it('does not reveal Caian’s embarrassed punchline during Aiven’s setup',()=>{
        const {lines}=getSARDialogueNode('about-sar',{mentionedCharacterCard:false});
        const i=lines.findIndex(l=>l.text==='这里似乎没有仿生人。');
        expect(lines[i].castExpressions?.caian).toBe('curious');
        expect(lines[i+1].castExpressions?.caian).toBe('embarrassed');
    });
});


it('formats spoken prose consistently and preserves stage directions and pauses', async () => {
    const { formatSARDialogue, familiarityLineExpression } = await import('./vrWorld/sarFamiliarity/dialogueText');
    expect(formatSARDialogue('这里随时欢迎你 。')).toBe('这里随时欢迎你。');
    expect(formatSARDialogue('明天继续')).toBe('明天继续。');
    expect(formatSARDialogue('（低头看鱼）')).toBe('（低头看鱼）');
    expect(formatSARDialogue('……')).toBe('……');
    const line = { speaker: 'caian' as const, text: '当了社长。就得有担当。', expression: 'serious' as const, sentenceExpressions: ['serious', 'normal'] as const };
    const authored = { ...line, sentenceExpressions: [...line.sentenceExpressions] };
    expect(familiarityLineExpression(authored, 0)).toBe('serious');
    expect(familiarityLineExpression(authored, 1)).toBe('normal');
    expect(familiarityLineExpression(authored)).toBe('normal');
});

it('star-event portraits change with authored sentence beats for both NPCs', async () => {
    const { FAMILIARITY_SCENES } = await import('./vrWorld/sarFamiliarity/catalog');
    const { familiarityLineExpression } = await import('./vrWorld/sarFamiliarity/dialogueText');
    const { SAR_EXPRESSIONS } = await import('./vrWorld/sarArt');
    for (const scene of FAMILIARITY_SCENES.filter(scene => scene.kind === 'event')) {
        for (const [id, node] of Object.entries(scene.nodes)) {
            let previous = '', consecutive = 0;
            for (const line of node.lines) {
                if (line.speaker !== 'caian' && line.speaker !== 'aiven') { previous = ''; consecutive = 0; continue; }
                for (const [page] of dialogueSentences(line.text).entries()) {
                    const expression = familiarityLineExpression(line, page), key = line.speaker + expression;
                    expect(SAR_EXPRESSIONS[line.speaker]).toContain(expression);
                    consecutive = previous === key ? consecutive + 1 : 1; previous = key;
                    expect(consecutive, scene.id + '/' + id + ': ' + line.text).toBeLessThanOrEqual(3);
                }
            }
        }
    }
});
