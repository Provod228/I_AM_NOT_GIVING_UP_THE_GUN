import type { CheckoutVariant } from './types';

export interface FlagsConfig {
    checkout: 'angular' | 'react' | 'split';
    reactPercent: number;   // 0..100 при split
    killSwitch: boolean;    // true -> всегда angular
}

// FNV-1a: стабильный хэш userId -> [0, 100)
export function hashToPercent(userId: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < userId.length; i++) {
        h ^= userId.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) % 100;
}

export function resolveVariant(userId: string, cfg: FlagsConfig): CheckoutVariant {
    if (cfg.killSwitch) return 'angular';
    if (cfg.checkout === 'angular') return 'angular';
    if (cfg.checkout === 'react') return 'react';
    return hashToPercent(userId) < cfg.reactPercent ? 'react' : 'angular';
}

export async function loadFlags(): Promise<FlagsConfig> {
    const res = await fetch('/api/flags', { credentials: 'include' });
    if (!res.ok) return { checkout: 'angular', reactPercent: 0, killSwitch: false };
    return res.json();
}