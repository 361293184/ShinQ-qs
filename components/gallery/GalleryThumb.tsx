/**
 * 相册缩略图（单格）。
 *
 * 单独拆出来并用 React.memo 包住，是为了让「勾选一张」只重渲那一格：
 * 选择态存在父组件的 Set 里，若把整格 JSX 内联在 renderGrid 中，每次勾选都会让
 * 当前分组的全部缩略图跟着重渲 —— 相册上千张时肉眼可见地卡。
 *
 * memo 能命中的前提是 props 稳定，所以：
 *  - image / isSelected / selectMode 都是值类型或稳定引用；
 *  - 三个回调由父组件用 useCallback 固定（依赖为空或只含稳定函数）。
 * 若日后给父组件传了内联箭头函数，浅比较会全部失效，等于白拆 —— 改这里时要留意。
 */
import React from 'react';
import { Check } from '@phosphor-icons/react';
import TokenImg from '../os/TokenImg';
import type { GalleryImage } from '../../types';

interface GalleryThumbProps {
    image: GalleryImage;
    /** 是否处于多选态。 */
    selectMode: boolean;
    /** 是否被勾选。 */
    isSelected: boolean;
    onOpen: (image: GalleryImage) => void;
    onToggle: (id: string) => void;
    onPressStart: (id: string) => void;
    onPressEnd: () => void;
}

const GalleryThumb: React.FC<GalleryThumbProps> = ({
    image,
    selectMode,
    isSelected,
    onOpen,
    onToggle,
    onPressStart,
    onPressEnd,
}) => (
    <div
        onClick={() => (selectMode ? onToggle(image.id) : onOpen(image))}
        onTouchStart={() => onPressStart(image.id)}
        onTouchEnd={onPressEnd}
        onTouchCancel={onPressEnd}
        onMouseDown={() => onPressStart(image.id)}
        onMouseUp={onPressEnd}
        onMouseLeave={onPressEnd}
        className={`aspect-square bg-slate-100 relative cursor-pointer overflow-hidden rounded-sm transition-all duration-200 ${
            selectMode && isSelected ? 'scale-[0.96] ring-2 ring-primary' : ''
        }`}
    >
        {/* 相册图存的是 blobref 令牌（见 utils/blobRef.ts），TokenImg 会解析成 objectURL；
            旧的 base64 / http 图原样透传，两种都显示得出来 */}
        <TokenImg
            value={image.url}
            className={`w-full h-full object-cover transition-all duration-200 ${
                selectMode && !isSelected ? 'opacity-60' : 'hover:scale-105'
            }`}
            loading="lazy"
        />
        {/* 已点评标记：多选态让位给勾选圈，避免右上角两个圆点打架 */}
        {image.review && !selectMode && (
            <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full ring-2 ring-white shadow-sm" />
        )}
        {selectMode && (
            <div className={`absolute left-1 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-colors ${
                isSelected ? 'border-primary bg-primary' : 'border-white/85 bg-black/25'
            }`}>
                {isSelected && <Check size={11} weight="bold" className="text-white" />}
            </div>
        )}
    </div>
);

export default React.memo(GalleryThumb);
