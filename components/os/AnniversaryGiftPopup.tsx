import React, { useEffect, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { PRESET_THEMES } from '../chat/ChatConstants';
import { resolveChatTheme } from '../../utils/groupChat/theme';
import {
  ANNIVERSARY_ARTIST, ANNIVERSARY_FRAME_STYLE, ANNIVERSARY_FRAME_URL, ANNIVERSARY_WALLPAPERS,
  avatarDecorationImageStyle, createAnniversaryTheme,
} from '../../utils/anniversaryGifts';
import TokenImg from './TokenImg';
import './anniversary-gift.css';

const CONFETTI = ['🎉', '✨', '💜', '👑', '🌟', '🎊'];

export default function AnniversaryGiftPopup({ onClose }: { onClose: () => void }) {
  const { characters, activeCharacterId, userProfile, customThemes, addCustomTheme, updateCharacter, updateTheme, addToast } = useOS();
  const [choosing, setChoosing] = useState(false);
  const [characterId, setCharacterId] = useState(characters.find(c => c.id === activeCharacterId)?.id || characters[0]?.id || '');
  const [phone, setPhone] = useState(true);
  const [chat, setChat] = useState(characters.length > 0);
  const [frame, setFrame] = useState(characters.length > 0);
  const [phoneWallpaper, setPhoneWallpaper] = useState<string>(ANNIVERSARY_WALLPAPERS[0].url);
  const [chatWallpaper, setChatWallpaper] = useState<string>(ANNIVERSARY_WALLPAPERS[1].url);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [celebrating, setCelebrating] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const selectedCharacter = characters.find(c => c.id === characterId);
  const canApply = (phone || chat || frame) && (!(chat || frame) || !!selectedCharacter);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) closeRef.current();
      }
      if (event.key === 'Tab') {
        const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled)') || []);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panelRef.current)) {
          event.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey, true);
    const timer = window.setTimeout(() => setCelebrating(false), 3500);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      window.clearTimeout(timer);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const apply = async () => {
    if (!canApply || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError('');
    try {
      if (selectedCharacter && (frame || chat)) {
        const nextTheme = frame ? createAnniversaryTheme(
          resolveChatTheme(selectedCharacter.bubbleStyle, customThemes, PRESET_THEMES), selectedCharacter.id,
        ) : undefined;
        if (nextTheme) await addCustomTheme(nextTheme);
        updateCharacter(selectedCharacter.id, {
          ...(chat ? { chatBackground: chatWallpaper } : {}),
          ...(nextTheme ? { bubbleStyle: nextTheme.id } : {}),
        });
      }
      if (phone) await updateTheme({ wallpaper: phoneWallpaper });
      addToast('周年装扮已应用，尊贵感拉满 ✨', 'success');
      onClose();
    } catch {
      setError('有装扮未能保存，请重试。赠礼会一直留在内置选项里。');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="anniversary-overlay">
      <div className="anniversary-backdrop" aria-hidden="true" />
      {celebrating && <div className="anniversary-confetti" aria-hidden="true">
        {Array.from({ length: 30 }, (_, i) => <span key={i} style={{
          '--x': `${4 + (i * 37 % 92)}%`, '--delay': `${i % 8 * 0.07}s`,
          '--drift': `${(i % 2 ? 1 : -1) * (30 + i % 5 * 16)}px`, '--spin': `${(i % 2 ? 1 : -1) * 280}deg`,
        } as React.CSSProperties}>{CONFETTI[i % CONFETTI.length]}</span>)}
      </div>}
      <div className="anniversary-panel" ref={panelRef} role="dialog" aria-modal="true"
        aria-labelledby="anniversary-title" aria-describedby="anniversary-description" tabIndex={-1}>
        <button className="anniversary-close" type="button" aria-label="关闭周年赠礼" disabled={busy} onClick={onClose}>×</button>
        <div className="anniversary-scroll">
          <p className="anniversary-eyebrow">SULLYOS · 一周年纪念</p>
          <h2 id="anniversary-title">{choosing ? '把尊贵，安排上。' : 'Ta-da——周年大户！'}</h2>
          <p id="anniversary-description" className="anniversary-intro">
            九月，是开始做小手机的一周年。<br />
            一位老玩家送来的周年心意，<br />
            也想分享给一路同行的你。
          </p>
          <p className="anniversary-credit">壁纸与头像框作者：{ANNIVERSARY_ARTIST}</p>
          {!choosing ? <>
            <div className="anniversary-art" aria-label="两款周年壁纸和一枚尊贵猫猫头像框">
              <img className="anniversary-paper anniversary-paper-left" src={ANNIVERSARY_WALLPAPERS[0].url} alt="奶油星星壁纸" />
              <img className="anniversary-paper anniversary-paper-right" src={ANNIVERSARY_WALLPAPERS[1].url} alt="糖霜格纹壁纸" />
              <div className="anniversary-avatar">
                {userProfile.avatar ? <TokenImg value={userProfile.avatar} className="anniversary-avatar-photo" alt="你的头像预览" /> : <div className="anniversary-avatar-photo anniversary-avatar-fallback">🐱</div>}
                <img src={ANNIVERSARY_FRAME_URL} alt="尊贵猫猫一周年头像框" className="anniversary-frame" style={avatarDecorationImageStyle(ANNIVERSARY_FRAME_STYLE, 86)} />
              </div>
            </div>
            <div className="anniversary-receipt">
              <span>尊贵程度</span><strong>满级大户 👑</strong>
              <span>累计充值</span><strong>¥ 0.00</strong>
            </div>
            <p className="anniversary-owned">两张壁纸 + 一枚头像框，已永久收入收藏。</p>
            <p className="anniversary-hint">免费赠送，排面管够。以后可在「外观 → 手机壁纸」、<br />「聊天设置 → 聊天背景」和「气泡工坊 → 头像」自选。</p>
          </> : <fieldset className="anniversary-options" disabled={busy}>
            <label className="anniversary-character-label" htmlFor="anniversary-character">给哪位角色的聊天换装？</label>
            <select id="anniversary-character" value={characterId} onChange={e => setCharacterId(e.target.value)}>
              <option value="">选择角色</option>
              {characters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {!characters.length && <p className="anniversary-hint">还没有角色，也可以先只换手机壁纸；头像框和聊天壁纸会一直等你。</p>}
            <label className="anniversary-option"><input type="checkbox" checked={frame} onChange={e => setFrame(e.target.checked)} /><span>戴上尊贵猫猫头像框<small>这段聊天里的你和角色一起戴</small></span></label>
            <div className="anniversary-option-row">
              <label className="anniversary-option"><input type="checkbox" checked={chat} onChange={e => setChat(e.target.checked)} /><span>角色的聊天壁纸</span></label>
              <select aria-label="周年聊天壁纸" disabled={!chat || busy} value={chatWallpaper} onChange={e => setChatWallpaper(e.target.value)}>{ANNIVERSARY_WALLPAPERS.map(w => <option key={w.id} value={w.url}>{w.name}</option>)}</select>
            </div>
            <div className="anniversary-option-row">
              <label className="anniversary-option"><input type="checkbox" checked={phone} onChange={e => setPhone(e.target.checked)} /><span>手机桌面壁纸<small>整部手机共用</small></span></label>
              <select aria-label="周年手机壁纸" disabled={!phone || busy} value={phoneWallpaper} onChange={e => setPhoneWallpaper(e.target.value)}>{ANNIVERSARY_WALLPAPERS.map(w => <option key={w.id} value={w.url}>{w.name}</option>)}</select>
            </div>
            <p className="anniversary-hint">勾选的装扮会替换对应设置，原来的气泡配色和样式会保留。</p>
          </fieldset>}
          {error && <p className="anniversary-error" role="alert">{error}</p>}
        </div>
        <div className="anniversary-actions">
          <div className="anniversary-action-row">
            <button className="anniversary-secondary" type="button" disabled={busy} onClick={onClose}>
              <span className="anniversary-button-label">收下赠礼</span>
            </button>
            <button className="anniversary-primary" type="button" disabled={busy || (choosing && !canApply)} aria-busy={busy} onClick={choosing ? apply : () => setChoosing(true)}>
              <span className="anniversary-button-label">
                <svg className="anniversary-button-star" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m10 1 2.6 6.4L19 10l-6.4 2.6L10 19l-2.6-6.4L1 10l6.4-2.6L10 1Z" stroke="currentColor" /><path d="m10 6 1.2 2.8L14 10l-2.8 1.2L10 14l-1.2-2.8L6 10l2.8-1.2L10 6Z" fill="currentColor" /></svg>
                {busy ? '换装中…' : choosing ? '确认换装' : '立即换装'}
              </span>
              <svg className="anniversary-button-arrow" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 8h9m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.2" /></svg>
            </button>
          </div>
          {choosing && <button className="anniversary-back" type="button" disabled={busy} onClick={() => setChoosing(false)}>返回看看赠礼</button>}
        </div>
      </div>
    </div>
  );
}
