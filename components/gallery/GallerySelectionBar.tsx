/**
 * 相册多选态的底部批量操作栏。
 *
 * 纯展示组件：不持有业务状态，张数与回调全部由 apps/Gallery.tsx 传入 ——
 * 选择态的唯一真相源留在主组件里，避免两处状态不同步。
 *
 * 布局要点：
 *  - fixed 贴底 + var(--safe-bottom) 让位手机手势区（与 apps/pixelHome/AssetLibrary 同款处理）；
 *  - 破坏性操作（删除）用红色实心并固定在最右，与「全选」拉开距离，降低误触代价；
 *  - 无选中时删除置禁用而**不是隐藏** —— 按钮位置稳定，不会在勾选时突然跳位；
 *  - 触控目标统一 44px 高（h-11），满足移动端最小点击区。
 */
import React from 'react';
import { CheckCircle, Circle, Trash } from '@phosphor-icons/react';

interface GallerySelectionBarProps {
    /** 已选张数。 */
    selectedCount: number;
    /** 当前视图内可选的总张数，用于「全选 / 取消全选」的状态与文案。 */
    totalCount: number;
    /** 批量删除进行中：所有按钮禁用，避免重复提交。 */
    busy?: boolean;
    onToggleSelectAll: () => void;
    onDelete: () => void;
}

const GallerySelectionBar: React.FC<GallerySelectionBarProps> = ({
    selectedCount,
    totalCount,
    busy = false,
    onToggleSelectAll,
    onDelete,
}) => {
    const allSelected = totalCount > 0 && selectedCount >= totalCount;
    const canDelete = selectedCount > 0 && !busy;

    return (
        <div
            className="fixed left-0 right-0 bottom-0 z-40 animate-slide-up border-t border-slate-200/80 bg-white/85 backdrop-blur-xl shadow-[0_-4px_20px_rgba(15,23,42,0.06)]"
            style={{ paddingBottom: 'calc(0.75rem + var(--safe-bottom, 0px))' }}
        >
            <div className="flex items-center gap-2 px-4 pt-3">
                <span className="flex-1 text-[13px] font-medium text-slate-600">
                    已选 <span className="font-mono font-bold text-primary">{selectedCount}</span> 张
                </span>

                <button
                    type="button"
                    onClick={onToggleSelectAll}
                    disabled={busy || totalCount === 0}
                    className="flex h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium text-slate-600 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {allSelected
                        ? <CheckCircle size={17} weight="fill" className="text-primary" />
                        : <Circle size={17} />}
                    {allSelected ? '取消全选' : '全选'}
                </button>

                <button
                    type="button"
                    onClick={onDelete}
                    disabled={!canDelete}
                    className="flex h-11 items-center gap-1.5 rounded-full bg-red-500 px-5 text-[13px] font-bold text-white shadow-sm transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Trash size={17} weight="bold" />
                    {busy ? '删除中' : '删除'}
                </button>
            </div>
        </div>
    );
};

export default GallerySelectionBar;
