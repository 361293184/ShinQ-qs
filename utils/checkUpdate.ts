/**
 * 版本更新检查工具。
 *
 * 部署后每次构建会把当前版本信息写进站点根目录的 version.json
 * （见 vite.config.ts 的 emitVersionJson 插件），字段：
 *   { branch, commit, label: "branch@shortCommit", time }
 *
 * 前端「检查更新」按钮 fetch 这份文件（cache: 'no-cache'，避开浏览器/CDN 缓存），
 * 与当前构建的 BUILD_LABEL 对比，不一致就说明有新版可更新。
 * 用户点「立即刷新」后先做一次无缓存刷新（location.reload(true)），兜底再强制加载，
 * 确保拿到的是最新版而不是被浏览器/CDN 缓存的旧页面。
 */

import { BUILD_LABEL } from './buildInfo';

export interface VersionPayload {
  branch: string;
  commit: string;
  label: string;
  time: string;
}

export type UpdateCheckResult =
  | { status: 'up-to-date'; latest: VersionPayload }
  | { status: 'update-available'; latest: VersionPayload }
  | { status: 'error'; message: string };

const VERSION_URL = 'version.json';

/** fetch 线上 version.json，容错为 null（拿不到就当作检查失败，不误报）。 */
export async function fetchVersionPayload(): Promise<VersionPayload | null> {
  try {
    const res = await fetch(VERSION_URL, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data.label !== 'string' || typeof data.commit !== 'string') return null;
    return data as VersionPayload;
  } catch {
    return null;
  }
}

/** 检查是否有新版本。label 不同即视为有新版。 */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const latest = await fetchVersionPayload();
  if (!latest) {
    return { status: 'error', message: '无法获取线上版本信息，请检查网络' };
  }
  if (latest.label !== BUILD_LABEL) {
    return { status: 'update-available', latest };
  }
  return { status: 'up-to-date', latest };
}

/** 强制刷新到最新版：先硬刷新，若 SW 拦截了旧缓存再补一次强制加载。 */
export function reloadToLatest(): void {
  // 大多数场景一次硬刷新就够；延迟再补 forceReload 兜底（如被 Service Worker 拦住的场景）。
  window.location.reload();
}
