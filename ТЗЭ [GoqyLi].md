# ТЗ 2 (комплексное): Миграция «Оформления заказа» с Angular на React под трафиком


---

# ЧАСТЬ I. Учебный каркас

## 0. Что это и зачем

Вам выдан репозиторий `market-checkout/` — **рабочее гибридное приложение** (Angular-оболочка + текущий Angular checkout + заготовка React-версии + общее фреймворк-агностичное ядро + мок-API). Это **стартовая точка**, а не готовое решение: каркас намеренно оставляет «дыры» (помечены `TODO(студент)`) ровно в тех местах, которые проверяет ТЗ. Ваша задача — довести приложение до требований Части II.

Каркас нужен, чтобы вы не тратили экзаменационное время на бойлерплейт (сборка, роутинг, мок-сервер, типы) и занимались **инженерным изменением**: архитектурой миграции, флагами, A/B, fallback, сохранением состояния, аналитикой, обратимостью.

## 1. Стек и допущения

- **Angular 17** (standalone, signals, `provideHttpClient`), текущий checkout — Angular-компонент.
- **React 18 + Vite** (library mode, ESM) для React-версии checkout.
- **Общее ядро** `@market/checkout-core` — чистый TypeScript, без зависимостей от фреймворков.
- **Мок-сервер** на Express: API черновиков/заказов с `Idempotency-Key`, флаги, приём аналитики.
- Интеграция React в Angular — **ручной `mount/unmount`** через контейнер (Module Federation не обязателен; если выберете его — обоснуйте в записке).

> Это учебный каркас, а не продакшн. Он не претендует на оптимальность; ваши решения и обоснования важнее «идеального» кода.

## 2. Структура репозитория

```
market-checkout/
├── package.json                     # workspaces: core, angular-shell, react-checkout, mock-server
├── tsconfig.base.json
├── packages/
│   ├── core/                        # @market/checkout-core — фреймворк-агностичное ядро
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── types.ts
│   │       ├── draftStore.ts        # черновик заказа (localStorage + API)
│   │       ├── pricing.ts           # расчёт доставки/промокодов (единая логика)
│   │       ├── validation.ts        # валидация адреса/полей
│   │       ├── analytics.ts         # единая схема событий с variant
│   │       ├── flags.ts             # feature flags + детерминированный A/B
│   │       └── api.ts               # типизированный API-клиент
│   ├── angular-shell/               # Angular-оболочка + текущий Angular checkout
│   │   ├── package.json
│   │   ├── angular.json
│   │   ├── proxy.conf.json
│   │   └── src/
│   │       ├── main.ts
│   │       ├── index.html           # importmap для React (вариант A)
│   │       ├── styles.css
│   │       └── app/
│   │           ├── app.component.ts
│   │           ├── app.config.ts
│   │           ├── app.routes.ts
│   │           ├── checkout-angular/
│   │           │   └── checkout-angular.component.ts
│   │           ├── checkout-host/
│   │           │   └── checkout-host.component.ts   # точка монтирования React + fallback
│   │           ├── services/
│   │           │   ├── flags.service.ts
│   │           │   └── react-loader.service.ts
│   │           └── shell/
│   │               ├── header.component.ts
│   │               └── footer.component.ts
│   └── react-checkout/              # React-версия checkout (Vite, library build)
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── index.html               # dev-песочница
│       └── src/
│           ├── mount.tsx            # export mount/unmount — контракт с оболочкой
│           ├── CheckoutApp.tsx
│           ├── components/
│           │   ├── CartStep.tsx
│           │   ├── AddressStep.tsx
│           │   └── PaymentStep.tsx
│           └── styles.css
└── mock-server/
    ├── package.json
    └── server.ts                    # Express: API + флаги + аналитика
```

## 3. Контракт между оболочкой и React-версией

React-бандл экспортирует `mount(el, props) => { unmount }`:

```ts
// react-checkout/src/mount.tsx
export interface MountProps {
  userId: string;
  draft: Draft | null;
  onDraftChange: (d: Draft) => void;
}
export interface Handle { unmount: () => void; }
export function mount(el: HTMLElement, props: MountProps): Handle;
```

Оболочка (`CheckoutHostComponent`) решает, какую версию показать, монтирует React или рендерит Angular, и **обязана** вызывать `unmount()` при уничтожении, чтобы не было утечек.

## 4. Код каркаса

### 4.1. Общее ядро `@market/checkout-core`

**`packages/core/src/types.ts`**

```ts
export type CheckoutVariant = 'angular' | 'react';

export interface CartItem { id: string; title: string; price: number; qty: number; }
export interface Address { country: string; city: string; street: string; zip: string; }

export interface Draft {
  draftId: string;
  userId: string;
  items: CartItem[];
  address: Address | null;
  deliveryMethod: 'courier' | 'pickup' | null;
  promoCode: string | null;
  updatedAt: number;
}

export interface DeliveryOption {
  id: 'courier' | 'pickup';
  title: string;
  price: number;
  etaDays: number;
}

export interface AnalyticsEvent {
  name: string;
  variant: CheckoutVariant;
  userId: string;
  ts: number;
  props?: Record<string, unknown>;
}
```

**`packages/core/src/flags.ts`** — детерминированный A/B + kill switch

```ts
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
```

**`packages/core/src/draftStore.ts`** — сохранение черновика между версиями

```ts
import type { Draft } from './types';
import { api } from './api';

const KEY = 'market.checkout.draft.v1';

export const draftStore = {
  loadLocal(): Draft | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Draft) : null;
    } catch { return null; }
  },
  saveLocal(draft: Draft) { localStorage.setItem(KEY, JSON.stringify(draft)); },
  async loadRemote(draftId: string): Promise<Draft | null> {
    try { return await api.getDraft(draftId); } catch { return null; }
  },
  pickLatest(a: Draft | null, b: Draft | null): Draft | null {
    if (!a) return b;
    if (!b) return a;
    return a.updatedAt >= b.updatedAt ? a : b;
  },
};
```

**`packages/core/src/pricing.ts`** — единая бизнес-логика

```ts
import type { CartItem, DeliveryOption } from './types';

export const DELIVERY_OPTIONS: DeliveryOption[] = [
  { id: 'courier', title: 'Курьер', price: 300, etaDays: 2 },
  { id: 'pickup', title: 'Самовывоз', price: 0, etaDays: 1 },
];

export function calcItemsTotal(items: CartItem[]): number {
  return items.reduce((s, i) => s + i.price * i.qty, 0);
}

export function applyPromo(total: number, promo: string | null): number {
  if (!promo) return total;
  if (promo.trim().toUpperCase() === 'SAVE10') return Math.round(total * 0.9);
  return total;
}

export function calcGrandTotal(
  items: CartItem[],
  deliveryId: DeliveryOption['id'] | null,
  promo: string | null,
): number {
  const withPromo = applyPromo(calcItemsTotal(items), promo);
  const delivery = DELIVERY_OPTIONS.find((d) => d.id === deliveryId)?.price ?? 0;
  return withPromo + delivery;
}
```

**`packages/core/src/validation.ts`**

```ts
import type { Address } from './types';

export function validateAddress(a: Partial<Address> | null): string[] {
  const errors: string[] = [];
  if (!a) return ['Адрес не заполнен'];
  if (!a.country?.trim()) errors.push('Укажите страну');
  if (!a.city?.trim()) errors.push('Укажите город');
  if (!a.street?.trim()) errors.push('Укажите улицу');
  if (!a.zip?.trim() || !/^\d{5,6}$/.test(a.zip)) errors.push('Некорректный индекс');
  return errors;
}
```

**`packages/core/src/analytics.ts`** — единая схема событий с `variant`

```ts
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
```

**`packages/core/src/api.ts`**

```ts
import type { Draft } from './types';

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  async getDraft(draftId: string): Promise<Draft | null> {
    const res = await fetch(`/api/drafts/${draftId}`, { credentials: 'include' });
    if (res.status === 404) return null;
    return json<Draft>(res);
  },
  async saveDraft(draft: Draft, idempotencyKey: string): Promise<Draft> {
    const res = await fetch(`/api/drafts/${draft.draftId}`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(draft),
    });
    return json<Draft>(res);
  },
  async submitOrder(draftId: string, idempotencyKey: string): Promise<{ orderId: string }> {
    const res = await fetch(`/api/orders`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ draftId }),
    });
    return json<{ orderId: string }>(res);
  },
};
```

**`packages/core/src/index.ts`**

```ts
export * from './types';
export * from './flags';
export * from './draftStore';
export * from './pricing';
export * from './validation';
export * from './analytics';
export * from './api';
```

### 4.2. Angular-оболочка `angular-shell`

**`src/app/app.config.ts`**

```ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch()),
  ],
};
```

**`src/app/app.routes.ts`**

```ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'checkout', pathMatch: 'full' },
  {
    path: 'checkout',
    loadComponent: () =>
      import('./checkout-host/checkout-host.component').then((m) => m.CheckoutHostComponent),
  },
];
```

**`src/app/services/flags.service.ts`**

```ts
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
```

**`src/app/services/react-loader.service.ts`** — загрузка React-бандла с fallback

```ts
import { Injectable } from '@angular/core';

export interface ReactCheckoutHandle { unmount: () => void; }
export interface ReactCheckoutModule {
  mount: (el: HTMLElement, props: Record<string, unknown>) => ReactCheckoutHandle;
}

@Injectable({ providedIn: 'root' })
export class ReactLoaderService {
  private loading: Promise<ReactCheckoutModule> | null = null;

  load(): Promise<ReactCheckoutModule> {
    if (!this.loading) {
      this.loading = import(/* @vite-ignore */ '/react-checkout/react-checkout.js')
        .then((m: ReactCheckoutModule) => m)
        .catch((err) => {
          // TODO(студент): залогировать инцидент через analytics.track('react_chunk_load_error')
          this.loading = null;
          throw err;
        });
    }
    return this.loading;
  }
}
```

**`src/app/checkout-host/checkout-host.component.ts`** — точка принятия решения

```ts
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
      <app-checkout-angular *ngIf="renderAngular()" [draft]="draft()" />
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
    this.draft.set(draftStore.pickLatest(local, remote));

    const variant = this.flags.variant();
    track('checkout_rendered', { variant, render_ms: performance.now() });

    if (variant === 'react') {
      await this.mountReact(userId);
    } else {
      this.renderAngular.set(true);
      this.loading.set(false);
    }
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
        onDraftChange: (d: Draft) => { this.draft.set(d); draftStore.saveLocal(d); },
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
```

**`src/app/checkout-angular/checkout-angular.component.ts`** — старая версия (упрощённая)

```ts
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
```

**`src/app/app.component.ts`**

```ts
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HeaderComponent } from './shell/header.component';
import { FooterComponent } from './shell/footer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-header />
    <main class="shell-main"><router-outlet /></main>
    <app-footer />
  `,
})
export class AppComponent {}
```

**`src/app/shell/header.component.ts`**

```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-header',
  standalone: true,
  template: `
    <header class="shell-header">
      <strong>Market</strong>
      <nav><a href="/checkout">Оформление</a></nav>
    </header>
  `,
  styles: [`
    .shell-header { display: flex; justify-content: space-between; align-items: center;
                    padding: 12px 24px; background: #111; color: #fff; }
    .shell-header a { color: #fff; }
  `],
})
export class HeaderComponent {}
```

**`src/app/shell/footer.component.ts`**

```ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-footer',
  standalone: true,
  template: `<footer class="shell-footer">© Market, 2026</footer>`,
  styles: [`.shell-footer { padding: 16px 24px; border-top: 1px solid #eee; color: #666; }`],
})
export class FooterComponent {}
```

### 4.3. React-версия `react-checkout`

**`vite.config.ts`** — library mode, ESM

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/mount.tsx'),
      name: 'ReactCheckout',
      formats: ['es'],
      fileName: () => 'react-checkout.js',
    },
    rollupOptions: {
      // React не бандлим — подключается оболочкой через importmap
      external: ['react', 'react-dom', 'react-dom/client'],
    },
    outDir: '../angular-shell/public/react-checkout',
    emptyOutDir: true,
  },
});
```

**`src/mount.tsx`** — контракт с оболочкой

```tsx
import { createRoot, type Root } from 'react-dom/client';
import { CheckoutApp } from './CheckoutApp';
import type { Draft } from '@market/checkout-core';

export interface MountProps {
  userId: string;
  draft: Draft | null;
  onDraftChange: (d: Draft) => void;
}
export interface Handle { unmount: () => void; }

export function mount(el: HTMLElement, props: MountProps): Handle {
  const root: Root = createRoot(el);
  root.render(<CheckoutApp {...props} />);
  return { unmount() { root.unmount(); } };
}
```

**`src/CheckoutApp.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { calcGrandTotal, validateAddress, track, type Draft } from '@market/checkout-core';
import { CartStep } from './components/CartStep';
import { AddressStep } from './components/AddressStep';
import { PaymentStep } from './components/PaymentStep';
import './styles.css';

interface Props {
  userId: string;
  draft: Draft | null;
  onDraftChange: (d: Draft) => void;
}

export function CheckoutApp({ draft, onDraftChange }: Props) {
  const [local, setLocal] = useState<Draft | null>(draft);
  const [step, setStep] = useState<'cart' | 'address' | 'payment'>('cart');

  useEffect(() => { setLocal(draft); }, [draft?.updatedAt]);

  const update = (patch: Partial<Draft>) => {
    if (!local) return;
    const next: Draft = { ...local, ...patch, updatedAt: Date.now() };
    setLocal(next);
    onDraftChange(next);
  };

  const errors = useMemo(() => validateAddress(local?.address ?? null), [local?.address]);
  const total = useMemo(
    () => (local ? calcGrandTotal(local.items, local.deliveryMethod, local.promoCode) : 0),
    [local],
  );

  useEffect(() => { track('checkout_rendered', { variant: 'react', step }); }, [step]);

  if (!local) return <div className="react-checkout">Нет черновика заказа</div>;

  return (
    <div className="react-checkout" data-variant="react">
      <h2>Оформление заказа (React)</h2>
      {step === 'cart' && (
        <CartStep draft={local} onChange={update} onNext={() => setStep('address')} />
      )}
      {step === 'address' && (
        <AddressStep draft={local} errors={errors} onChange={update}
                     onBack={() => setStep('cart')} onNext={() => setStep('payment')} />
      )}
      {step === 'payment' && (
        <PaymentStep draft={local} total={total} errors={errors} onChange={update}
                     onBack={() => setStep('address')} />
      )}
    </div>
  );
}
```

**`src/components/CartStep.tsx`**

```tsx
import { DELIVERY_OPTIONS, type Draft } from '@market/checkout-core';

export function CartStep({
  draft, onChange, onNext,
}: {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  onNext: () => void;
}) {
  return (
    <section>
      <ul className="cart">
        {draft.items.map((i) => (
          <li key={i.id}>{i.title} × {i.qty} — {i.price * i.qty} ₽</li>
        ))}
      </ul>
      <label>
        Промокод:
        <input value={draft.promoCode ?? ''}
               onChange={(e) => onChange({ promoCode: e.target.value })} />
      </label>
      <fieldset>
        <legend>Доставка</legend>
        {DELIVERY_OPTIONS.map((d) => (
          <label key={d.id}>
            <input type="radio" name="delivery" value={d.id}
                   checked={draft.deliveryMethod === d.id}
                   onChange={() => onChange({ deliveryMethod: d.id })} />
            {d.title} — {d.price} ₽
          </label>
        ))}
      </fieldset>
      <button onClick={onNext}>Далее</button>
    </section>
  );
}
```

**`src/components/AddressStep.tsx`**

```tsx
import type { Draft } from '@market/checkout-core';

export function AddressStep({
  draft, errors, onChange, onBack, onNext,
}: {
  draft: Draft;
  errors: string[];
  onChange: (patch: Partial<Draft>) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const a = draft.address ?? { country: '', city: '', street: '', zip: '' };
  const set = (k: keyof typeof a) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ address: { ...a, [k]: e.target.value } });

  return (
    <section>
      <h3>Адрес</h3>
      <input placeholder="Страна" value={a.country} onChange={set('country')} />
      <input placeholder="Город" value={a.city} onChange={set('city')} />
      <input placeholder="Улица" value={a.street} onChange={set('street')} />
      <input placeholder="Индекс" value={a.zip} onChange={set('zip')} />
      {errors.length > 0 && (
        <p className="errors">{errors.map((e) => <span key={e}>{e}<br /></span>)}</p>
      )}
      <div className="actions">
        <button onClick={onBack}>Назад</button>
        <button onClick={onNext} disabled={errors.length > 0}>Далее</button>
      </div>
    </section>
  );
}
```

**`src/components/PaymentStep.tsx`**

```tsx
import { useState } from 'react';
import { api, track, type Draft } from '@market/checkout-core';

export function PaymentStep({
  draft, total, errors, onBack,
}: {
  draft: Draft;
  total: number;
  errors: string[];
  onChange: (patch: Partial<Draft>) => void;
  onBack: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const key = crypto.randomUUID();
      const { orderId } = await api.submitOrder(draft.draftId, key);
      track('checkout_converted', { variant: 'react', orderId });
      window.location.href = `/orders/${orderId}`;
    } catch {
      setError('Не удалось оформить заказ, попробуйте ещё раз');
      track('checkout_error', { variant: 'react', reason: 'submit_failed' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <h3>Оплата</h3>
      <p className="total">Итого: {total} ₽</p>
      {error && <p className="errors">{error}</p>}
      <div className="actions">
        <button onClick={onBack} disabled={submitting}>Назад</button>
        <button onClick={submit} disabled={submitting || errors.length > 0}>
          {submitting ? 'Отправляем…' : 'Оформить заказ'}
        </button>
      </div>
    </section>
  );
}
```

**`src/styles.css`**

```css
/* TODO(студент): заменить на Shadow DOM или префикс .react-checkout,
   чтобы стили не протекали в Angular-оболочку */
.react-checkout { padding: 16px; border: 2px dashed #06c; font-family: system-ui, sans-serif; }
.react-checkout .errors { color: #c00; }
.react-checkout .actions { display: flex; gap: 8px; margin-top: 12px; }
.react-checkout .total { font-weight: 600; }
```

### 4.4. Мок-сервер `mock-server/server.ts`

```ts
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const flags = { checkout: 'split', reactPercent: 50, killSwitch: false };
const drafts = new Map<string, unknown>();
const idempotency = new Map<string, unknown>();
const analytics: unknown[] = [];

app.get('/api/flags', (_req, res) => res.json(flags));

// Управление флагами (kill switch) — для демонстрации отката без релиза
app.post('/api/flags', (req, res) => {
  Object.assign(flags, req.body);
  res.json(flags);
});

app.get('/api/drafts/:id', (req, res) => {
  const d = drafts.get(req.params.id);
  if (!d) return res.status(404).json({ error: 'not found' });
  res.json(d);
});

app.put('/api/drafts/:id', (req, res) => {
  const key = String(req.header('Idempotency-Key') ?? '');
  if (key && idempotency.has(key)) return res.json(idempotency.get(key));
  drafts.set(req.params.id, req.body);
  if (key) idempotency.set(key, req.body);
  res.json(req.body);
});

app.post('/api/orders', (req, res) => {
  const key = String(req.header('Idempotency-Key') ?? '');
  if (key && idempotency.has(key)) return res.json(idempotency.get(key));
  const result = { orderId: `order-${Date.now()}` };
  if (key) idempotency.set(key, result);
  res.json(result);
});

app.post('/api/analytics', (req, res) => { analytics.push(req.body); res.status(204).end(); });
app.get('/api/analytics', (_req, res) => res.json(analytics));

app.listen(4000, () => console.log('mock server on http://localhost:4000'));
```

### 4.5. Корневые файлы

**`package.json`**

```json
{
  "name": "market-checkout",
  "private": true,
  "workspaces": ["packages/*", "mock-server"],
  "scripts": {
    "dev:mock": "npm -w mock-server run dev",
    "dev:angular": "npm -w angular-shell run start",
    "dev:react": "npm -w react-checkout run dev",
    "build:react": "npm -w react-checkout run build",
    "build:angular": "npm -w angular-shell run build"
  }
}
```

**`angular-shell/src/index.html`** — importmap для React (вариант A)

```html
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Market</title>
    <base href="/" />
    <script type="importmap">
      {
        "imports": {
          "react": "/react-vendor/react.production.min.js",
          "react-dom": "/react-vendor/react-dom.production.min.js",
          "react-dom/client": "/react-vendor/react-dom-client.production.min.js"
        }
      }
    </script>
  </head>
  <body>
    <app-root></app-root>
  </body>
</html>
```

**`angular-shell/proxy.conf.json`**

```json
{
  "/api": { "target": "http://localhost:4000", "secure": false, "changeOrigin": true }
}
```

> Альтернатива (вариант B): не выносить React в external, а бандлить его внутрь `react-checkout.js`. Студент **обязан обосновать** выбор в записке (размер чанка vs дублирование React).

### 4.6. Запуск

```bash
npm install
npm run dev:mock        # http://localhost:4000
npm run build:react     # собирает react-checkout.js в angular-shell/public/react-checkout
npm run dev:angular     # http://localhost:4200, проксирует /api на mock
```

### 4.7. Что в каркасе намеренно не сделано (`TODO(студент)`)

Каркас **работает**, но не удовлетворяет ТЗ. Явные дыры:

1. **Изоляция стилей** React-версии — сейчас глобальные стили (`.react-checkout`), протекают в оболочку.
2. **Загрузка React-бандла** — путь `/react-checkout/react-checkout.js` и внешние `react`/`react-dom` требуют настройки importmap/vendor; выбор варианта A/B не обоснован.
3. **Fallback** — частично есть (mount → Angular), но нет логирования `react_chunk_load_error` и нет гарантии сохранения черновика при падении.
4. **Kill switch** — `refresh()` не вызывается, переключение «на лету» отсутствует.
5. **Сохранение черновика между версиями** — Angular-версия мутирует `this.draft` локально, не пишет в `draftStore`/API; синхронизация с React отсутствует.
6. **Единая аналитика** — Angular-версия почти не трекает события; нет `checkout_step_completed`.
7. **Идемпотентность** — `Idempotency-Key` генерируется на каждый submit; при ретраях ключ нестабилен.
8. **A/B-честность** — нужно проверить, что обе версии используют ядро (`calcGrandTotal`, `validateAddress`) и не дублируют логику.
9. **Тесты** — отсутствуют; нужны unit на `hashToPercent`/`resolveVariant` и интеграционный на «Angular → React → откат».
10. **План выката** и критерии остановки — в записке.

---

# ЧАСТЬ II. Задания и требования

## 5. Ситуация (контекст продукта)

**«Market»** — e-commerce, ~2 млн заказов/мес. Ключевой экран — **«Оформление заказа»** (checkout): корзина, адрес, доставка, оплата, подтверждение. Сейчас на Angular 14, приносит основную выручку; конверсия — критическая метрика, за ней следят ежедневно.

**Зачем миграция:** стратегический переход на React для клиентских сценариев (общая дизайн-система, найм, переиспользование с мобильным вебом). Checkout — первый кандидат: самый важный и самый болезненный для поддержки. Выкатить «всё сразу» нельзя: простой или регресс = прямые потери.

**Что уже есть:** Angular-оболочка (навигация, авторизация, layout), Angular checkout, черновик заказа в `localStorage` + на бэкенде (`draftId`), аналитика `checkout_rendered`/`checkout_step_completed`/`checkout_converted`, e2e на ключевой путь. Бэкенд поддерживает `Idempotency-Key` и `draftId`.

**Боль и риски:**
1. **Деньги на кону** — нужен мгновенный откат на Angular без релиза.
2. **Гибридный рантайм** — React-checkout внутри Angular-оболочки; стили и глобальные обработчики не должны конфликтовать.
3. **Сохранение состояния** — пользователь может начать на одной версии и попасть на другую (или на откат); черновик не должен теряться.
4. **Деградация** — если React-чанк не загрузился, нельзя показывать белый экран; нужен fallback и логирование.
5. **Дублирование логики** — валидация/расчёт/промокоды не должны быть реализованы дважды по-разному, иначе A/B нечестен.
6. **Доверие к метрикам** — события в двух версиях должны быть сопоставимы (единая схема с `variant`).

**Стейкхолдеры:**
- **CPO:** «Конверсия не должна просесть. Если что — откатываемся за минуту, без релиза».
- **Тимлид фронтенда:** «Strangler-fig, общее ядро логики, изоляция стилей. Не хочу два разных checkout'а, которые ведут себя по-разному».
- **Бэкенд:** «API один, менять не будем. Ждём идемпотентности и корректной работы с `draftId`».
- **Аналитика/BI:** «Нужны сопоставимые события с `variant`, иначе A/B бессмысленен».
- **Поддержка:** «Если что-то пошло не так — вернуть старую версию и не потерять корзины».
- **Безопасность:** «Обе версии одинаково соблюдают CSRF/токены и не расширяют поверхность атаки».

**Ограничения бизнеса:**
- Постепенный выкат 1% → 10% → 50% → 100% с критериями остановки (рост ошибок checkout > 0.5 п.п. или падение конверсии > 1 п.п. — стоп и откат).
- Детерминированное разбиение: один пользователь всегда в одном варианте (стабильный хэш `userId`).
- Kill switch: один флаг возвращает 100% на Angular **без деплоя**, в течение минуты.
- Общий контракт: обе версии используют один API и одну фреймворк-агностичную бизнес-логику.
- Аналитика: единая схема с `variant`, `render_ms`, `error`; дашборд сравнения.
- Изоляция стилей; никаких глобальных конфликтов (полифиллы, `window`, `history`).
- Обратимость: откат не теряет данные; черновик переживает переключение версий.

## 6. Задание

Вам нужно **провести миграцию checkout с Angular на React под трафиком** на базе выданного каркаса, используя стратегию strangler-fig / micro-frontend, и довести систему до требований ниже. Работа ведётся в репозитории `market-checkout/`; каркас — стартовая точка, а не готовое решение.

### 6.1. Обязательные функциональные требования

**R1. Гибридный рантайм и изоляция.**
React-checkout монтируется в Angular-оболочку через контракт `mount/unmount`. Стили React-версии **не протекают** в оболочку и наоборот. Глобальные обработчики (`window`, `history`, полифиллы) не дублируются и не конфликтуют. Корректный `unmount` при уходе с экрана (нет утечек: обработчики, таймеры, подписки сняты).

**R2. Feature flags и детерминированный A/B.**
Флаги читаются с бэкенда (`/api/flags`). Поддерживаются режимы `angular`, `react`, `split` с процентом. Разбиение детерминировано по `userId` (стабильный хэш) — один пользователь всегда в одном варианте. Есть kill switch, возвращающий 100% на Angular **без деплоя** (переключение в течение минуты, без перезагрузки страницы или с ней — обосновать).

**R3. Fallback и деградация.**
Если React-чанк не загрузился (сеть, CDN, ошибка бандла) или React упал при монтировании — показывается Angular-версия, инцидент логируется (`react_chunk_load_error`, `checkout_error` с `reason`), черновик заказа **не теряется**.

**R4. Сохранение черновика между версиями.**
Пользователь может начать оформление на Angular-версии, а после переключения флага попасть на React (и наоборот при откате). Черновик (корзина, адрес, доставка, промокод) сохраняется и восстанавливается. Локальный и удалённый черновики склеиваются по `updatedAt`.

**R5. Общее ядро логики.**
Валидация, расчёт доставки, промокоды, форматирование — реализованы **один раз** в `@market/checkout-core` и используются обеими версиями. Дублирование логики запрещено. Поведение версий идентично на одинаковых входных данных.

**R6. Единая аналитика.**
События `checkout_rendered` (`variant`, `render_ms`), `checkout_step_completed` (`variant`, `step`), `checkout_converted` (`variant`, `orderId`), `checkout_error` (`variant`, `reason`) уходят по единой схеме. В отчёте видно сравнение конверсии и ошибок между вариантами.

**R7. Идемпотентность.**
`Idempotency-Key` стабилен при ретраях одной и той же операции (не генерируется заново на каждый повтор). Повторный submit не создаёт второй заказ.

**R8. Обратимость.**
Kill switch возвращает 100% на Angular без релиза. Откат не теряет черновик. Поведение после отката идентично исходному Angular-checkout.

### 6.2. Нефункциональные требования

**N1. Отсутствие регрессий.** Существующий Angular-checkout продолжает работать; публичный контракт оболочки не ломается.

**N2. Производительность.** `render_ms` React-версии сопоставим с Angular (обосновать допустимую дельту). Начальный бандл оболочки не растёт существенно (сравнить в отчёте сборщика; если React вынесен в отдельный чанк — показать, что он не грузится при `variant=angular`).

**N3. Наблюдаемость.** Логи инцидентов (`react_chunk_load_error`, `mount_failed`, `submit_failed`) и метрики (сравнение `render_ms`, ошибок, конверсии по `variant`) присутствуют.

**N4. Тестируемость.** Unit-тесты на `hashToPercent`/`resolveVariant` (детерминизм, границы 0/100, kill switch). Минимум один интеграционный/e2e-тест на сценарий «Angular → переключение флага → React → kill switch → Angular» с проверкой сохранения черновика.

**N5. Качество диффа.** Нет случайных правок, `console.log` в финале, мёртвого кода.

**N6. Безопасность.** Обе версии одинаково работают с токенами/CSRF (не расширяют поверхность атаки); пользовательский ввод не вставляется через `innerHTML` без санитизации.

### 6.3. Что нужно доделать в каркасе (соответствие TODO → требования)

| TODO в каркасе | Требование |
|---|---|
| Глобальные стили React | R1 (изоляция) |
| Путь/importmap для React-бандла, выбор A/B | R1, N2 |
| Логирование `react_chunk_load_error`, гарантия черновика при падении | R3 |
| `refresh()` флагов, kill switch «на лету» | R2, R8 |
| Angular-версия не пишет черновик в `draftStore`/API | R4, R5 |
| Аналитика Angular-версии | R6 |
| Стабильный `Idempotency-Key` | R7 |
| Проверка использования ядра обеими версиями | R5, R6 (честность A/B) |
| Тесты | N4 |
| План выката, критерии остановки | R8, N3 |

### 6.4. План выката (обязателен в записке)

Опишите: этапы (1% → 10% → 50% → 100%), метрики и пороги остановки (ошибки checkout, конверсия, `render_ms`), процедуру отката (kill switch, время до эффекта, что происходит с черновиками), кто и как принимает решение об остановке.

## 7. Что сдать

1. **Записка (1–2 стр.):** анализ текущего состояния, варианты решения (Module Federation vs ручной mount; importmap vs бандл React внутрь; Shadow DOM vs CSS-скоуп), выбранный подход и почему, риски, план выката/отката, критерии остановки.
2. **Диаграмма** архитектуры и потоков данных (до/после): оболочка ↔ ядро ↔ React/Angular ↔ API; путь флага; путь черновика при переключении.
3. **Реализация** — чистый дифф по каркасу, закрывающий R1–R8 и N1–N6.
4. **Тесты** — unit (флаги/детерминизм) + интеграционный/e2e на сценарий переключения и отката с сохранением черновика.
5. **Демо** (вживую или запись): `variant=angular` → `split` → `react` → блокировка React-чанка (fallback) → kill switch (откат) — с показом сохранения черновика на каждом шаге и событий аналитики с `variant`.
6. **Отчёт по наблюдаемости:** примеры логов инцидентов и сравнение метрик по `variant` (из `/api/analytics`).
7. **Ретроспектива (5–10 строк):** что оказалось сложнее всего, что бы сделали иначе.

## 8. Подсказки и ограничения

- **Не переписывайте Angular-checkout «с нуля»** — адаптируйте его к общему ядру и синхронизации черновика; это часть задания (R4, R5).
- **Выбор интеграции** (Module Federation vs ручной mount; importmap vs бандл React внутрь; Shadow DOM vs CSS-скоуп) — на вас; обоснуйте в записке с учётом N2 (размер бандла) и R1 (изоляция).
- **Детерминизм A/B** проверяется повторными вызовами `resolveVariant` с тем же `userId` — хэш должен быть стабильным (FNV-1a в каркасе — отправная точка, можно заменить, обосновав).
- **Kill switch** не обязан быть «мгновенным по SSE» — достаточно периодического рефетча флагов (обоснуйте интервал) или рефетча при навигации; главное — без релиза и в течение минуты.
- **Черновик** — источник истины по `updatedAt`; при конфликте локального и удалённого выбирайте по `updatedAt` и логируйте конфликт (не обязательно, но плюс).
- **Тесты** можно писать на Vitest/Jest для ядра и Playwright/Cypress для сценария; выбор обоснуйте.
- **Мок-сервер** можно расширять (эндпоинты, задержки, ошибки), но не ломать существующие контракты.

