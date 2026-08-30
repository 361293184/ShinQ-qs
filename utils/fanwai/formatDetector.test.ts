import { describe, it, expect } from 'vitest';
import { detectHtmlFormat, hasFormatKeyword, HTML_TYPE_LABELS, detectExplicitQuantity, extractFloorCount, extractHtmlSize } from './formatDetector';

describe('detectHtmlFormat 关键词识别', () => {
    it('无指令/空串返回 undefined（默认纯文字番外）', () => {
        expect(detectHtmlFormat()).toBeUndefined();
        expect(detectHtmlFormat('')).toBeUndefined();
        expect(detectHtmlFormat('   ')).toBeUndefined();
        expect(detectHtmlFormat('一场普通的番外，没有任何格式要求')).toBeUndefined();
    });

    it('识别小手机 phone', () => {
        expect(detectHtmlFormat('写一篇小手机格式的番外')).toBe('phone');
        expect(detectHtmlFormat('用聊天记录的方式写')).toBe('phone');
        expect(detectHtmlFormat('模拟微信聊天气泡')).toBe('phone');
        expect(detectHtmlFormat('以短信对话形式')).toBe('phone');
    });

    it('识别论坛 forum', () => {
        expect(detectHtmlFormat('以论坛帖子的形式写')).toBe('forum');
        expect(detectHtmlFormat('发一个贴吧帖子')).toBe('forum');
        expect(detectHtmlFormat('像楼层回复一样')).toBe('forum');
    });

    it('识别状态栏 statusbar', () => {
        expect(detectHtmlFormat('用状态栏的形式')).toBe('statusbar');
        expect(detectHtmlFormat('状态条展示')).toBe('statusbar');
    });

    it('多格式冲突按模板优先级 phone > forum > statusbar 取其一', () => {
        expect(detectHtmlFormat('小手机 + 论坛')).toBe('phone');
        // "论坛 然后小手机"里"小手机"含"手机"关键词，phone 优先级最高 → phone
        expect(detectHtmlFormat('论坛 然后小手机')).toBe('phone');
        expect(detectHtmlFormat('论坛帖子 状态栏')).toBe('forum');
    });

    it('普通文本不含格式关键词不误伤', () => {
        // "手机"作为独立词会命中，但"手机壳"这类合成词也会命中（宽松匹配）——这里验证不含关键词的情况
        expect(detectHtmlFormat('写一篇古代宫廷番外，不需要特殊格式')).toBeUndefined();
    });
});

describe('hasFormatKeyword', () => {
    it('有关键词返回 true，无返回 false', () => {
        expect(hasFormatKeyword('小手机')).toBe(true);
        expect(hasFormatKeyword('日常甜宠')).toBe(false);
    });
});

describe('HTML_TYPE_LABELS', () => {
    it('三套模板都有中文名', () => {
        expect(HTML_TYPE_LABELS.phone).toBe('小手机');
        expect(HTML_TYPE_LABELS.forum).toBe('论坛');
        expect(HTML_TYPE_LABELS.statusbar).toBe('状态栏');
        expect(HTML_TYPE_LABELS.custom).toBe('自定义');
    });
});

describe('detectExplicitQuantity 数量要求检测', () => {
    it('无指令/空串返回 false', () => {
        expect(detectExplicitQuantity()).toBe(false);
        expect(detectExplicitQuantity('')).toBe(false);
        expect(detectExplicitQuantity('一个普通的番外，自由发挥')).toBe(false);
    });

    it('识别楼层/条数等数量要求', () => {
        expect(detectExplicitQuantity('论坛不少于80层楼')).toBe(true);
        expect(detectExplicitQuantity('写30条对话')).toBe(true);
        expect(detectExplicitQuantity('至少10个回复')).toBe(true);
    });

    it('识别明确字数要求', () => {
        expect(detectExplicitQuantity('写5000字的番外')).toBe(true);
        expect(detectExplicitQuantity('正文不低于8000字')).toBe(true);
        expect(detectExplicitQuantity('约3000字')).toBe(true);
    });

    it('无明确数量时返回 false', () => {
        expect(detectExplicitQuantity('写一篇甜宠番外，风格俏皮')).toBe(false);
        expect(detectExplicitQuantity('现在暂停当前剧情，来段小剧场')).toBe(false);
    });
});

describe('extractFloorCount 楼层数提取', () => {
    it('识别多种楼层表述', () => {
        expect(extractFloorCount('论坛不少于80层楼')).toBe(80);
        expect(extractFloorCount('生成80楼的帖子')).toBe(80);
        expect(extractFloorCount('至少100层')).toBe(100);
    });

    it('无楼层数时返回 undefined', () => {
        expect(extractFloorCount('写一篇小手机番外')).toBeUndefined();
        expect(extractFloorCount('')).toBeUndefined();
        expect(extractFloorCount(undefined)).toBeUndefined();
    });

    it('异常超大数字封顶', () => {
        expect(extractFloorCount('999999层楼')).toBe(500);
    });
});

describe('detectHtmlFormat custom HTML 意图识别', () => {
    it('无内置格式但含 HTML 意图 → custom', () => {
        expect(detectHtmlFormat('创建一个 html 问卷')).toBe('custom');
        expect(detectHtmlFormat('生成一个问卷，纯HTML+CSS+JS')).toBe('custom');
        expect(detectHtmlFormat('做一个网页界面')).toBe('custom');
        expect(detectHtmlFormat('HTML卡片')).toBe('custom');
        expect(detectHtmlFormat('问卷主题情侣调查')).toBe('custom');
    });

    it('内置格式优先于 custom', () => {
        expect(detectHtmlFormat('论坛帖子 HTML')).toBe('forum');
        expect(detectHtmlFormat('小手机界面')).toBe('phone');
    });

    it('无 HTML 意图不误伤 → 纯文字', () => {
        expect(detectHtmlFormat('写一篇日常甜宠番外')).toBeUndefined();
        expect(detectHtmlFormat('现在暂停剧情，来段小剧场')).toBeUndefined();
    });

    it('否定表述不触发格式', () => {
        expect(detectHtmlFormat('不需要状态栏')).toBeUndefined();
        expect(detectHtmlFormat('不要论坛')).toBeUndefined();
        expect(detectHtmlFormat('无需小手机')).toBeUndefined();
        expect(detectHtmlFormat('不需要美化不需要状态栏不计入主线剧情')).toBeUndefined();
        expect(detectHtmlFormat('不生成问卷')).toBeUndefined();
        // 否定词不紧邻关键词，但在前 10 字窗口内（用户常见写法）
        expect(detectHtmlFormat('不需要生成状态栏')).toBeUndefined();
        expect(detectHtmlFormat('不需要给我生成状态栏')).toBeUndefined();
        expect(detectHtmlFormat('请勿生成论坛帖子')).toBeUndefined();
        // 否定在关键词后面（前后 10 字窗口）
        expect(detectHtmlFormat('状态栏不需要生成')).toBeUndefined();
    });

    it('无否定表述仍正常触发', () => {
        expect(detectHtmlFormat('状态栏格式')).toBe('statusbar');
        expect(detectHtmlFormat('写一个论坛体番外')).toBe('forum');
        expect(detectHtmlFormat('做一个 html 问卷')).toBe('custom');
    });
});

describe('extractHtmlSize 尺寸提取', () => {
    it('提取 height / max-width', () => {
        expect(extractHtmlSize('height 540px，max-width 450px')).toEqual({ height: 540, maxWidth: 450 });
        expect(extractHtmlSize('尺寸width100%，max-width 450px，height 540px')).toEqual({ height: 540, maxWidth: 450 });
        expect(extractHtmlSize('高度 400')).toEqual({ height: 400 });
    });

    it('无尺寸返回空对象', () => {
        expect(extractHtmlSize('写一篇论坛番外')).toEqual({});
        expect(extractHtmlSize('')).toEqual({});
    });
});
