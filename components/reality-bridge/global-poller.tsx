/**
 * 现实桥 · 全局隐形轮询器（挂 PhoneShell，常驻）。
 *
 * 云端 Worker 把事件+回应打包进 D1 pending 后，App 存活期间由这里定时拉取、
 * 按 eventId+charId 幂等合并进角色会话，并 toast 提示「现实桥收到新事件」。
 * 配置了 workerUrl 且自动接收开才轮询；没有则不做事、零开销。
 *
 * v1 不依赖 Service Worker 解析现实桥 push（避免与 amsg-sw 深层协议抢道）；
 * 「App 被杀也能收」通过「角色回应已在云端生成 + App 打开即拉取合并」闭环。
 */
import { useCallback, useEffect, useRef } from 'react';
import { useOS } from '../../context/OSContext';
import { DB } from '../../utils/db';
import { loadBridgeSettings, appendBridgeFeed } from '../../utils/realityBridge/settings';
import { fetchPendingBundles, ackBundles } from '../../utils/realityBridge/sync';
import { mergeBridgeBundle, type BridgeChatGlueHost } from '../../utils/realityBridge/chat-glue';
import type { BridgePushBundle } from '../../utils/realityBridge/types';

export function RealityBridgePoller(): null {
    const { updateCharacter, addToast } = useOS();
    const pollTimer = useRef<number | null>(null);
    const busy = useRef(false);
    const charNames = useRef<Record<string, string>>({});

    const host = useRef<BridgeChatGlueHost>({});
    host.current.updateCharacter = (id, patch) => updateCharacter(id, patch);
    host.current.notify = (title, body) => {
        try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                new Notification(title, { body });
            }
        } catch { /* ignore */ }
    };

    useEffect(() => {
        void DB.getAllCharacters()
            .then(list => {
                const map: Record<string, string> = {};
                for (const c of list) map[c.id] = c.name;
                charNames.current = map;
            })
            .catch(() => undefined);
    }, []);

    const pollOnce = useCallback(async () => {
        const settings = loadBridgeSettings();
        if (!settings.enabled || !settings.workerUrl.trim()) return;
        if (busy.current) return;
        busy.current = true;
        try {
            const items = await fetchPendingBundles();
            if (items.length === 0) return;
            const mergedIds: string[] = [];
            for (const bundle of items as BridgePushBundle[]) {
                const pref = settings.perChar?.[bundle.charId];
                if (!pref?.enabled) continue;
                const result = await mergeBridgeBundle(bundle, host.current);
                if (result.mergedEvent) {
                    mergedIds.push(bundle.eventId);
                    const charName = charNames.current[bundle.charId] || '角色';
                    const replyNote = result.mergedReply ? '，角色回应了' : '';
                    addToast(`现实桥 · ${bundle.itemType} 已进入与 ${charName} 的对话${replyNote}`, 'info');
                    appendBridgeFeed({
                        id: bundle.eventId,
                        type: bundle.itemType,
                        payload: bundle.eventText.slice(0, 2000),
                        processed: undefined,
                        rules: [],
                        actions: result.actionNotes,
                        receivedAt: new Date().toISOString(),
                    });
                }
            }
            if (mergedIds.length > 0) await ackBundles(mergedIds);
        } catch (err) {
            console.warn('[现实桥] 轮询合并失败', err);
        } finally {
            busy.current = false;
        }
    }, [addToast]);

    useEffect(() => {
        const settings = loadBridgeSettings();
        if (!settings.enabled || !settings.workerUrl.trim()) return;
        const seconds = Math.max(10, Math.min(300, Number(settings.pollSeconds) || 20));

        const onVisible = () => { if (document.visibilityState === 'visible') void pollOnce(); };
        const onFocus = () => void pollOnce();
        const startTimer = () => {
            if (pollTimer.current === null) pollTimer.current = window.setInterval(() => void pollOnce(), seconds * 1000);
        };

        void pollOnce();
        startTimer();
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            if (pollTimer.current !== null) {
                clearInterval(pollTimer.current);
                pollTimer.current = null;
            }
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [pollOnce]);

    return null;
}
