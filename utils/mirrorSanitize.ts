/**
 * localStorage 镜像数组的脏数据清洗。
 *
 * 番外收藏 / 来信收藏这两份镜像是"IndexedDB 丢了还能捞回来"的兜底，读写逻辑都写成
 * `mirror.filter(x => x.id !== ...)` / `store.put(x)`。一旦数组里混进 null（旧版本写入、
 * 手工导入的备份、JSON 里带空洞都会产生），访问 `null.id` 直接抛 TypeError，
 * 于是镜像既写不回去也修不好——表现为每次保存都报一次错，但 IndexedDB 主存储其实是成功的。
 *
 * 统一在读写镜像前过一遍这个函数，脏条目直接丢弃，下一次写入即可把镜像自动修复。
 */
export function sanitizeMirrorList<T extends { id?: unknown }>(arr: unknown): T[] {
    if (!Array.isArray(arr)) return [];
    return arr.filter((item): item is T =>
        !!item
        && typeof item === 'object'
        && typeof (item as T).id === 'string'
        && ((item as T).id as string).length > 0);
}
