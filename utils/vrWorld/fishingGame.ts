export type FishingPhase = 'idle' | 'waiting' | 'hooked' | 'caught' | 'escaped';
export interface FishingGameState {
    phase: FishingPhase; held: boolean; elapsed: number; playerAngle: number; playerVelocity: number;
    fishAngle: number; progress: number; difficulty: number; assist: boolean;
}
export const createFishingGame = (difficulty = .3, assist = false): FishingGameState => ({
    phase: 'idle', held: false, elapsed: 0, playerAngle: -.7, playerVelocity: 0, fishAngle: -.35, progress: .18, difficulty, assist,
});
export const angleDifference = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const fishingArcWidth = (s: FishingGameState) => s.assist ? .92 : .6 - s.difficulty * .15;
/** Frame-rate independent fixed-step engine. Catch rarity is rolled before the cast, not after a win. */
export const stepFishingGame = (s: FishingGameState, dt: number): void => {
    if (s.phase !== 'waiting' && s.phase !== 'hooked') return;
    s.elapsed += dt;
    if (s.phase === 'waiting') {
        if (s.elapsed >= 1) { s.phase = 'hooked'; s.elapsed = 0; }
        return;
    }
    const speed = s.assist ? .65 : 1;
    const d = s.difficulty;
    s.playerVelocity += ((s.held ? 1.65 : -1.65) - s.playerVelocity) * Math.min(1, dt * 7);
    s.playerAngle = angleDifference(s.playerAngle + s.playerVelocity * dt * speed, 0);
    s.fishAngle = -.35 + Math.sin(s.elapsed * (.55 + d * .5) * speed) * (1 + d)
        + Math.sin(s.elapsed * (1.1 + d) * speed) * .25;
    const aligned = Math.abs(angleDifference(s.playerAngle, s.fishAngle)) <= fishingArcWidth(s);
    s.progress = Math.max(0, Math.min(1, s.progress + dt * (aligned ? .19 : s.assist ? -.025 : -.08)));
    if (s.progress >= 1) s.phase = 'caught';
    else if (s.elapsed > 32 || (s.elapsed > 5 && s.progress <= 0)) s.phase = 'escaped';
};
