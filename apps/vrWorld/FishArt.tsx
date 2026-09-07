import React from 'react';
import { speciesById } from '../../utils/vrWorld/fishingMarket';
import './fishing.css';

// Code-native silhouettes. Dinosaur artwork can later replace the relic branch without touching inventory.
const PALETTES: Record<string, [string, string, string, string]> = {
    'glass-minnow': ['#d0efef', '#82b7be', '#325765', 'slim'],
    'cloud-carp': ['#ecd8b2', '#9cb6b7', '#63747b', 'carp'],
    'rain-drum': ['#a9c8e3', '#567b9d', '#294253', 'round'],
    sunneedle: ['#ffe4a2', '#d9a454', '#97673a', 'needle'],
    'moss-eel': ['#accc96', '#648978', '#294c4b', 'eel'],
    'thunder-ray': ['#bbc2f2', '#6576ad', '#38385e', 'ray'],
    'snow-lantern': ['#f1f5f6', '#b4d6e4', '#6797b5', 'round'],
    'moon-envelope': ['#e2d7f2', '#aca9d5', '#626286', 'angel'],
    'static-whale': ['#c2d4dd', '#8aa6ba', '#435d76', 'whale'],
};

export const FishArt: React.FC<{ speciesId: string; size?: number; silhouette?: boolean; animated?: boolean }> = ({ speciesId, size = 112, silhouette, animated = false }) => {
    const f = speciesById(speciesId);
    const palette = PALETTES[speciesId];
    if (!palette) return (
        <span className={`fish-relic ${silhouette ? 'is-unknown' : ''}`} style={{ width: size, height: size * .65 }} role="img" aria-label={silhouette ? '尚未发现的时层漂流物' : `${f?.name || '时层漂流物'}图像待收录`}>
            <span className="fish-relic-orbit" /><span className="fish-relic-stone">{silhouette ? '?' : f?.icon || '◇'}</span>
            {!silhouette && <span className="fish-relic-caption">时层标本</span>}
        </span>
    );
    const [light, mid, dark, shape] = palette;
    return (
        <span role="img" aria-label={silhouette ? '尚未发现的鱼影' : f!.name}
            className={`fish-art fish-art--${shape} ${silhouette ? 'is-unknown' : ''} ${animated ? 'is-swimming' : ''}`}
            style={{ width: size, height: size * .65, '--fish-light': light, '--fish-mid': mid, '--fish-dark': dark } as React.CSSProperties}>
            <span className="fish-tail" /><span className="fish-dorsal" /><span className="fish-belly-fin" />
            <span className="fish-body"><span className="fish-scales" /><span className="fish-gill" /><span className="fish-side-fin" /><span className="fish-eye" /></span>
            {speciesId === 'snow-lantern' && <span className="fish-lantern" />}
        </span>
    );
};
