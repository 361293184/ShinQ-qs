/**
 * 「你说我猜」自动 NPC 模板池。
 *
 * - 自动 NPC 是临时搭台的：名字 + 性格标签 + 口头禅，本地模板池随机组合，一局散场下局全新。
 * - 与指定角色（有完整人设+记忆）明确区分。
 * - 头像：色圆 + 首字母（按名字哈希取色，同名同色）。
 */

export interface NpcProfile {
    id: string;
    name: string;
    /** 性格标签（prompt 用） */
    persona: string;
    /** 口头禅（猜词/描述时偶尔带） */
    catchphrase: string;
    /** 头像色（hsl 色相） */
    hue: number;
    isNpc: true;
}

const NPC_NAMES = ['阿明', '小美', '大壮', '晓雪', '阿豪', '静静', '老周', '莉莉', '阿凯', '盼盼'];
const NPC_PERSONAS = [
    '反应很快，爱抢答',
    '慢热但一猜就中',
    '爱起哄，喜欢调侃',
    '谨慎，线索不足不轻易猜',
    '记性好，常记得之前说的词',
    '幽默，描述喜欢抖机灵',
];
const NPC_CATCHPHRASES = ['看我！', '这题我会！', '嘿嘿，别提示我', '我晓得了', '再给点线索', '就这？'];

/** 字符串哈希 → 色相（0~360），同名同色 */
export function hashHue(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h * 31 + str.charCodeAt(i)) % 360;
    }
    return h;
}

let npcSeq = 0;

/** 生成一个 NPC */
export function createNpc(name?: string): NpcProfile {
    const n = name || NPC_NAMES[npcSeq % NPC_NAMES.length];
    npcSeq++;
    const persona = NPC_PERSONAS[Math.floor(Math.random() * NPC_PERSONAS.length)];
    const catchphrase = NPC_CATCHPHRASES[Math.floor(Math.random() * NPC_CATCHPHRASES.length)];
    return {
        id: `npc-${Date.now()}-${npcSeq}`,
        name: n,
        persona,
        catchphrase,
        hue: hashHue(n),
        isNpc: true,
    };
}

/** 按目标人数补 NPC（避免同名重复） */
export function createNpcs(count: number, existingNames: string[]): NpcProfile[] {
    const used = new Set(existingNames);
    const npcs: NpcProfile[] = [];
    let attempts = 0;
    while (npcs.length < count && attempts < 60) {
        attempts++;
        const base = NPC_NAMES[Math.floor(Math.random() * NPC_NAMES.length)];
        if (used.has(base)) continue;
        used.add(base);
        npcs.push(createNpc(base));
    }
    return npcs;
}

/** 渲染头像底色样式 */
export function avatarColor(hue: number): string {
    return `hsl(${hue}, 55%, 45%)`;
}
