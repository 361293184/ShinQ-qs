import React, { useRef, useState, useEffect } from 'react';
import { ShareNetwork, Trash, Plus, Smiley, PaperPlaneTilt, Money, BookOpenText, GearSix, Image, Lock, ArrowsClockwise, ChatCircleDots, CalendarBlank, ForkKnife, Coffee, Code, Brain, PencilSimple, BellSimpleRinging, Alarm, Sparkle, FadersHorizontal, LinkSimple, Feather } from '@phosphor-icons/react';
import { CharacterProfile, ChatTheme, EmojiCategory, Emoji } from '../../types';
import { PRESET_THEMES } from './ChatConstants';
import { AcnhActionTile } from '../os/acnhIcons';
import { isIOSStandaloneWebApp } from '../../utils/iosStandalone';
import { trackEvent } from '../../utils/analytics';

const EMOJI_PAGE_SIZE = 40;

interface ChatInputAreaProps {
    input: string;
    setInput: (v: string) => void;
    isTyping: boolean;
    selectionMode: boolean;
    showPanel: 'none' | 'actions' | 'emojis' | 'chars';
    setShowPanel: (v: 'none' | 'actions' | 'emojis' | 'chars') => void;
    onSend: () => void;
    onDeleteSelected: () => void;
    onForwardSelected?: () => void;
    selectedCount: number;
    emojis: Emoji[];
    /** 以下会话切换/主题 props 仅私聊使用；群聊等复用方不传（'chars' 面板不会被打开） */
    characters?: CharacterProfile[];
    activeCharacterId?: string;
    onCharSelect?: (id: string) => void;
    /** 每个角色的未读消息数，用于在「切换会话」头像上显示红点 */
    unreadMessages?: Record<string, number>;
    customThemes?: ChatTheme[];
    onUpdateTheme?: (id: string) => void;
    onRemoveTheme?: (id: string) => void;
    activeThemeId?: string;
    /** 提供时整体替换内置 actions 双页网格——群聊传自己的功能格。不传 = 原行为 */
    actionsContent?: React.ReactNode;
    onPanelAction: (type: string, payload?: any) => void;
    onImageSelect: (file: File) => void;
    isSummarizing: boolean;
    // Categories Support
    categories?: EmojiCategory[];
    activeCategory?: string;
    // Reroll Support
    onReroll: () => void;
    canReroll: boolean;
    // Proactive messaging
    isProactiveActive?: boolean;
    // 麦当劳 MCP
    mcdConfigured?: boolean;   // 设置里 token 已填且启用
    mcdActivated?: boolean;    // 当前会话已发"麦请求"
    // 瑞幸 MCP
    luckinConfigured?: boolean;
    luckinActivated?: boolean;
    // HTML 模块模式
    htmlModeEnabled?: boolean;
    // 思考过程展示（会话级）
    showThinkingChain?: boolean;
    // Input style
    inputStyle?: 'default' | 'rounded' | 'flat' | 'wechat' | 'ios' | 'telegram' | 'discord' | 'pixel';
    sendButtonStyle?: 'circle' | 'pill' | 'minimal';
    chromeStyle?: 'soft' | 'flat' | 'floating' | 'pixel';
    /** 动森彩蛋模式：输入栏换成木质草绿圆角。 */
    acnh?: boolean;
}

const ChatInputArea: React.FC<ChatInputAreaProps> = ({
    input, setInput, isTyping, selectionMode,
    showPanel, setShowPanel, onSend, onDeleteSelected, onForwardSelected, selectedCount,
    emojis, characters = [], activeCharacterId = '', onCharSelect = () => {},
    unreadMessages = {},
    customThemes = [], onUpdateTheme = () => {}, onRemoveTheme = () => {}, activeThemeId = '',
    actionsContent,
    onPanelAction, onImageSelect, isSummarizing,
    categories = [], activeCategory = 'default',
    onReroll, canReroll,
    isProactiveActive,
    mcdConfigured = false,
    mcdActivated = false,
    luckinConfigured = false,
    luckinActivated = false,
    htmlModeEnabled = false,
    showThinkingChain = false,
    inputStyle = 'default',
    sendButtonStyle = 'circle',
    chromeStyle = 'soft',
    acnh = false,
}) => {
    const chatImageInputRef = useRef<HTMLInputElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [actionsPage, setActionsPage] = useState<0 | 1 | 2>(0);
    // 气泡样式面板：搜索 + 两步确认删除（防止 hover 小 × 误删）
    const [bubbleSearch, setBubbleSearch] = useState('');
    // 会话面板的主要用途仍是切换聊天；气泡选择作为次级工具默认收起。
    const [isBubbleSectionOpen, setIsBubbleSectionOpen] = useState(false);
    const [pendingDeleteThemeId, setPendingDeleteThemeId] = useState<string | null>(null);
    const [emojiSelectionMode, setEmojiSelectionMode] = useState(false);
    const [selectedEmojis, setSelectedEmojis] = useState<any[]>([]);
    // 手动分页避免旧版/第三方 WebView 不触发 IntersectionObserver，永远卡在「加载中」。
    const [emojiPage, setEmojiPage] = useState(0);
    const emojiPageCount = Math.max(1, Math.ceil(emojis.length / EMOJI_PAGE_SIZE));
    const emojiPageStart = emojiPage * EMOJI_PAGE_SIZE;
    const visibleEmojis = emojis.slice(emojiPageStart, emojiPageStart + EMOJI_PAGE_SIZE);
    useEffect(() => {
        setEmojiPage(0);
    }, [activeCategory]);
    useEffect(() => {
        setEmojiPage(current => Math.min(current, emojiPageCount - 1));
    }, [emojiPageCount]);
    const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const startPos = useRef({ x: 0, y: 0 });
    const isLongPressTriggered = useRef(false); // Track if long press action fired
    const useIOSStandaloneInputFix = isIOSStandaloneWebApp();

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
        }
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'chat' | 'bg') => {
        const file = e.target.files?.[0];
        if (file) {
            onImageSelect(file);
        }
        if (e.target) e.target.value = ''; // Reset
    };

    // --- Unified Touch/Long-Press Logic ---
    
    const clearTimer = () => {
        if (longPressTimer.current) {
            clearTimeout(longPressTimer.current);
            longPressTimer.current = null;
        }
    };

    const handleTouchStart = (item: any, type: 'emoji' | 'category', e: React.TouchEvent | React.MouseEvent) => {
        // 1. Always reset state first to ensure clean slate for any interaction
        // This fixes the bug where deleting a category leaves the flag true, blocking clicks on system categories
        clearTimer(); 
        isLongPressTriggered.current = false;

        // 2. Skip long-press for the default category (no options needed)
        if (type === 'category' && item.id === 'default') return;
        
        // 3. Store coordinates and start timer for valid long-press candidates
        if ('touches' in e) {
            startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        } else {
            startPos.current = { x: e.clientX, y: e.clientY };
        }

        longPressTimer.current = setTimeout(() => {
            isLongPressTriggered.current = true;
            // Trigger action
            if (type === 'emoji') {
                // 不在批量选择态时, 长按单个表情弹出操作菜单 (修改名称 / 删除)。
                // 批量删除仍可通过右上角铅笔按钮进入多选态。
                if (!emojiSelectionMode) {
                    onPanelAction('emoji-options', item);
                }
            } else {
                onPanelAction('category-options', item);
            }
        }, 500); // 500ms threshold
    };

    const handleTouchMove = (e: React.TouchEvent | React.MouseEvent) => {
        if (!longPressTimer.current) return;

        let clientX, clientY;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const diffX = Math.abs(clientX - startPos.current.x);
        const diffY = Math.abs(clientY - startPos.current.y);

        // Cancel long press if moved more than 10px (scrolling)
        if (diffX > 10 || diffY > 10) {
            clearTimer();
        }
    };

    const handleTouchEnd = () => {
        clearTimer();
    };



    // Wrapper for Click to prevent conflicts
    const handleItemClick = (e: React.MouseEvent, item: any, type: 'emoji' | 'category') => {
        // If long press action triggered, block the click event (do not send)
        if (isLongPressTriggered.current) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // If click happens, ensure timer is cleared (prevents "Send then Pop up" ghost issue)
        clearTimer();

        if (type === 'emoji') {
            if (emojiSelectionMode) {
                setSelectedEmojis(prev => {
                    const exists = prev.find(e => e.url === item.url);
                    if (exists) return prev.filter(e => e.url !== item.url);
                    return [...prev, item];
                });
            } else {
                onPanelAction('send-emoji', item);
            }
        } else {
            onPanelAction('select-category', item.id);
        }
    };

    const handleInputFocus = () => {
        if (!useIOSStandaloneInputFix) return;
        setShowPanel('none');
        const textarea = textareaRef.current;
        if (!textarea) return;
        window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
                if (document.activeElement !== textarea) return;
                try {
                    textarea.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                } catch {
                    // Older iOS builds can throw on unsupported scroll options.
                }
            });
        });
    };

    React.useEffect(() => {
        if (showPanel !== 'emojis') {
            setEmojiSelectionMode(false);
            setSelectedEmojis([]);
        }
    }, [showPanel]);

    React.useEffect(() => {
        if (!emojiSelectionMode) {
            setSelectedEmojis([]);
        }
    }, [emojiSelectionMode]);

    React.useEffect(() => {
        if (emojiSelectionMode) {
            setSelectedEmojis(prev => prev.filter(se => emojis.some(e => e.url === se.url)));
        }
    }, [emojis]);

    const isDiscordStyle = inputStyle === 'discord';
    const isPixelStyle = inputStyle === 'pixel' || chromeStyle === 'pixel';
    const shellClass = acnh
        ? 'bg-[#a8d6bb] border-t-[3px] border-[#86c29a] shadow-[0_-3px_0_rgba(110,160,130,0.18)]'
        : chromeStyle === 'pixel'
        ? 'bg-[#eadfce] border-t-[3px] border-[#8f674a] shadow-[0_-4px_0_rgba(123,90,64,0.15)]'
        : chromeStyle === 'flat'
          ? 'bg-white border-t border-slate-200 shadow-none'
          : chromeStyle === 'floating'
            ? 'bg-white/80 backdrop-blur-2xl border-t border-white/60 shadow-[0_-12px_30px_rgba(148,163,184,0.18)]'
            : 'bg-white/90 backdrop-blur-2xl border-t border-slate-200/50 shadow-[0_-5px_15px_rgba(0,0,0,0.02)]';
    const actionButtonClass = acnh
        ? 'w-11 h-11 shrink-0 rounded-full bg-[#4cb89e] flex items-center justify-center text-white hover:bg-[#43ad93] transition-colors shadow-sm'
        : isPixelStyle
        ? 'w-11 h-11 shrink-0 rounded-[4px] border-2 border-[#8f674a] bg-[#f8f0e0] flex items-center justify-center text-[#8f674a] hover:bg-[#fff7ed] transition-colors'
        : isDiscordStyle
          ? 'w-11 h-11 shrink-0 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 hover:bg-slate-700 transition-colors'
          : 'w-11 h-11 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors';
    const inputWrapClass =
        acnh
            ? 'bg-[#fbf4de] border-2 border-[#e6dab4] rounded-full'
            :
        inputStyle === 'rounded'
            ? 'bg-slate-100 rounded-full'
            : inputStyle === 'flat'
              ? 'bg-transparent border-b border-slate-200 rounded-none'
              : inputStyle === 'wechat'
                ? 'bg-white border border-slate-200 rounded-full'
                : inputStyle === 'ios'
                  ? 'bg-white/80 border border-white/80 shadow-inner rounded-[26px]'
                  : inputStyle === 'telegram'
                    ? 'bg-white border border-sky-100 rounded-2xl'
                    : inputStyle === 'discord'
                      ? 'bg-slate-800 border border-white/10 rounded-2xl text-white'
                      : inputStyle === 'pixel'
                        ? 'bg-[#f8f0e0] border-2 border-[#8f674a] rounded-[4px]'
                        : 'bg-slate-100 rounded-[24px]';
    const sendButtonClass = acnh
        ? 'w-11 h-11 shrink-0 rounded-full bg-[#f3d06a] text-[#6b5a3e] flex items-center justify-center shadow-md'
        :
        sendButtonStyle === 'pill'
            ? isPixelStyle
                ? 'h-11 min-w-[72px] shrink-0 rounded-[4px] border-2 border-[#8f674a] bg-[#c99872] px-4 text-[11px] font-bold text-[#fff7ed]'
                : 'h-11 min-w-[72px] shrink-0 rounded-full bg-primary px-4 text-[11px] font-bold text-white shadow-lg'
            : sendButtonStyle === 'minimal'
              ? isPixelStyle
                ? 'w-11 h-11 shrink-0 rounded-[4px] border-2 border-[#8f674a] bg-[#c99872] text-[#fff7ed] flex items-center justify-center'
                : isDiscordStyle
                  ? 'w-11 h-11 shrink-0 rounded-full bg-transparent text-sky-300 flex items-center justify-center'
                  : 'w-11 h-11 shrink-0 rounded-full bg-transparent text-primary flex items-center justify-center'
              : isPixelStyle
                ? 'w-11 h-11 shrink-0 rounded-[4px] border-2 border-[#8f674a] bg-[#c99872] text-[#fff7ed] flex items-center justify-center'
                : 'w-11 h-11 shrink-0 rounded-full bg-primary text-white flex items-center justify-center transition-all shadow-lg';
    const panelClass = acnh
        ? 'bg-[#f3ecdc] border-t-[3px] border-[#e0d6c0]'
        : isPixelStyle
        ? 'bg-[#f8f0e0] border-t-2 border-[#8f674a]'
        : isDiscordStyle
          ? 'bg-slate-900/95 border-t border-white/10'
          : 'bg-slate-50 border-t border-slate-200/60';
    const panelTopBarSurfaceClass = acnh
        ? 'bg-[#efe7d4] border-b-2 border-[#e0d6c0]'
        : isPixelStyle
        ? 'bg-[#eadfce] border-b-2 border-[#8f674a]'
        : isDiscordStyle
          ? 'bg-slate-950 border-b border-white/10'
          : 'bg-white border-b border-slate-100';
    const panelTopBarClass = 'h-10 min-w-0 flex-1 flex items-center px-2 gap-2 overflow-x-auto no-scrollbar';
    const inactiveCategoryClass = isPixelStyle
        ? 'bg-[#f3e7d6] text-[#8f674a] border border-[#8f674a]/30'
        : isDiscordStyle
          ? 'bg-slate-800 text-slate-300 border border-white/10'
          : 'bg-slate-100 text-slate-500 border border-transparent';
    const activeCategoryClass = isPixelStyle
        ? 'bg-[#c99872] text-[#fff7ed] font-bold border border-[#8f674a]'
        : isDiscordStyle
          ? 'bg-indigo-500 text-white font-bold border border-indigo-400/60 shadow-sm'
          : 'bg-primary text-white font-bold shadow-sm border border-transparent';
    const categoryAddButtonClass = isPixelStyle
        ? 'w-6 h-6 rounded-full border border-[#8f674a] bg-[#f8f0e0] text-[#8f674a] flex items-center justify-center shrink-0 hover:bg-[#fff7ed]'
        : isDiscordStyle
          ? 'w-6 h-6 rounded-full border border-white/10 bg-slate-800 text-slate-300 flex items-center justify-center shrink-0 hover:bg-slate-700'
          : 'w-6 h-6 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center shrink-0 hover:bg-slate-200';
    const emojiImportTileClass = acnh
        ? 'aspect-square bg-white rounded-2xl border-2 border-dashed border-[#cfc3a6] flex items-center justify-center text-2xl text-[#9f8e68]'
        : isPixelStyle
        ? 'aspect-square bg-[#fff7ed] rounded-2xl border-2 border-dashed border-[#8f674a]/40 flex items-center justify-center text-2xl text-[#8f674a]'
        : isDiscordStyle
          ? 'aspect-square bg-slate-800 rounded-2xl border-2 border-dashed border-slate-700 flex items-center justify-center text-2xl text-slate-400'
          : 'aspect-square bg-slate-100 rounded-2xl border-2 border-dashed border-slate-300 flex items-center justify-center text-2xl text-slate-400';
    const emojiTileClass = acnh
        ? 'bg-white rounded-2xl p-2 border-2 border-[#ece0c8] shadow-sm relative active:scale-95 transition-transform select-none flex flex-col items-center'
        : isPixelStyle
        ? 'bg-[#fff7ed] rounded-2xl p-2 border-2 border-[#8f674a]/20 shadow-sm relative active:scale-95 transition-transform select-none flex flex-col items-center'
        : isDiscordStyle
          ? 'bg-slate-800 rounded-2xl p-2 border border-white/10 shadow-sm relative active:scale-95 transition-transform select-none flex flex-col items-center'
          : 'bg-white rounded-2xl p-2 shadow-sm relative active:scale-95 transition-transform select-none flex flex-col items-center';
    const emojiLabelClass = isPixelStyle
        ? 'text-[#8f674a]'
        : isDiscordStyle
          ? 'text-slate-400'
          : 'text-slate-400';

    const selectedEmojiUrls = emojiSelectionMode ? new Set(selectedEmojis.map(se => se.url)) : new Set();

    return (
        <>
        {emojiSelectionMode && (
            <div className={`fixed inset-0 z-[-1] ${isPixelStyle ? 'bg-[#eadfce]/70 backdrop-blur-[2px]' : isDiscordStyle ? 'bg-slate-950/70 backdrop-blur-[2px]' : 'bg-white/60 backdrop-blur-[2px]'}`} />
        )}
        <div className={`sully-chat-inputbar ${shellClass} pb-safe shrink-0 z-40 relative`}>
            
            {selectionMode ? (
                <div className={`p-3 flex gap-2 ${isPixelStyle ? 'bg-[#f3e7d6]' : isDiscordStyle ? 'bg-slate-900/60 backdrop-blur-md' : 'bg-white/50 backdrop-blur-md'}`}>
                    {onForwardSelected && (
                        <button
                            onClick={() => { onForwardSelected?.(); trackEvent('转发选中的消息'); }}
                            disabled={selectedCount === 0}
                            className={`flex-1 py-3 font-bold rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 ${selectedCount === 0 ? 'bg-slate-200 text-slate-400 shadow-none' : 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-blue-200'}`}
                        >
                            <ShareNetwork className="w-5 h-5" weight="bold" />
                            转发 ({selectedCount})
                        </button>
                    )}
                    <button
                        onClick={() => { onDeleteSelected(); trackEvent('批量删除选中的消息'); }}
                        className={`${onForwardSelected ? 'flex-1' : 'w-full'} py-3 bg-red-500 text-white font-bold rounded-xl shadow-lg active:scale-95 transition-transform flex items-center justify-center gap-2`}
                    >
                        <Trash className="w-5 h-5" weight="bold" />
                        删除 ({selectedCount})
                    </button>
                </div>
            ) : (
                <div className="p-3 px-4 flex gap-3 items-end relative">
                    <button onClick={() => setShowPanel(showPanel === 'actions' ? 'none' : 'actions')} className={actionButtonClass}>
                        <Plus className="w-6 h-6" weight="bold" />
                    </button>
                    <div className={`flex-1 min-w-0 flex items-center px-1 transition-all ${useIOSStandaloneInputFix ? 'overflow-visible' : 'overflow-hidden'} ${inputWrapClass} ${isPixelStyle ? 'focus-within:bg-[#fff7ed]' : isDiscordStyle ? 'focus-within:bg-slate-800 focus-within:border-white/20' : 'border border-transparent focus-within:bg-white focus-within:border-primary/30'}`}>
                        <textarea 
                            ref={textareaRef}
                            rows={1} 
                            value={input} 
                            onChange={(e) => setInput(e.target.value)} 
                            onKeyDown={handleKeyDown} 
                            onFocus={handleInputFocus}
                            inputMode="text"
                            enterKeyHint="send"
                            autoCorrect="on"
                            autoCapitalize="sentences"
                            className={`flex-1 min-w-0 bg-transparent px-4 py-3 ${useIOSStandaloneInputFix ? 'text-[16px]' : 'text-[15px]'} resize-none max-h-24 no-scrollbar ${isDiscordStyle ? 'text-white placeholder:text-slate-500' : isPixelStyle ? 'text-[#6a4c35] placeholder:text-[#9b8677]' : ''}`} 
                            placeholder="Message..." 
                            style={{ height: 'auto' }} 
                        />
                        <button onClick={() => setShowPanel(showPanel === 'emojis' ? 'none' : 'emojis')} className={`p-2 shrink-0 ${isDiscordStyle ? 'text-slate-400 hover:text-sky-300' : isPixelStyle ? 'text-[#8f674a] hover:text-[#a16207]' : 'text-slate-400 hover:text-primary'}`}>
                            <Smiley className="w-6 h-6" weight="regular" />
                        </button>
                    </div>
                    <button 
                        onClick={onSend} 
                        disabled={!input.trim()} 
                        className={`${sendButtonClass} ${input.trim() ? '' : 'opacity-45 shadow-none'}`}
                    >
                        {sendButtonStyle === 'pill' ? <span>发送</span> : <PaperPlaneTilt className="w-5 h-5" weight="fill" />}
                    </button>

                    {emojiSelectionMode && (
                        <div className={`absolute inset-0 z-10 ${isPixelStyle ? 'bg-[#eadfce]/70 backdrop-blur-[2px]' : isDiscordStyle ? 'bg-slate-950/70 backdrop-blur-[2px]' : 'bg-white/60 backdrop-blur-[2px]'}`} />
                    )}
                </div>
            )}

            {/* Panels — always mounted, height transitions for smooth open/close */}
            {!selectionMode && (
                <div
                    className={`sully-chat-panel ${panelClass} overflow-hidden relative z-0 flex flex-col will-change-[max-height] transition-[max-height] duration-200 ease-out`}
                    style={{ maxHeight: showPanel !== 'none' ? '18rem' : '0px' }}
                >
                    
                    {/* Emojis Panel with Categories */}
                    {showPanel === 'emojis' && (
                        <>
                            {/* Categories Bar */}
                            <div className={`relative flex shrink-0 ${panelTopBarSurfaceClass}`}>
                                {/* touch-action: pan-x —— 显式告诉浏览器"从分组 chip 上起手的触摸就是横向滚动"，
                                    防止 chip 的长按/点击手势让部分浏览器犹豫而吞掉滑动（分组多时滑不到末尾的 +） */}
                                <div className={panelTopBarClass} style={{ touchAction: 'pan-x' }}>
                                    {categories.map(cat => (
                                        <button
                                            key={cat.id}
                                            onClick={(e) => handleItemClick(e, cat, 'category')}
                                            // Long press handlers for Categories
                                            onTouchStart={(e) => handleTouchStart(cat, 'category', e)}
                                            onTouchMove={handleTouchMove}
                                            onTouchEnd={handleTouchEnd}
                                            onMouseDown={(e) => handleTouchStart(cat, 'category', e)}
                                            onMouseMove={handleTouchMove}
                                            onMouseUp={handleTouchEnd}
                                            onMouseLeave={handleTouchEnd}
                                            onContextMenu={(e) => e.preventDefault()}
                                            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap shrink-0 transition-all select-none flex items-center gap-1 ${activeCategory === cat.id ? activeCategoryClass : inactiveCategoryClass}`}
                                        >
                                            {cat.name}
                                            {cat.allowedCharacterIds && cat.allowedCharacterIds.length > 0 && (
                                                <Lock className="w-3 h-3 opacity-60" weight="bold" />
                                            )}
                                        </button>
                                    ))}
                                    <button onClick={() => onPanelAction('add-category')} className={categoryAddButtonClass}>+</button>
                                </div>
                                {emojiSelectionMode ? (
                                    <div 
                                        className={`absolute inset-0 z-10 flex items-center justify-end px-3 ${
                                            isPixelStyle ? 'bg-[#eadfce]/70 backdrop-blur-[2px]' : 
                                            isDiscordStyle ? 'bg-slate-950/70 backdrop-blur-[2px]' : 
                                            'bg-white/60 backdrop-blur-[2px]'
                                        }`}
                                    >
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setEmojiSelectionMode(false); }} 
                                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow-sm ${
                                                isPixelStyle ? 'bg-[#c99872] text-[#fff7ed] hover:bg-[#b07d57]' :
                                                isDiscordStyle ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' :
                                                'bg-slate-200/80 text-slate-600 hover:bg-slate-300'
                                            }`}
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                ) : (
                                    /* 编辑按钮占据独立列，滚动区在它左侧结束，末尾的 + 不会再被覆盖。 */
                                    <div className="flex h-10 shrink-0 items-center pl-1 pr-3">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEmojiSelectionMode(true); }}
                                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors shadow-sm ${
                                                isPixelStyle ? 'bg-[#c99872] text-[#fff7ed] hover:bg-[#b07d57]' :
                                                isDiscordStyle ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' :
                                                'bg-white/90 text-slate-600 hover:bg-slate-100 backdrop-blur-sm border border-slate-200/50'
                                            }`}
                                        >
                                            <PencilSimple className="w-3.5 h-3.5" weight="bold" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto no-scrollbar p-4">
                                {/* 4 列 → 5 列：面板缩略图整体缩小一档（吸收社区美化的共识密度）。
                                    已用自定义 CSS（.sully-chat-panel button img 定宽 !important）的用户不受影响。 */}
                                <div className="grid grid-cols-5 gap-2">
                                    {emojiSelectionMode ? (
                                        <button 
                                            onClick={() => {
                                                if (selectedEmojis.length > 0) {
                                                    onPanelAction('delete-emoji-req', selectedEmojis);
                                                }
                                            }} 
                                            disabled={selectedEmojis.length === 0}
                                            className={`${emojiImportTileClass} !bg-red-50 !border-red-400 !text-red-500 ${selectedEmojis.length === 0 ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'}`}
                                        >
                                            <Trash className="w-8 h-8" weight="fill" />
                                        </button>
                                    ) : (
                                        <button onClick={() => onPanelAction('emoji-import')} className={emojiImportTileClass}>+</button>
                                    )}
                                    {visibleEmojis.map((e) => {
                                        const isSelected = selectedEmojiUrls.has(e.url);
                                        return (
                                        <button
                                            // key 必须用 url 而不是索引：索引 key 会让 React 复用 <img> 节点、
                                            // 切分组时只换 src——旧分组的位图在新图解码完成前一直挂在格子上
                                            // （表现为"新分组显示旧分组的图"）。按 url 重建节点则空白等加载，不串图。
                                            key={e.url}
                                            onClick={(ev) => handleItemClick(ev, e, 'emoji')}
                                            // Long press handlers for Emojis
                                            onTouchStart={(ev) => handleTouchStart(e, 'emoji', ev)}
                                            onTouchMove={handleTouchMove}
                                            onTouchEnd={handleTouchEnd}
                                            onMouseDown={(ev) => handleTouchStart(e, 'emoji', ev)}
                                            onMouseMove={handleTouchMove}
                                            onMouseUp={handleTouchEnd}
                                            onMouseLeave={handleTouchEnd}
                                            onContextMenu={(ev) => ev.preventDefault()}
                                            className={`${emojiTileClass} ${isSelected ? '!border-blue-500' : ''}`}
                                        >
                                            <div className="aspect-square w-full">
                                                <img src={e.url} loading="lazy" decoding="async" className="sully-emoji-thumb w-full h-full object-contain pointer-events-none" />
                                            </div>
                                            <span className={`text-[9px] truncate w-full text-center mt-0.5 leading-tight pointer-events-none ${emojiLabelClass}`}>{e.name}</span>
                                            {isSelected && <div className="absolute inset-0 bg-blue-500/20 rounded-2xl pointer-events-none border-2 border-blue-500" />}
                                        </button>
                                        );
                                    })}
                                </div>
                                {emojiPageCount > 1 && (
                                    <div className={`py-3 flex items-center justify-center gap-3 text-[10px] ${emojiLabelClass}`}>
                                        <button
                                            type="button"
                                            aria-label="上一页表情"
                                            disabled={emojiPage === 0}
                                            onClick={() => setEmojiPage(page => Math.max(0, page - 1))}
                                            className="w-8 h-7 rounded-full border border-current/20 disabled:opacity-30 active:scale-95"
                                        >
                                            ‹
                                        </button>
                                        <span>
                                            {emojiPage + 1}/{emojiPageCount} 页 · {emojiPageStart + 1}-{Math.min(emojiPageStart + EMOJI_PAGE_SIZE, emojis.length)}/{emojis.length}
                                        </span>
                                        <button
                                            type="button"
                                            aria-label="下一页表情"
                                            disabled={emojiPage >= emojiPageCount - 1}
                                            onClick={() => setEmojiPage(page => Math.min(emojiPageCount - 1, page + 1))}
                                            className="w-8 h-7 rounded-full border border-current/20 disabled:opacity-30 active:scale-95"
                                        >
                                            ›
                                        </button>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    {/* Actions Panel：外部提供 actionsContent 时整体替换内置双页网格 */}
                    {showPanel === 'actions' && actionsContent && (
                        <div className="overflow-y-auto no-scrollbar">
                            {actionsContent}
                        </div>
                    )}
                    {/* Actions Panel (单页上下滚动，不再分页；统一淡色风格) */}
                    {showPanel === 'actions' && !actionsContent && (
                        <div className="overflow-y-auto no-scrollbar">
                            {/* 统一图标容器样式：所有功能项用同一套淡色背景 + 细边框，靠小红点提示激活态 */}
                            <style>{`
                                .sully-action-tile {
                                    width: 3rem; height: 3rem; border-radius: 0.75rem;
                                    display: flex; align-items: center; justify-content: center;
                                    box-shadow: 0 1px 2px rgba(15,23,42,0.04);
                                    border: 1px solid rgba(226,232,240,0.9);
                                    background: #f8fafc; color: #64748b;
                                    transition: transform 0.15s;
                                }
                                .sully-action-tile:active { transform: scale(0.95); }
                                .sully-action-tile img, .sully-action-tile svg { width: 1.5rem; height: 1.5rem; }
                                .sully-action-tile-dark {
                                    background: #1e293b; color: #cbd5e1; border-color: rgba(255,255,255,0.08);
                                }
                            `}</style>
                          <div className="p-4 grid grid-cols-4 gap-5">
                            {/* 见面：直接跳到该角色的见面模式（等同于进见面 App 并点击该角色） */}
                            <button onClick={() => onPanelAction('meetup')} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}>
                                <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                    <Sparkle className="w-6 h-6" weight="fill" />
                                </div>
                                <span className="text-xs font-bold">见面</span>
                            </button>

                            <button onClick={() => onPanelAction('transfer')} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}>
                                {acnh ? <AcnhActionTile kind="transfer" /> : (
                                <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                    <Money className="w-6 h-6" weight="bold" />
                                </div>)}
                                <span className="text-xs font-bold">转账</span>
                            </button>
                            
                            <button onClick={() => onPanelAction('poke')} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}>
                                {acnh ? <AcnhActionTile kind="poke" /> : (
                                <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}><img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f449.png" alt="poke" className="w-6 h-6" /></div>)}
                                <span className="text-xs font-bold">戳一戳</span>
                            </button>
                            
                            <button onClick={() => onPanelAction('archive')} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}>
                                {acnh ? <AcnhActionTile kind="archive" /> : (
                                <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                    <BookOpenText className="w-6 h-6" weight="bold" />
                                </div>)}
                                <span className="text-xs font-bold">{isSummarizing ? '归档中...' : '记忆归档'}</span>
                            </button>
                            
                            <button onClick={() => onPanelAction('settings')} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}>
                                {acnh ? <AcnhActionTile kind="settings" /> : (
                                <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                    <GearSix className="w-6 h-6" weight="bold" /></div>)}
                                <span className="text-xs font-bold">设置</span>
                            </button>
                            
                            <button onClick={() => chatImageInputRef.current?.click()} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}>
                                {acnh ? <AcnhActionTile kind="image" /> : (
                                <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                    <Image className="w-6 h-6" weight="bold" />
                                </div>)}
                                <span className="text-xs font-bold">相册</span>
                            </button>
                            <input type="file" ref={chatImageInputRef} className="hidden" accept="image/*" onChange={(e) => handleImageChange(e, 'chat')} />

                            {/* 生图按钮：打开手动生图面板（角色 / 你 / 合照） */}
                            <button onClick={() => onPanelAction('image-gen')} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}>
                                {acnh ? <AcnhActionTile kind="image" /> : (
                                <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                    <Sparkle className="w-6 h-6" weight="bold" />
                                </div>)}
                                <span className="text-xs font-bold">生图</span>
                            </button>

                            {/* Regenerate Button */}
                            <button onClick={onReroll} disabled={!canReroll} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${canReroll ? (isDiscordStyle ? 'text-slate-200' : 'text-slate-600') : 'text-slate-300 opacity-50'}`}>
                                {acnh ? <AcnhActionTile kind="regenerate" /> : (
                                <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''} ${!canReroll ? 'opacity-50' : ''}`}>
                                    <ArrowsClockwise className="w-6 h-6" weight="bold" />
                                </div>)}
                                <span className="text-xs font-bold">重新生成</span>
                            </button>

                            {/* 情绪按钮已并入日程 — 情绪/意识流与日程强制同步，配置面板在日程 Modal 下方 */}

                            {/* Schedule Button */}
                            <button onClick={() => onPanelAction('schedule')} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}>
                                {acnh ? <AcnhActionTile kind="schedule" /> : (
                                <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                    <CalendarBlank className="w-6 h-6" weight="bold" />
                                </div>)}
                                <span className="text-xs font-bold">日程/情绪</span>
                            </button>

                            {/* read：小说共读（打开悬浮阅读器） */}
                            <button
                              type="button"
                              onClick={() => onPanelAction('novel-reader')}
                              className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}
                            >
                              <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                <BookOpenText className="w-6 h-6" weight="bold" />
                              </div>
                              <span className="text-xs font-bold">read</span>
                            </button>

                            {/* 番外：打开全屏番外生成页（副 API 生成小说式番外，收藏到拾光） */}
                            <button
                              type="button"
                              onClick={() => onPanelAction('fanwai')}
                              className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}
                            >
                              <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                <Feather className="w-6 h-6" weight="bold" />
                              </div>
                              <span className="text-xs font-bold">番外</span>
                            </button>

                            {/* 占位图标：手账（暂未开放） */}
                            <button
                              type="button"
                              onClick={() => {}}
                              aria-disabled="true"
                              className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}
                            >
                              <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                <PencilSimple className="w-6 h-6" weight="bold" />
                              </div>
                              <span className="text-xs font-bold">手账</span>
                            </button>

                          </div>

                          <div className="p-4 grid grid-cols-4 gap-5">
                            {/* 主动消息（激活态用小红点提示） */}
                            <button onClick={() => onPanelAction('proactive')} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform relative ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}>
                                {acnh ? <AcnhActionTile kind="proactive" /> : (
                                <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                    <ChatCircleDots className="w-6 h-6" weight="bold" />
                                </div>)}
                                <span className="text-xs font-bold">主动消息</span>
                                {isProactiveActive && <span className={`absolute top-0 right-1 w-2.5 h-2.5 rounded-full border-2 ${isDiscordStyle ? 'bg-violet-400 border-slate-900' : 'bg-violet-500 border-white'}`} />}
                            </button>

                            {/* 主动消息 2.0：云端 worker 定时任务 */}
                            <button onClick={() => onPanelAction('active-msg-2')} className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}>
                                {acnh ? <AcnhActionTile kind="proactive" /> : (
                                <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                    <Alarm className="w-6 h-6" weight="bold" />
                                </div>)}
                                <span className="text-xs font-bold">主动消息 2.0</span>
                            </button>

                            {/* 麦当劳：tap 切换激活 */}
                            <button
                              onClick={() => {
                                if (!mcdConfigured) { onPanelAction('mcd-not-configured'); return; }
                                onPanelAction(mcdActivated ? 'mcd-end' : 'mcd-request');
                              }}
                              className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'} ${!mcdConfigured ? 'opacity-50' : ''}`}
                            >
                              {acnh ? <div className="relative"><AcnhActionTile kind="mcd" />{mcdActivated && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#fc736d] border-2 border-white" />}</div> : (
                              <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''} relative`}>
                                  <ForkKnife className="w-6 h-6" weight="bold" />
                                  {mcdActivated && <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 ${isDiscordStyle ? 'bg-yellow-300 border-slate-900' : 'bg-yellow-500 border-white'}`} />}
                              </div>)}
                              <span className="text-xs font-bold">{mcdActivated ? '结束麦请求' : '麦当劳'}</span>
                            </button>

                            {/* 瑞一杯 MCP */}
                            <button
                              onClick={() => {
                                if (!luckinConfigured) { onPanelAction('luckin-not-configured'); return; }
                                onPanelAction(luckinActivated ? 'luckin-end' : 'luckin-request');
                              }}
                              className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'} ${!luckinConfigured ? 'opacity-50' : ''}`}
                            >
                              <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''} relative`}>
                                  <Coffee className="w-6 h-6" weight="bold" />
                                  {luckinActivated && <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 ${isDiscordStyle ? 'bg-[#C6A15B] border-slate-900' : 'bg-[#C6A15B] border-white'}`} />}
                              </div>
                              <span className="text-xs font-bold">{luckinActivated ? '结束瑞一杯' : '瑞一杯'}</span>
                            </button>

                            {/* HTML 模式：tap 切换，长按设置 */}
                            <button
                              onClick={() => onPanelAction('html-mode-toggle')}
                              onContextMenu={(e) => { e.preventDefault(); onPanelAction('html-mode-settings'); }}
                              className={`flex flex-col items-center gap-2 active:scale-95 transition-transform relative ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}
                            >
                              {acnh ? <div className="relative"><AcnhActionTile kind="html" />{htmlModeEnabled && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#b77dee] border-2 border-white" />}</div> : (
                              <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''} relative`}>
                                  <Code className="w-6 h-6" weight="bold" />
                                  {htmlModeEnabled && <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 ${isDiscordStyle ? 'bg-fuchsia-400 border-slate-900' : 'bg-fuchsia-500 border-white'}`} />}
                              </div>)}
                              <span className="text-xs font-bold">{htmlModeEnabled ? 'HTML已开' : 'HTML模式'}</span>
                            </button>

                            {/* 展示思考 */}
                            <button
                              onClick={() => onPanelAction('thinking-settings')}
                              className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}
                            >
                              {acnh ? <div className="relative"><AcnhActionTile kind="thinking" />{showThinkingChain && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#889df0] border-2 border-white" />}</div> : (
                              <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''} relative`}>
                                  <Brain className="w-6 h-6" weight="bold" />
                                  {showThinkingChain && <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 ${isDiscordStyle ? 'bg-indigo-400 border-slate-900' : 'bg-indigo-500 border-white'}`} />}
                              </div>)}
                              <span className="text-xs font-bold">{showThinkingChain ? '思考已开' : '展示思考'}</span>
                            </button>

                            {/* 聊天装扮 */}
                            <button
                              onClick={() => onPanelAction('fine-tune')}
                              className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}
                            >
                              {acnh ? <AcnhActionTile kind="fine-tune" /> : (
                              <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                  <FadersHorizontal className="w-6 h-6" weight="bold" />
                              </div>)}
                              <span className="text-xs font-bold">聊天装扮</span>
                            </button>

                            {/* 白框 */}
                            <button
                              onClick={() => onPanelAction('chrome-css')}
                              className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}
                            >
                              {acnh ? <AcnhActionTile kind="chrome-css" /> : (
                              <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                  <PencilSimple className="w-6 h-6" weight="bold" />
                              </div>)}
                              <span className="text-xs font-bold">白框</span>
                            </button>

                            {/* 提示音 */}
                            <button
                              onClick={() => onPanelAction('chrome-sound')}
                              className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}
                            >
                              {acnh ? <AcnhActionTile kind="chrome-sound" /> : (
                              <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                  <BellSimpleRinging className="w-6 h-6" weight="bold" />
                              </div>)}
                              <span className="text-xs font-bold">提示音</span>
                            </button>

                            {/* 记忆链接 */}
                            <button
                              onClick={() => onPanelAction('memory-link')}
                              className={`flex flex-col items-center gap-2 active:scale-95 transition-transform ${acnh ? 'text-[#725d42]' : isDiscordStyle ? 'text-slate-200' : 'text-slate-600'}`}
                            >
                              <div className={`sully-action-tile ${isDiscordStyle ? 'sully-action-tile-dark' : ''}`}>
                                <LinkSimple className="w-6 h-6" weight="bold" />
                              </div>
                              <span className="text-xs font-bold">记忆链接</span>
                            </button>
                          </div>

                        </div>
                     )}
                     {showPanel === 'chars' && (
                        <div className="p-5 space-y-6 overflow-y-auto no-scrollbar">
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setIsBubbleSectionOpen(prev => !prev)}
                                    aria-expanded={isBubbleSectionOpen}
                                    className="w-full flex items-center justify-between gap-3 px-1 py-1 text-left"
                                >
                                    <span>
                                        <span className="block text-xs font-bold text-slate-400 tracking-wider uppercase">气泡样式 · 当前角色</span>
                                        <span className="block mt-1 text-[10px] text-slate-400">{isBubbleSectionOpen ? '选择或管理当前角色的气泡' : '已折叠 · 点此展开'}</span>
                                    </span>
                                    <span className={`text-slate-400 transition-transform ${isBubbleSectionOpen ? 'rotate-180' : ''}`} aria-hidden>⌄</span>
                                </button>
                                {isBubbleSectionOpen && <div className="mt-3">
                                <div className="flex justify-end px-1 mb-2">
                                    <span className="text-[10px] text-slate-400">新气泡去「气泡工坊」App 制作</span>
                                </div>
                                {customThemes.length > 6 && (
                                    <input
                                        value={bubbleSearch}
                                        onChange={e => setBubbleSearch(e.target.value)}
                                        placeholder="搜索我的气泡…"
                                        className="w-full mb-2.5 px-3 py-2 rounded-xl bg-white/70 border border-slate-200 text-xs focus:outline-none focus:border-indigo-300"
                                    />
                                )}
                                <div className="flex flex-wrap gap-2 px-1 max-h-48 overflow-y-auto no-scrollbar pb-1">
                                    {(bubbleSearch.trim() ? [] : Object.values(PRESET_THEMES)).map(t => (
                                        <button key={t.id} onClick={() => onUpdateTheme(t.id)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-2xl text-xs font-bold border transition-all ${activeThemeId === t.id ? 'bg-primary text-white border-primary shadow-md' : 'bg-white border-slate-200 text-slate-600'}`}>
                                            <span className="flex -space-x-1">
                                                <span className="w-3 h-3 rounded-full border border-white/80 shadow-sm" style={{ background: t.user?.backgroundColor || '#6366f1' }} />
                                                <span className="w-3 h-3 rounded-full border border-white/80 shadow-sm" style={{ background: t.ai?.backgroundColor || '#ffffff' }} />
                                            </span>
                                            {t.name}
                                            {activeThemeId === t.id && <span aria-hidden>✓</span>}
                                        </button>
                                    ))}
                                    {customThemes
                                        .filter(t => !bubbleSearch.trim() || (t.name || '').toLowerCase().includes(bubbleSearch.trim().toLowerCase()))
                                        .map(t => {
                                            const inUseCount = characters.filter(c => (c as any).bubbleStyle === t.id).length;
                                            const pendingDelete = pendingDeleteThemeId === t.id;
                                            return (
                                                <div key={t.id} className={`flex items-center rounded-2xl border transition-all overflow-hidden ${activeThemeId === t.id ? 'bg-indigo-500 border-indigo-500 text-white shadow-md' : 'bg-indigo-50 border-indigo-100 text-indigo-600'}`}>
                                                    <button onClick={() => onUpdateTheme(t.id)} className="flex items-center gap-1.5 pl-3.5 pr-1.5 py-2 text-xs font-bold active:scale-95 transition-transform">
                                                        <span className="flex -space-x-1">
                                                            <span className="w-3 h-3 rounded-full border border-white/80 shadow-sm" style={{ background: t.user?.backgroundColor || '#6366f1' }} />
                                                            <span className="w-3 h-3 rounded-full border border-white/80 shadow-sm" style={{ background: t.ai?.backgroundColor || '#ffffff' }} />
                                                        </span>
                                                        {t.name}
                                                        {activeThemeId === t.id && <span aria-hidden>✓</span>}
                                                        {inUseCount > 0 && activeThemeId !== t.id && (
                                                            <span className="text-[9px] font-normal opacity-70">{inUseCount}人在用</span>
                                                        )}
                                                    </button>
                                                    {/* 删除两步确认：第一下变红色「确删」，3 秒不点自动还原 */}
                                                    {pendingDelete ? (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setPendingDeleteThemeId(null); onRemoveTheme(t.id); }}
                                                            className="px-2 py-2 text-[10px] font-bold bg-red-500 text-white self-stretch"
                                                        >
                                                            确删
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setPendingDeleteThemeId(t.id);
                                                                setTimeout(() => setPendingDeleteThemeId(cur => (cur === t.id ? null : cur)), 3000);
                                                            }}
                                                            aria-label={`删除气泡 ${t.name}`}
                                                            className={`pr-2.5 pl-1 py-2 text-sm leading-none opacity-45 hover:opacity-100 transition-opacity ${activeThemeId === t.id ? 'text-white' : 'text-indigo-400'}`}
                                                        >
                                                            ×
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    {bubbleSearch.trim() && customThemes.every(t => !(t.name || '').toLowerCase().includes(bubbleSearch.trim().toLowerCase())) && (
                                        <div className="text-[11px] text-slate-400 px-1 py-2">没有叫「{bubbleSearch.trim()}」的气泡～</div>
                                    )}
                                </div>
                                </div>}
                            </div>
                            <div>
                                <h3 className="text-xs font-bold text-slate-400 px-1 tracking-wider uppercase mb-3">切换会话</h3>
                                <div className="space-y-3">
                                    {characters.map(c => {
                                        const unread = c.id !== activeCharacterId ? (unreadMessages[c.id] || 0) : 0;
                                        return (
                                        <div key={c.id} onClick={() => onCharSelect(c.id)} className={`flex items-center gap-4 p-3 rounded-[20px] border cursor-pointer ${c.id === activeCharacterId ? 'bg-white border-primary/30 shadow-md' : 'bg-white/50 border-transparent'}`}>
                                            <div className="relative shrink-0">
                                                <img src={c.avatar} className="w-12 h-12 rounded-2xl object-cover" />
                                                {unread > 0 && (
                                                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow-[0_0_8px_rgba(244,63,94,0.6)] ring-2 ring-white" aria-label={`${unread} 条未读消息`}>{unread > 99 ? '99+' : unread}</span>
                                                )}
                                            </div>
                                            <div className="flex-1"><div className="font-bold text-sm text-slate-700">{c.name}</div><div className="text-xs text-slate-400 truncate">{c.description}</div></div>
                                        </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
        </>
    );
};

export default React.memo(ChatInputArea);
