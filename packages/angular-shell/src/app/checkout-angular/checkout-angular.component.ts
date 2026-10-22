import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CurrencyPipe, NgIf, NgFor } from '@angular/common';
import { calcGrandTotal, DELIVERY_OPTIONS, validateAddress, type Draft } from '@market/checkout-core';

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
        <input [value]="draft?.promoCode ?? ''" (input)="onPromo($event)" />
      </label>
      <fieldset>
        <legend>Доставка</legend>
        <label *ngFor="let d of deliveryOptions">
          <input type="radio" name="delivery" [value]="d.id"
                 [checked]="draft?.deliveryMethod === d.id" (change)="onDelivery(d.id)" />
          {{ d.title }} — {{ d.price | currency: 'RUB' }}
        </label>
      </fieldset>
      <p class="total">Итого: {{ total() | currency: 'RUB' }}</p>
      <p class="errors" *ngIf="errors().length">
        <span *ngFor="let e of errors()">{{ e }}<br /></span>
      </p>
      <button [disabled]="errors().length > 0">Оформить заказ</button>
    </div>
  `,
    styles: [`
    .checkout { padding: 16px; }
    .checkout-angular { border: 2px dashed #c00; }
    .errors { color: #c00; }
  `],
})
export class CheckoutAngularComponent {
    @Input() draft: Draft | null = null;
    readonly deliveryOptions = DELIVERY_OPTIONS;

    total(): number {
        if (!this.draft) return 0;
        return calcGrandTotal(this.draft.items, this.draft.deliveryMethod, this.draft.promoCode);
    }
    errors(): string[] { return validateAddress(this.draft?.address ?? null); }
    onPromo(e: Event) {
        // TODO(студент): единое обновление draft через core, синхронизация с React-версией
        const value = (e.target as HTMLInputElement).value;
        if (this.draft) this.draft = { ...this.draft, promoCode: value, updatedAt: Date.now() };
    }
    onDelivery(id: Draft['deliveryMethod']) {
        if (this.draft) this.draft = { ...this.draft, deliveryMethod: id, updatedAt: Date.now() };
    }
}