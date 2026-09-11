import type { FamiliarityScene } from './types';

/** Temporary local testing access. Production builds keep the normal collection locks. */
export const canPreviewFamiliarityEvent = (scene: FamiliarityScene | undefined) =>
    import.meta.env.DEV && scene?.kind === 'event';
