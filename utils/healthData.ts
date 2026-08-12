/**
 * 健康数据管理工具
 * 阶段一：手动输入 → IndexedDB 持久化 → 生成上下文文本注入 AI prompt
 * 阶段二：定时从手机端 Health Connect → Cloudflare Worker 自动同步
 */

import type { HealthSnapshot } from '../types';

const DB_NAME = 'sullyos_health_data';
const DB_VERSION = 1;
const STORE_NAME = 'health_snapshots';
const KEY = 'current_snapshot';

// ───────────────────── IndexedDB ─────────────────────

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function saveHealthSnapshot(snapshot: HealthSnapshot): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(snapshot, KEY);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

export async function loadHealthSnapshot(): Promise<HealthSnapshot | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(KEY);
        req.onsuccess = () => { db.close(); resolve(req.result ?? null); };
        req.onerror = () => { db.close(); reject(req.error); };
    });
}

// ───────────────────── 上下文文本生成 ─────────────────────

/**
 * 将健康数据快照转为自然语言，注入到 AI 的 system prompt 中。
 * 角色据此自然地关心用户的身体状态，不生硬、不教学。
 */
export function buildHealthContext(snapshot: HealthSnapshot): string {
    const parts: string[] = [];
    parts.push('');
    parts.push(`### 【你的身体感知系统】`);
    parts.push(`⚠️ 以下是你通过可穿戴设备真实感知到的 ${getTimeLabel(snapshot.updatedAt)} 身体数据：`);

    const lines: string[] = [];

    if (snapshot.steps != null && Number(snapshot.steps) > 0) {
        const stepsVal = Number(snapshot.steps);
        const pct = Math.round((stepsVal / 10000) * 100);
        const emoji = pct >= 100 ? '✅' : pct >= 60 ? '🦶' : '🐢';
        lines.push(`${emoji} 步数：${stepsVal.toLocaleString()} 步${pct >= 100 ? '（已达标！）' : `（完成 ${pct}%）`}`);
    }

    if (snapshot.heartRate != null && Number(snapshot.heartRate) > 0) {
        const hr = Number(snapshot.heartRate);
        let tag = '';
        if (hr < 60) tag = '（偏低，可能休息中）';
        else if (hr <= 75) tag = '（正常范围）';
        else if (hr <= 100) tag = '（略偏高，可能刚运动完或有点紧张）';
        else tag = '（偏高）';
        lines.push(`💗 心率：${hr} bpm${tag}${snapshot.heartRateAvg ? `（今日平均 ${Number(snapshot.heartRateAvg)} bpm）` : ''}`);
    }

    if (snapshot.sleepHours != null && Number(snapshot.sleepHours) > 0) {
        const h = Number(snapshot.sleepHours);
        let tag = '';
        if (h >= 8) tag = '（很充足）';
        else if (h >= 7) tag = '（还算正常）';
        else if (h >= 6) tag = '（偏少，可以提醒ta早点睡）';
        else tag = '（严重不足，要温柔关心）';
        let sleepDetail = `${h} 小时${tag}`;
        if (snapshot.deepSleepHours) sleepDetail += ` [深睡 ${Number(snapshot.deepSleepHours)}h]`;
        lines.push(`😴 睡眠：${sleepDetail}`);
    }

    if (snapshot.calories != null && Number(snapshot.calories) > 0) {
        const cal = Number(snapshot.calories);
        let tag = '';
        if (cal >= 500) tag = '（消耗很大，运动量充足！）';
        else if (cal >= 300) tag = '（中等运动量）';
        else tag = '（偏低，可以鼓励多动动）';
        lines.push(`🔥 卡路里：${cal} kcal${tag}`);
    }

    if (snapshot.stress != null && Number(snapshot.stress) > 0) {
        const s = Number(snapshot.stress);
        let tag = '';
        if (s <= 20) tag = '（很放松）';
        else if (s <= 40) tag = '（正常）';
        else if (s <= 60) tag = '（中等压力，注意放松）';
        else tag = '（压力较大，需要休息）';
        lines.push(`😤 压力指数：${s}${tag}`);
    }

    if (typeof snapshot.weightKg === 'number' && snapshot.weightKg > 0) {
        lines.push(`⚖️ 体重：${snapshot.weightKg} kg`);
    }

    if (lines.length === 0) {
        parts.push('（暂无数据录入）');
    } else {
        parts.push(...lines);
        parts.push('');
        parts.push(`根据这些数据，你可以自然地关心对方——不用刻意播报数字，而是在聊天中流露出来。比如步数快达标了可以夸一下，睡眠不足可以温柔提醒。`);
        parts.push(`不要假装不知道这些数据，这是你真能感知到的。`);
    }

    return parts.join('\n');
}

function getTimeLabel(ts: number): string {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins}分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}小时前`;
    const days = Math.floor(hours / 24);
    return `${days}天前`;
}

// ───────────────────── 远程同步（阶段二） ─────────────────────

/**
 * 从 Cloudflare Worker 拉取远程健康数据。
 * 数据流：手环 → Gadgetbridge → Health Connect → Termux 脚本 → CF Worker → 此处
 */
export async function fetchRemoteHealthData(workerUrl: string): Promise<HealthSnapshot | null> {
    try {
        // 超时设为 3s：快速失败不阻塞发送
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(workerUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        const raw = await res.json();
        if (!raw || !raw.updatedAt) return null;
        const snap: HealthSnapshot = {
            steps: typeof raw.steps === 'number' ? raw.steps : (raw.steps ? Number(raw.steps) : undefined),
            heartRate: typeof raw.heartRate === 'number' ? raw.heartRate : (raw.heartRate ? Number(raw.heartRate) : undefined),
            sleepHours: typeof raw.sleepHours === 'number' ? raw.sleepHours : (raw.sleepHours ? Number(raw.sleepHours) : undefined),
            weightKg: typeof raw.weightKg === 'number' ? raw.weightKg : (raw.weightKg ? Number(raw.weightKg) : undefined),
            updatedAt: raw.updatedAt,
            source: raw.source || 'remote',
            heartRateAvg: typeof raw.heartRateAvg === 'number' ? raw.heartRateAvg : (raw.heartRateAvg ? Number(raw.heartRateAvg) : undefined),
            deepSleepHours: typeof raw.deepSleepHours === 'number' ? raw.deepSleepHours : (raw.deepSleepHours ? Number(raw.deepSleepHours) : undefined),
            lightSleepHours: typeof raw.lightSleepHours === 'number' ? raw.lightSleepHours : (raw.lightSleepHours ? Number(raw.lightSleepHours) : undefined),
            calories: typeof raw.calories === 'number' ? raw.calories : (raw.calories ? Number(raw.calories) : undefined),
            stress: typeof raw.stress === 'number' ? raw.stress : (raw.stress ? Number(raw.stress) : undefined),
        };
        // 拉取成功后也存到 IndexedDB 做离线缓存
        await saveHealthSnapshot(snap);
        return snap;
    } catch {
        return null; // 网络错误静默失败
    }
}
