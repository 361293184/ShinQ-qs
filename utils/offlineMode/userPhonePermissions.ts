/**
 * 「给他看什么」——用户手机的权限（方案 §5.26 F / J）。
 *
 * 三个关键点，别搞反：
 * 1. **权限只约束角色，不约束你自己。** 你打开自己的手机时永远看到全部；
 *    开关的作用是「他拿走你的手机之后，哪些内容会成为他的已知事实」（§5.26 G）。
 * 2. **手机易手 ≠ 给内容。** 关掉的 App 他点不进去，他会通过"打不开"来感知（§4.1）。
 * 3. **事前配好，不临场问。** 设置只在这里配一次，角色要看时直接按它执行（§5.26 J ④）。
 *
 * 存储按角色分开：同一个开关对不同角色各自生效（他跟你的关系不一样，边界也不该一样）。
 */

export type UserPhonePermissionKey = 'others' | 'groups' | 'gallery' | 'music';

export interface UserPhonePermissions {
    /** 你和其他角色的私聊（最敏感，默认关） */
    others: boolean;
    /** 群聊 */
    groups: boolean;
    /** 相册（默认关） */
    gallery: boolean;
    /** 音乐 */
    music: boolean;
}

export const DEFAULT_USER_PHONE_PERMISSIONS: UserPhonePermissions = {
    others: false,
    groups: true,
    gallery: false,
    music: true,
};

export interface UserPhonePermissionItem {
    key: UserPhonePermissionKey | 'withHim';
    label: string;
    desc: string;
    /** 锁死的项（你和他的对话永远可见） */
    locked?: boolean;
    /** 提示这一项最敏感 */
    sensitive?: boolean;
}

/** 设置面板的条目顺序 = §5.26 J ③ 的表格顺序 */
export const USER_PHONE_PERMISSION_ITEMS: UserPhonePermissionItem[] = [
    {
        key: 'withHim',
        label: '你和他的对话',
        desc: '那是你们俩的，不存在"给不给看"',
        locked: true,
    },
    {
        key: 'others',
        label: '你和其他人的对话',
        desc: '你和别的角色的私聊。他翻到这些，是另一场戏',
        sensitive: true,
    },
    {
        key: 'groups',
        label: '群聊',
        desc: '你在的那些群，以及群里的发言',
    },
    {
        key: 'gallery',
        label: '相册',
        desc: '你相册里的真实照片。关掉之后他会发现打不开',
    },
    {
        key: 'music',
        label: '音乐',
        desc: '你在听什么、最近播放、一起听',
    },
];

const KEY_PREFIX = 'os_user_phone_permissions_';
const EVENT = 'os-user-phone-permissions';

const keyFor = (charId: string) => `${KEY_PREFIX}${charId || 'default'}`;

export const readUserPhonePermissions = (charId: string): UserPhonePermissions => {
    try {
        const raw = localStorage.getItem(keyFor(charId));
        if (!raw) return { ...DEFAULT_USER_PHONE_PERMISSIONS };
        const parsed = JSON.parse(raw) as Partial<UserPhonePermissions>;
        return {
            others: typeof parsed?.others === 'boolean' ? parsed.others : DEFAULT_USER_PHONE_PERMISSIONS.others,
            groups: typeof parsed?.groups === 'boolean' ? parsed.groups : DEFAULT_USER_PHONE_PERMISSIONS.groups,
            gallery: typeof parsed?.gallery === 'boolean' ? parsed.gallery : DEFAULT_USER_PHONE_PERMISSIONS.gallery,
            music: typeof parsed?.music === 'boolean' ? parsed.music : DEFAULT_USER_PHONE_PERMISSIONS.music,
        };
    } catch {
        return { ...DEFAULT_USER_PHONE_PERMISSIONS };
    }
};

export const writeUserPhonePermissions = (charId: string, next: UserPhonePermissions): void => {
    try {
        localStorage.setItem(keyFor(charId), JSON.stringify(next));
        window.dispatchEvent(new CustomEvent(EVENT, { detail: { charId } }));
    } catch { /* 存不下不影响本次会话 */ }
};

/** 只改一项 */
export const patchUserPhonePermission = (
    charId: string,
    key: UserPhonePermissionKey,
    value: boolean,
): UserPhonePermissions => {
    const next = { ...readUserPhonePermissions(charId), [key]: value };
    writeUserPhonePermissions(charId, next);
    return next;
};

/** 订阅变化（本地写入 + 其他标签页写入都会通知） */
export const subscribeUserPhonePermissions = (
    listener: (charId: string, permissions: UserPhonePermissions) => void,
): (() => void) => {
    const onLocal = (event: Event) => {
        const detail = (event as CustomEvent<{ charId?: string }>).detail;
        const charId = detail?.charId || '';
        listener(charId, readUserPhonePermissions(charId));
    };
    const onStorage = (event: StorageEvent) => {
        if (!event.key || !event.key.startsWith(KEY_PREFIX)) return;
        const charId = event.key.slice(KEY_PREFIX.length);
        listener(charId, readUserPhonePermissions(charId));
    };
    window.addEventListener(EVENT, onLocal);
    window.addEventListener('storage', onStorage);
    return () => {
        window.removeEventListener(EVENT, onLocal);
        window.removeEventListener('storage', onStorage);
    };
};
