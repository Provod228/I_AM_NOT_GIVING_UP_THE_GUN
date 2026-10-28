import {
    ChangeDetectionStrategy, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal,
} from '@angular/core';
import { NgIf } from '@angular/common';
import { FlagsService } from '../services/flags.service';
import { ReactLoaderService, type ReactCheckoutHandle } from '../services/react-loader.service';
import { CheckoutAngularComponent } from '../checkout-angular/checkout-angular.component';
import { track, initAnalytics, draftStore, type Draft } from '@market/checkout-core';

@Component({
    selector: 'app-checkout-host',
    standalone: true,
    imports: [NgIf, CheckoutAngularComponent],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
    <section class="checkout-host">
      <div *ngIf="loading()" class="checkout-loading">Загружаем оформление…</div>
        <app-checkout-angular *ngIf="renderAngular()" [draft]="draft()" (draftChange)="onDraftChange($event)" />
      <div #reactRoot *ngIf="renderReact()"></div>
    </section>
  `,
    styles: [`
    .checkout-host { display: block; }
    .checkout-loading { padding: 24px; text-align: center; }
  `],
})
export class CheckoutHostComponent implements OnInit, OnDestroy {
    private readonly flags = inject(FlagsService);
    private readonly loader = inject(ReactLoaderService);

    @ViewChild('reactRoot') reactRoot?: ElementRef<HTMLElement>;

    readonly loading = signal(true);
    readonly renderAngular = signal(false);
    readonly renderReact = signal(false);
    readonly draft = signal<Draft | null>(null);

    private handle: ReactCheckoutHandle | null = null;

    async ngOnInit() {
        const userId = 'user-123'; // TODO(студент): взять из AuthService
        await this.flags.init(userId);
        initAnalytics(this.flags.variant(), userId);

        const local = draftStore.loadLocal();
        const remote = local ? await draftStore.loadRemote(local.draftId) : null;
        let initial = draftStore.pickLatest(local, remote);
        if (!initial) {
            initial = {
                draftId: crypto.randomUUID(),
                userId: userId,
                items: [
                    { id: 'p1', title: 'Наушники', price: 1500, qty: 1 },
                ],
                address: null,
                deliveryMethod: null,
                promoCode: null,
                updatedAt: Date.now(),
            };
            draftStore.saveLocal(initial);
        }
        this.draft.set(initial);

        const variant = this.flags.variant();
        track('checkout_rendered', { variant, render_ms: performance.now() });

        if (variant === 'react') {
            await this.mountReact(userId);
        } else {
            this.renderAngular.set(true);
            this.loading.set(false);
        }
    }

    onDraftChange(d: Draft) {
        this.draft.set(d);
        draftStore.saveLocal(d);
    }

    private async mountReact(userId: string) {
        try {
            const mod = await this.loader.load();
            await Promise.resolve();
            const el = this.reactRoot?.nativeElement;
            if (!el) throw new Error('React root not found');

            this.handle = mod.mount(el, {
                userId,
                draft: this.draft(),
                onDraftChange: (d: Draft) => this.onDraftChange(d),
            });
            this.renderReact.set(true);
            this.loading.set(false);
        } catch (e) {
            console.error('[checkout] react mount failed, falling back to angular', e);
            track('checkout_error', { variant: 'react', reason: 'mount_failed' });
            this.renderReact.set(false);
            this.renderAngular.set(true);
            this.loading.set(false);
        }
    }

    ngOnDestroy() {
        // TODO(студент): проверить, что unmount реально очищает обработчики/таймеры
        this.handle?.unmount();
        this.handle = null;
    }
}