/**
 * 相册批量删除的接线守卫。
 *
 * 仓库的 vitest 跑在纯 Node 环境（没装 testing-library），组件渲染测不了，
 * 所以沿用 utils/apiPresetSwitch.wiring.test.ts 的做法：读源码做结构断言。
 * 这些点全都是「坏了也不报错、界面上还看不出来」的那类：
 *
 *   1. 批量删除退回成循环调单张 —— 几百张就是几百个事务，删的时候界面卡住不动；
 *   2. 底部操作栏漏掉 safe-bottom —— 手机上删除按钮压在 home 手势条上，点不准；
 *   3. 长按定时器没有卸载清理 —— 离开相册后回调仍触发，在卸载组件上 setState；
 *   4. 选择态没有随视图退出重置 —— 再进相册时带着一批已不存在的 id。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const gallery = readFileSync(join(ROOT, 'apps', 'Gallery.tsx'), 'utf8');
const selectionBar = readFileSync(
    join(ROOT, 'components', 'gallery', 'GallerySelectionBar.tsx'),
    'utf8',
);
const thumb = readFileSync(
    join(ROOT, 'components', 'gallery', 'GalleryThumb.tsx'),
    'utf8',
);

/** 去掉注释行，避免注释里提到的字样把断言骗过去。 */
const stripComments = (source: string): string => source
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join('\n');

const galleryCode = stripComments(gallery);

describe('多选状态接线', () => {
    it('Gallery.tsx 持有 selectMode / selectedIds / groupMode 三组状态', () => {
        expect(galleryCode).toMatch(/const \[selectMode, setSelectMode\] = useState\(false\)/);
        expect(galleryCode).toMatch(/const \[selectedIds, setSelectedIds\] = useState<Set<string>>\(new Set\(\)\)/);
        expect(galleryCode).toMatch(/const \[groupMode, setGroupMode\] = useState<GalleryGroupMode>\('day'\)/);
    });

    it('退出 grid 视图时重置选择态（否则下次进来会带着已失效的 id）', () => {
        expect(galleryCode).toMatch(/setSelectMode\(false\);\s*setSelectedIds\(new Set\(\)\)/);
    });

    it('分组用 useMemo 缓存，依赖只有 images 与 groupMode', () => {
        // 依赖里若混进 selectedIds，勾一张就会重新分组整网格
        expect(galleryCode).toMatch(
            /useMemo\(\(\) => groupImagesByDate\(images, groupMode\), \[images, groupMode\]\)/,
        );
    });
});

describe('批量删除必须走批量通道', () => {
    it('批量删除调用 DB.deleteGalleryImages', () => {
        expect(galleryCode).toMatch(/DB\.deleteGalleryImages\(/);
    });

    it('不存在「循环里逐张调用删除」的写法', () => {
        // 这两处是历史上最容易写回循环的：批量删除本身、清空整个相册
        expect(galleryCode).not.toMatch(/for \(const \w+ of [\w.]+\) \{\s*await DB\.deleteGalleryImage\(/);
        expect(galleryCode).not.toMatch(/for \(const img of imgs\) \{\s*await DB\.deleteGalleryImage/);
    });

    it('相册清空走批量，并把张数带进埋点', () => {
        expect(galleryCode).toMatch(/DB\.deleteGalleryImages\(imgs\.map\(img => img\.id\)\)/);
        expect(galleryCode).toMatch(/trackEvent\('清空一个角色的相册', \{ 张数: imgs\.length \}\)/);
    });

    it('确认弹窗写明张数与不可撤销', () => {
        expect(galleryCode).toMatch(/张照片吗？此操作无法撤销。/);
    });

    it('删除后同步 images 与 albumCounts（退回相册页时计数才不错）', () => {
        expect(galleryCode).toMatch(/setAlbumCounts\(prev => \(\{ \.\.\.prev, \[activeCharId\]: remaining\.length \}\)\)/);
    });

    it('部分失败时如实提示，而不是一律报成功', () => {
        expect(galleryCode).toMatch(/failed > 0/);
        expect(galleryCode).toMatch(/张失败，可重试/);
    });
});

describe('长按与定时器', () => {
    it('缩略图与组头长按共用 600ms 阈值', () => {
        expect(galleryCode).toMatch(/thumbPressTimer\.current = setTimeout\(\(\) => \{[\s\S]{0,120}\}, 600\)/);
    });

    it('组件卸载时清理长按定时器', () => {
        // 两个 ref 都要清，少清一个就留了一条在已卸载组件上 setState 的路径
        expect(galleryCode).toMatch(/useEffect\(\(\) => \(\) => \{/);
        expect(galleryCode).toMatch(/clearTimeout\(thumbPressTimer\.current\)/);
        expect(galleryCode).toMatch(/clearTimeout\(longPressTimer\.current\)/);
    });
});

describe('底部操作栏', () => {
    it('贴底并让开 var(--safe-bottom)', () => {
        expect(selectionBar).toMatch(/fixed left-0 right-0 bottom-0/);
        expect(selectionBar).toMatch(/calc\(0\.75rem \+ var\(--safe-bottom, 0px\)\)/);
    });

    it('删除按钮禁用态清晰，且文案随忙碌切换', () => {
        expect(selectionBar).toMatch(/disabled:opacity-40/);
        expect(selectionBar).toMatch(/busy \? '删除中' : '删除'/);
    });

    it('触控目标不低于 44px（h-11）', () => {
        expect(selectionBar).toMatch(/h-11/);
    });
});

describe('缩略图 memo 化', () => {
    it('GalleryThumb 用 React.memo 包住（否则勾一张会重渲整组）', () => {
        expect(thumb).toMatch(/export default React\.memo\(GalleryThumb\)/);
    });

    it('父组件传给缩略图的回调是稳定的 useCallback', () => {
        const stable = ['handleImageClick', 'toggleSelect', 'handleThumbPressStart', 'handleThumbPressEnd'];
        for (const name of stable) {
            expect(galleryCode, `${name} 应为 useCallback`).toMatch(
                new RegExp(`const ${name} = useCallback\\(`),
            );
        }
    });
});
