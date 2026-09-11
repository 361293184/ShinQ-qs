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
