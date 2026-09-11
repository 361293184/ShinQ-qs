import type { CharacterProfile } from '../../types';
import { allowsAutomaticVR } from './participation';

export const MARKET_LLM_ENABLED_KEY = 'vr_sar_board_llm_enabled_v1';
export function readMarketLLMEnabled(): boolean {
    try { return localStorage.getItem(MARKET_LLM_ENABLED_KEY) === 'true'; }
    catch { return false; }
}
export function setMarketLLMEnabled(enabled: boolean): void {
    localStorage.setItem(MARKET_LLM_ENABLED_KEY, String(enabled));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('vr-sar-board-settings'));
}

/** Only free-roaming participants can be encountered by chance. Manual invitations stay explicit. */
export function rollMarketVisitor(characters: CharacterProfile[], allowLLM: boolean, random = Math.random): CharacterProfile | null {
    if (!allowLLM) return null;
    const roaming = characters.filter(char => allowsAutomaticVR(char.vrState));
    if (!roaming.length || random() < .5) return null;
    return roaming[Math.floor(random() * roaming.length)];
}
