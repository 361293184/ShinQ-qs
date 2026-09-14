/**
 * 信纸渲染。
 *
 * 配色整套跟着节日换（见 utils/letter/paperThemes.ts）：纸底色 / 墨色 / 年份章色 / 火漆色。
 * 右上角年份章，右下角（正文里的）落款，两边不打架。
 *
 * 两种形态（由 theme.festive 分流）：
 *   - 普通主题：单层信纸（改动前原样，逐像素不变），霞鹜文楷 + 逐字微扰（手写感）
 *   - 新年（除夕/春节）：深红金线信笺 —— 整片深红底、金线框与四角回纹角花、
 *     顶部线描烟花与金色标题，米白正文直接写在红底上（不再有「米色内页」那一层）
 *
 * 字体：两套字体栈，但**信内永远只用其中一套**，且都不加粗。
 *   - 普通主题：霞鹜文楷（手写感）
 *   - 新年：系统宋体（印刷体，与「信笺」的正式感一致）
 * 楷体字库只有 400 字重，合成加粗会让观感变成另一种字；宋体虽有真实字重，
 * 也只用到 600 —— 层次一律靠字号 / 字距 / 对齐建立，不靠粗体。
 */

import React, { useRef } from 'react';
import type { LetterRecord } from '../../types';
import { getPaperTheme } from '../../utils/letter/paperThemes';
import { HANDWRITING_STACK, SERIF_STACK } from '../../utils/letter/fontStacks';
import HandwritingText from './HandwritingText';
import LetterScrollBar from './LetterScrollBar';
import { CornerOrnament, FireworkBurst } from './StationeryOrnaments';
import './LetterPaper.css';

/**
 * 信纸内**所有**文字共用的一套字体样式。
 * 字库只有 400 字重 —— 任何位置都不要再加粗（浏览器会做合成加粗：笔画变粗、观感像另一种字）。
 * 层次一律靠字号 / 字距 / 对齐建立。
 */
const HW_TEXT: React.CSSProperties = {
    fontFamily: HANDWRITING_STACK,
    fontWeight: 400,
    lineHeight: 1.95,
    letterSpacing: 0,
};

/** 小号手写（年份章 / 图注 / 占位文案）：字号小，稍收行高。 */
const HW_SMALL: React.CSSProperties = {
    fontFamily: HANDWRITING_STACK,
    fontWeight: 400,
    letterSpacing: '0.02em',
};

/** 信笺正文：宋体、行距疏朗（信笺的「疏朗」几乎全靠线距）。 */
const SERIF_TEXT: React.CSSProperties = {
    fontFamily: SERIF_STACK,
    fontWeight: 400,
    lineHeight: 1.95,
    letterSpacing: '0.01em',
};

/** 信笺小字（年份章 / 图注）：宋体、字距稍开。 */
const SERIF_SMALL: React.CSSProperties = {
    fontFamily: SERIF_STACK,
    fontWeight: 400,
    letterSpacing: '0.06em',
};

interface LetterPaperProps {
    letter: LetterRecord;
    className?: string;
    /**
     * 让正文区独立滚动：抬头（标题）与页脚（祝语）钉在纸上不动，只有正文跟着手指走。
     * 高度上限由外层给（max-h + min-h-0），信纸只在被压到上限后才在内部产生滚动；
     * 内容比上限短时信纸仍是自适应高度，不会留一片空白纸。
     */
    scrollBody?: boolean;
}

const LetterPaper: React.FC<LetterPaperProps> = ({ letter, className, scrollBody }) => {
    const theme = getPaperTheme(letter.paperTheme);
    /** 新年信笺的正文滚动容器（自绘的常驻滚动条要监听它）。 */
    const bodyScrollRef = useRef<HTMLDivElement>(null);
    const isAnniversary = !!letter.occasion.isAnniversary;
    /** 节庆主题（新年）：走「红包壳 + 米色内页」双层结构；其他主题一行不差走单层。 */
    const festive = !!theme.festive;
    const gold = theme.innerBorder || '#C9A227';
    /** 信内墨色：浅色纸上用主题墨；新年是米白直接落在深红上，同样取自主题墨。 */
    const bodyInk = theme.ink;
    /** 信内装饰色（图注 / 夹图描边）。 */
    const accent = festive ? gold : theme.stamp;
    /** 正文 / 落款 / 小字的字体样式：新年走宋体，其他节日走手写楷体。 */
    const bodyTextStyle: React.CSSProperties = festive ? { ...SERIF_TEXT, fontSize: 15.5 } : { ...HW_TEXT, fontSize: 15.5 };
    const signTextStyle: React.CSSProperties = festive
        ? { ...SERIF_TEXT, fontSize: 19, lineHeight: 1.9, letterSpacing: '0.08em' }
        : { ...HW_TEXT, fontSize: 20, lineHeight: 2, letterSpacing: '0.06em' };
    const smallTextStyle: React.CSSProperties = festive ? SERIF_SMALL : HW_SMALL;

    /**
     * 正文段落 —— 一套渲染入口，两种字面。
     *
     * 非新年：逐字微扰（真手写没有两个字一模一样），这是手写感的关键。
     * 新年：纯文本。宋体是**印刷体**，逐字 rotate / scale 只会把整段弄脏 ——
     *   参考图里那份整齐的排印本身就是这套设计的一部分。
     * 新年还会在每处换行后补两个全角空格（中式书信的首行缩进）：比给每个自然段
     *   单独包一层 <p> 简单得多，也不会打乱下面夹图 / 落款那条既有渲染路径。
     */
    const paragraph = (
        key: string,
        text: string,
        seed: string,
        className: string,
        style: React.CSSProperties,
    ) => (
        festive
            ? <span key={key} className={className} style={{ ...style, whiteSpace: 'pre-wrap' }}>{text.replace(/\n/g, '\n\u3000\u3000')}</span>
            : <HandwritingText key={key} text={text} seed={seed} className={className} style={style} />
    );

    // 纪念日特例：双年份章（起始年 → 今年）+ 相伴天数。起始年由生成时写入的 meta.daysTogether 反推。
    const daysTogether = letter.meta?.daysTogether || 0;
    const startYear = daysTogether > 0
        ? new Date(letter.createdAt - daysTogether * 86400000).getFullYear()
        : null;
    const yearsLabel = isAnniversary && startYear ? `${startYear} → ${letter.year}` : `${letter.year}`;
    const yearsSub = isAnniversary && daysTogether > 0 ? `相伴 ${daysTogether} 天` : null;

    // 落款识别（朴素）：最后一行较短、且不带句末标点 → 当作署名，单独用手写体放大渲染。
    const bodyLines = (letter.body || '').split('\n');
    const lastIdx = bodyLines.length - 1;
    const lastLine = (bodyLines[lastIdx] || '').trim();
    const isSignatureLine = bodyLines.length > 1 && lastLine.length > 0 && lastLine.length <= 20
        && !/[。！？!?；;]/.test(lastLine);

    // v2 夹图：正文里的 `[[图:描述]]` 标记按顺序对应 letter.letterImages —— 按标记把正文切段，
    // 渲染时把图片插回原位。（没有标记时走原来的纯文字 / 落款路径。）
    const markerRe = /\[\[\s*图\s*[:：]\s*([^\]]+?)\s*\]\]/g;
    const hasImageMarker = markerRe.test(letter.body || '');
    const segments: Array<{ kind: 'text'; text: string } | { kind: 'image'; prompt: string; url?: string }> = [];
    if (hasImageMarker) {
        const raw = letter.body || '';
        markerRe.lastIndex = 0;
        let cursor = 0;
        let imgIdx = 0;
        let mm: RegExpExecArray | null;
        while ((mm = markerRe.exec(raw)) !== null) {
            if (mm.index > cursor) segments.push({ kind: 'text', text: raw.slice(cursor, mm.index) });
            segments.push({ kind: 'image', prompt: (mm[1] || '').trim(), url: letter.letterImages?.[imgIdx]?.url });
            imgIdx++;
            cursor = mm.index + mm[0].length;
        }
        if (cursor < raw.length) segments.push({ kind: 'text', text: raw.slice(cursor) });
    }

    // —— 可复用的三块 ——

    // 年份章：节日名就收在这里 —— 顶部大字改用信自己的标题后，节日不再另占一行。
    // 新年用直角细框 + 宋体（与金线框同一套语汇）；其他节日仍是圆角胶囊 + 手写体。
    const yearsNode = (
        <div className="flex flex-col items-end gap-1">
            <span
                className="inline-block px-2.5 py-1 text-[11px]"
                style={{
                    ...smallTextStyle,
                    color: festive ? '#E8C87A' : theme.stamp,
                    border: `1px solid ${festive ? gold : theme.stamp}`,
                    borderRadius: festive ? 3 : 9999,
                }}
            >
                {yearsLabel} · {letter.occasion.name}
            </span>
            {yearsSub && (
                <span className="text-[10px]" style={{ ...smallTextStyle, color: festive ? '#E8C87A' : theme.stamp, opacity: 0.8 }}>{yearsSub}</span>
            )}
        </div>
    );

    // 顶部大字：新年用「信自己的标题」——金色宋体、字距放宽，它是整张信笺的题眼。
    const titleNode = letter.title ? (
        <h3
            className="text-center"
            style={{
                ...(festive ? SERIF_TEXT : HW_TEXT),
                color: festive ? '#E8C87A' : theme.ink,
                fontWeight: festive ? 600 : 400,
                fontSize: festive ? 21 : 19,
                lineHeight: 1.6,
                letterSpacing: festive ? '0.12em' : '0.08em',
            }}
        >
            {letter.title}
        </h3>
    ) : null;

    const bodyNode = hasImageMarker ? (
        <div>
            {segments.map((seg, i) => {
                if (seg.kind === 'text') {
                    const t = seg.text.trim();
                    if (!t) return null;
                    return paragraph(`seg-${i}`, t, `${letter.id}-seg${i}`, 'block mb-3', bodyTextStyle);
                }
                return seg.url ? (
                    <figure key={i} className="my-4">
                        <img
                            src={seg.url}
                            alt={seg.prompt}
                            className="w-full rounded-2xl shadow-md"
                            style={{ border: `1px solid ${accent}33` }}
                        />
                        <figcaption className="mt-1.5 text-center text-[11px]" style={{ ...smallTextStyle, color: bodyInk, opacity: 0.55 }}>
                            {seg.prompt}
                        </figcaption>
                    </figure>
                ) : (
                    <div
                        key={i}
                        className="my-4 rounded-2xl border border-dashed px-4 py-6 text-center text-[12px]"
                        style={{ ...smallTextStyle, borderColor: `${accent}44`, color: bodyInk, opacity: 0.55 }}
                    >
                        这张图画到一半…
                    </div>
                );
            })}
        </div>
    ) : isSignatureLine ? (
        <>
            {paragraph('body', bodyLines.slice(0, lastIdx).join('\n'), letter.id, 'block', bodyTextStyle)}
            {/* 落款署名：同一种字体、明显放大、右对齐 —— 像真的签在纸右下角 */}
            <div className="mt-5 flex justify-end">
                {paragraph('sign', lastLine, `${letter.id}-sign`, 'block', signTextStyle)}
            </div>
        </>
    ) : (
        paragraph('body', letter.body, letter.id, 'block', bodyTextStyle)
    );

    // ── 新年形态：深红金线信笺 ──
    // 整片深红底 + 金线框 + 四角回纹，米白正文**直接写在红底上**（不再有米色内页那一层）。
    // 抬头（烟花 + 标题）与金线框钉在纸上不动，只有正文跟着手指滚。
    if (festive) {
        return (
            <div
                className={`letter-st-paper relative flex flex-col overflow-hidden rounded-[20px] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.7)] ${className || ''}`}
                style={{ color: bodyInk }}
            >
                {/* 金线框 + 四角回纹角花：整张纸的「函套」骨架，钉住不动 */}
                <span aria-hidden className="letter-st-frame" />
                <CornerOrnament corner="tl" color={gold} size={22} className="letter-st-corner letter-st-corner--tl" />
                <CornerOrnament corner="tr" color={gold} size={22} className="letter-st-corner letter-st-corner--tr" />
                <CornerOrnament corner="br" color={gold} size={22} className="letter-st-corner letter-st-corner--br" />
                <CornerOrnament corner="bl" color={gold} size={22} className="letter-st-corner letter-st-corner--bl" />

                {/* 顶部装饰带：线描烟花 + 金色大字标题 + 右上角年份章（节日名收在章里） */}
                <div className="relative shrink-0 px-9 pb-5 pt-8">
                    <div className="absolute right-8 top-7 z-10">{yearsNode}</div>

                    {/* 烟花：只做气氛。大小与位置刻意不对称，对称会立刻变成「装饰模板」 */}
                    <FireworkBurst size={52} color={gold} rays={20} style={{ position: 'absolute', left: '4%', top: '10px', opacity: 0.9 }} />
                    <FireworkBurst size={24} color={gold} rays={13} showTips={false} style={{ position: 'absolute', left: '23%', top: '54px', opacity: 0.6 }} />
                    <FireworkBurst size={42} color={gold} rays={18} style={{ position: 'absolute', right: '6%', top: '4px', opacity: 0.85 }} />
                    <FireworkBurst size={20} color={gold} rays={12} showTips={false} style={{ position: 'absolute', right: '27%', top: '58px', opacity: 0.5 }} />

                    {/* 标题：金色宋体大字，两侧金线朝中缝收束（把视线推到标题上） */}
                    <div className="relative mt-[74px] flex items-center gap-3">
                        <span aria-hidden className="h-px flex-1" style={{ background: `linear-gradient(90deg, transparent, ${gold}b0)` }} />
                        {titleNode}
                        <span aria-hidden className="h-px flex-1" style={{ background: `linear-gradient(270deg, transparent, ${gold}b0)` }} />
                    </div>
                </div>

                {/* 正文：整张信笺里唯一可滚的部分。
                    这里必须用 flex-auto（flex: 1 1 auto）而不是 flex-1（1 1 0%），也不能用 h-full：
                    这一层要同时满足两件事 —— 长信时被压在上限内滚动，短信时保持「内容多高就多高」。
                    flex-1 的 0 基准会把短信高度算成 0（字直接不见），h-full 又依赖父级有确定高度。
                    flex-auto 的 auto 基准正好两头都成立。 */}
                <div className="relative flex min-h-0 flex-col">
                    <div
                        ref={bodyScrollRef}
                        className={`letter-st-body relative min-h-0 px-9 pb-10 ${scrollBody ? 'flex-auto overflow-y-auto' : ''}`}
                    >
                        {bodyNode}
                    </div>
                    {scrollBody && <LetterScrollBar targetRef={bodyScrollRef} color={gold} />}
                </div>
            </div>
        );
    }

    // ── 其他主题：改动前的单层信纸，一行不变 ──
    return (
        <div
            className={`relative flex flex-col rounded-[22px] shadow-[0_18px_50px_-12px_rgba(0,0,0,0.55)] overflow-hidden ${className || ''}`}
            style={{
                background: theme.paper,
                color: theme.ink,
                // 红纸金墨（唯一深底浅字）：给字加极淡柔光兜底可读性。
                textShadow: theme.dark ? '0 1px 2px rgba(0,0,0,0.45)' : undefined,
            }}
        >
            {/* 极淡纸纹：两点柔和光斑，避免大面积纯色显得廉价（不用渐变）。 */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.5]"
                style={{
                    backgroundImage: `radial-gradient(circle at 18% 12%, rgba(255,255,255,0.35), transparent 42%), radial-gradient(circle at 82% 88%, rgba(0,0,0,0.05), transparent 45%)`,
                }}
            />

            {/* 纪念日做旧：极轻的斑驳与边缘暗沉（目标是「陈年」，不是「破损」）。 */}
            {isAnniversary && (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                        backgroundImage: 'radial-gradient(ellipse at 12% 16%, rgba(122,92,52,0.10), transparent 34%), radial-gradient(ellipse at 88% 78%, rgba(122,92,52,0.09), transparent 32%), radial-gradient(ellipse at 32% 94%, rgba(122,92,52,0.07), transparent 26%), linear-gradient(180deg, rgba(122,92,52,0.05), transparent 18%, transparent 82%, rgba(122,92,52,0.05))',
                        mixBlendMode: 'multiply',
                    }}
                />
            )}

            {/* 右上角年份章（纪念日特例：双年份 —— 起始年 → 今年；章本身就是一条时间线）。
                字体与正文统一（手写体 400），否则这里会混进 UI 字体、整张纸看着乱。 */}
            <div className="absolute right-4 top-4 z-10">{yearsNode}</div>

            {scrollBody ? (
                <>
                    {/* 抬头：钉在纸上，不跟着正文滚 */}
                    {letter.title && <div className="relative shrink-0 px-6 pb-6 pt-16">{titleNode}</div>}
                    {/* 正文：整张纸里唯一可滚的部分 */}
                    <div className={`relative min-h-0 overflow-y-auto no-scrollbar px-6 pb-9 ${letter.title ? '' : 'pt-16'}`}>
                        {bodyNode}
                    </div>
                </>
            ) : (
                <div className="relative px-6 pt-16 pb-9">
                    {letter.title && <div className="mb-6">{titleNode}</div>}
                    {bodyNode}
                </div>
            )}
        </div>
    );
};

export default LetterPaper;
