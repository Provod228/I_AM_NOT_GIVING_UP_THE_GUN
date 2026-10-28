import {ChangeDetectionStrategy, Component, Input, Output, EventEmitter, signal} from '@angular/core';
import {CurrencyPipe, NgIf, NgFor} from '@angular/common';
import {
    api,
    calcGrandTotal,
    DELIVERY_OPTIONS,
    validateAddress,
    type Draft,
    type Address,
    track
} from '@market/checkout-core';


@Component({
    selector: 'app-checkout-angular',
    standalone: true,
    imports: [NgIf, NgFor, CurrencyPipe],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="checkout checkout-angular">
            <h2>Оформление заказа (Angular)</h2>
            <ul class="cart">
                <li *ngFor="let item of draft?.items">
                    {{ item.title }} × {{ item.qty }} — {{ item.price * item.qty | currency: 'RUB' }}
                </li>
            </ul>
            <label>
                Промокод:
                <input [value]="draft?.promoCode ?? ''" (input)="onPromo($event)"/>
            </label>
            <fieldset>
                <legend>Доставка</legend>
                <label *ngFor="let d of deliveryOptions">
                    <input type="radio" name="delivery" [value]="d.id"
                           [checked]="draft?.deliveryMethod === d.id" (change)="onDelivery(d.id)"/>
                    {{ d.title }} — {{ d.price | currency: 'RUB' }}
                </label>
            </fieldset>
            <fieldset>
                <legend>Адрес</legend>
                <input placeholder="Страна"
                       [value]="draft?.address?.country ?? ''"
                       (input)="onAddress('country', $event)"/>
                <input placeholder="Город"
                       [value]="draft?.address?.city ?? ''"
                       (input)="onAddress('city', $event)"/>
                <input placeholder="Улица"
                       [value]="draft?.address?.street ?? ''"
                       (input)="onAddress('street', $event)"/>
                <input placeholder="Индекс"
                       [value]="draft?.address?.zip ?? ''"
                       (input)="onAddress('zip', $event)"/>
            </fieldset>
            <p class="total">Итого: {{ total() | currency: 'RUB' }}</p>
            <p class="errors" *ngIf="errors().length">
                <span *ngFor="let e of errors()">{{ e }}<br/></span>
            </p>
            <button [disabled]="errors().length > 0 || submitting()" (click)="onSubmit()">
                {{ submitting() ? 'Отправляем…' : 'Оформить заказ' }}
            </button>
            <p *ngIf="orderId()">Заказ {{ orderId() }} оформлен!</p>
            <p class="errors" *ngIf="submitError()">{{ submitError() }}</p>
        </div>
    `,
    styles: [`
        .checkout {
            padding: 16px;
        }

        .checkout-angular {
            border: 2px dashed #c00;
        }

        .errors {
            color: #c00;
        }
    `],
})

export class CheckoutAngularComponent {
    @Input() draft: Draft | null = null;
    @Output() draftChange = new EventEmitter<Draft>();
    readonly deliveryOptions = DELIVERY_OPTIONS;
    readonly orderId = signal<string | null>(null);
    readonly submitError = signal<string | null>(null);
    readonly submitting = signal(false);

    total(): number {
        if (!this.draft) return 0;
        return calcGrandTotal(this.draft.items, this.draft.deliveryMethod, this.draft.promoCode);
    }

    errors(): string[] {
        return validateAddress(this.draft?.address ?? null);
    }

    onPromo(e: Event) {
        if (!this.draft) return;
        const value = (e.target as HTMLInputElement).value;
        const next = {...this.draft, promoCode: value, updatedAt: Date.now()};
        this.draft = next;
        this.draftChange.emit(next);
    }

    onAddress(field: keyof Address, e: Event) {
        if (!this.draft) return;
        const value = (e.target as HTMLInputElement).value;
        const current = this.draft.address ?? {country: '', city: '', street: '', zip: ''};
        const next = {...this.draft, address: {...current, [field]: value}, updatedAt: Date.now()};

        const wasValid = validateAddress(this.draft.address).length === 0;
        const isValid = validateAddress(next.address).length === 0;

        this.draft = next;
        this.draftChange.emit(next);
        if (!wasValid && isValid) track('checkout_step_completed', { step: 'address' });
    }

    onDelivery(id: Draft['deliveryMethod']) {
        if (!this.draft) return;
        const next = {...this.draft, deliveryMethod: id, updatedAt: Date.now()};
        this.draft = next;
        this.draftChange.emit(next);
        track('checkout_step_completed', { step: 'delivery' });
    }

    async onSubmit() {
        if (!this.draft || this.submitting()) return;   // ← изменено
        this.submitting.set(true);                      // ← добавлено
        this.submitError.set(null);
        try {
            const key = `order-${this.draft.draftId}-${this.draft.updatedAt}`;
            const { orderId } = await api.submitOrder(this.draft.draftId, key);
            this.orderId.set(orderId);
            track('checkout_converted', { orderId });
        } catch {
            this.submitError.set('Не удалось оформить заказ, попробуйте ещё раз');
            track('checkout_error', { reason: 'submit_failed' });
        } finally {                                     // ← добавлено
            this.submitting.set(false);
        }
    }
}