/**
 * 拾光 App —— 收藏馆。
 *
 * 从「扁平番外书架」升级为三级收藏馆：
 *   L1 角色卡片横滑（只显示有内容的角色）
 *   L2 角色主页：来信 / 番外 两个入口
 *   L3 列表：来信按年份分章（信封形态） / 番外迷你书网格
 *   再往下是各自的详情页（番外可转发/续写，来信可回信/删除）
 *
 * 数据层：番外仍走 fanwaiStories（结构不动），来信走新增的 collectedLetters，
 * 在 UI 层用 utils/letter/shelf 归一化成按角色聚合的汇总。
 * AppID 保持 Fanwai 不变（改名要同步注册点/消息判定/localStorage key，风险远大于收益）。
 */

import React, { useMemo, useState } from 'react';
import { useOS } from '../context/OSContext';
import { AppID, CharacterProfile, FanwaiStory, LetterRecord } from '../types';
import { DB } from '../utils/db';
import { continueFanwai, type SubApiConfig } from '../utils/fanwaiGenerator';
import { buildShelfSummaries } from '../utils/letter/shelf';
import { saveLetterReply } from '../utils/letter/reply';
import { storyParts } from '../components/fanwai/fanwaiVisual';
import ShelfCharacterRail from '../components/fanwai/ShelfCharacterRail';
import CharacterShelfHome from '../components/fanwai/CharacterShelfHome';
import LetterListView from '../components/fanwai/LetterListView';
import LetterDetailView from '../components/fanwai/LetterDetailView';
import FanwaiListView from '../components/fanwai/FanwaiListView';
import FanwaiDetailView from '../components/fanwai/FanwaiDetailView';

type ShelfRoute = 'rail' | 'home' | 'letters' | 'fanwai';

const FanwaiApp: React.FC = () => {
    const {
        closeApp, fanwaiStories, deleteFanwaiStory, updateFanwaiStory,
        collectedLetters, deleteCollectedLetter,
        characters, updateCharacter, addToast, openApp, setActiveCharacterId, apiConfig,
    } = useOS();

    const [route, setRoute] = useState<ShelfRoute>('rail');
    const [charId, setCharId] = useState<string | null>(null);
    const [letterDetail, setLetterDetail] = useState<LetterRecord | null>(null);
    const [storyDetail, setStoryDetail] = useState<FanwaiStory | null>(null);
    const [continuing, setContinuing] = useState(false);

    // 归一化 + 按角色聚合（只保留有内容的角色）。列表与计数都从这里取，避免多份派生状态。
    const summaries = useMemo(
        () => buildShelfSummaries(characters, fanwaiStories, collectedLetters),
        [characters, fanwaiStories, collectedLetters],
    );
    const summary = useMemo(
        () => summaries.find(s => s.charId === charId) || null,
        [summaries, charId],
    );

    /** 番外 → 转发给角色：写长期记忆 + 注入私聊卡片 + 跳回私聊。 */
    const handleForward = async (story: FanwaiStory, role: CharacterProfile) => {
        const { title, body } = storyParts(story);
        const dateStr = new Date().toISOString().slice(0, 10);
        const flatBody = body.replace(/\s+/g, ' ');
        const summaryText = `${flatBody.slice(0, 120)}${flatBody.length > 120 ? '…' : ''}`;

        updateCharacter(role.id, {
            memories: [...(role.memories || []), {
                id: `mem-fanwai-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                date: dateStr,
                summary: `「${title}」是关于你的一篇番外：${summaryText}`,
                mood: 'creative',
            }],
        });

        await DB.saveMessage({
            charId: role.id,
            role: 'user',
            type: 'fanwai_card',
            content: title,
            metadata: {
                fanwaiStory: {
                    title,
                    summary: summaryText,
                    charName: story.charName,
                    style: story.style,
                    wordCount: story.wordCount,
                    pov: story.pov,
                    content: story.content,
                    ...(story.format === 'html' ? { format: 'html' as const, htmlType: story.htmlType || 'custom' } : {}),
                },
            },
        });

        setStoryDetail(null);
        setActiveCharacterId(role.id);
        openApp(AppID.Chat);
        addToast(`已转发给 ${role.name}，ta 已经读到这篇番外`, 'success');
    };

    /** 番外 → 续写：取原文末尾为上下文，AI 接续并追加进正文。 */
    const handleContinue = async (story: FanwaiStory, direction: string) => {
        if (story.format === 'html' || continuing) return;
        const char = characters.find(c => c.id === story.charId);
        if (!char) { addToast('找不到这篇番外的角色', 'error'); return; }
        const subApi: SubApiConfig = {
            baseUrl: apiConfig?.subBaseUrl || '',
            apiKey: apiConfig?.subApiKey || '',
            model: apiConfig?.subModel || '',
        };
        setContinuing(true);
        try {
            const res = await continueFanwai(char, story, subApi, direction || undefined);
            if (res.ok && res.content) {
                const updated: FanwaiStory = {
                    ...story,
                    content: story.content + '\n\n' + res.content,
                    continuedAt: Date.now(),
                };
                setStoryDetail(updated);
                updateFanwaiStory(updated.id, updated);
                addToast('续写完成', 'success');
            } else if (res.reason === 'no_sub_api') {
                addToast('副 API 未配置，无法续写', 'error');
            } else {
                addToast('续写失败，重试？', 'error');
            }
        } catch (e) {
            console.error('[Shelf] continue fanwai failed:', e);
            addToast('续写失败，重试？', 'error');
        } finally {
            setContinuing(false);
        }
    };

    /** 来信 → 回信（与聊天页共用同一套：落库 + 幂等记忆 + 短期上下文）。 */
    const handleLetterReply = async (letter: LetterRecord, text: string) => {
        const char = characters.find(c => c.id === letter.charId);
        if (!char) { addToast('找不到这封信的角色', 'error'); return; }
        await saveLetterReply(letter, text, char, updateCharacter);
        addToast('回信已寄出', 'success');
    };

    /** 来信 → 去聊天找这个角色。 */
    const handleOpenChat = (letter: LetterRecord) => {
        setActiveCharacterId(letter.charId);
        openApp(AppID.Chat);
    };

    // —— 渲染：详情页优先，其次按层级 ——
    if (letterDetail) {
        return (
            <LetterDetailView
                letter={letterDetail}
                onReply={handleLetterReply}
                onDelete={async (letter) => {
                    await deleteCollectedLetter(letter.id);
                    setLetterDetail(null);
                }}
                onOpenChat={handleOpenChat}
                onBack={() => setLetterDetail(null)}
                onClose={closeApp}
            />
        );
    }

    if (storyDetail) {
        return (
            <FanwaiDetailView
                story={storyDetail}
                characters={characters}
                continuing={continuing}
                onForward={handleForward}
                onDelete={async (story) => {
                    await deleteFanwaiStory(story.id);
                    setStoryDetail(null);
                }}
                onContinue={handleContinue}
                onBack={() => setStoryDetail(null)}
                onClose={closeApp}
            />
        );
    }

    if (!summary || route === 'rail') {
        return (
            <ShelfCharacterRail
                summaries={summaries}
                onSelect={(id) => { setCharId(id); setRoute('home'); }}
                onClose={closeApp}
            />
        );
    }

    if (route === 'home') {
        return (
            <CharacterShelfHome
                summary={summary}
                onOpenLetters={() => setRoute('letters')}
                onOpenFanwai={() => setRoute('fanwai')}
                onBack={() => setRoute('rail')}
                onClose={closeApp}
            />
        );
    }

    if (route === 'letters') {
        return (
            <LetterListView
                charName={summary.charName}
                letters={summary.letters}
                onOpen={setLetterDetail}
                onBack={() => setRoute('home')}
                onClose={closeApp}
            />
        );
    }

    return (
        <FanwaiListView
            charName={summary.charName}
            stories={summary.stories}
            onOpen={setStoryDetail}
            onBack={() => setRoute('home')}
            onClose={closeApp}
        />
    );
};

export default FanwaiApp;
