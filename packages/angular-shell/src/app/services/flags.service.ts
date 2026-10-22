import { Injectable, signal } from '@angular/core';
import { loadFlags, resolveVariant, type FlagsConfig, type CheckoutVariant } from '@market/checkout-core';

@Injectable({ providedIn: 'root' })
export class FlagsService {
    readonly config = signal<FlagsConfig>({ checkout: 'angular', reactPercent: 0, killSwitch: false });
    readonly variant = signal<CheckoutVariant>('angular');

    async init(userId: string) {
        const cfg = await loadFlags();
        this.config.set(cfg);
        this.variant.set(resolveVariant(userId, cfg));
    }

    /** Для kill switch: перечитать флаги без перезагрузки страницы */
    async refresh(userId: string) { await this.init(userId); }
}