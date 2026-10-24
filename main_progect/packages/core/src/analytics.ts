import type { AnalyticsEvent, CheckoutVariant } from './types';

let currentVariant: CheckoutVariant = 'angular';
let currentUserId = 'anonymous';

export function initAnalytics(variant: CheckoutVariant, userId: string) {
    currentVariant = variant;
    currentUserId = userId;
}

export function track(name: string, props?: Record<string, unknown>) {
    const event: AnalyticsEvent = { name, variant: currentVariant, userId: currentUserId, ts: Date.now(), props };
    void fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
        keepalive: true,
    }).catch(() => {});
}