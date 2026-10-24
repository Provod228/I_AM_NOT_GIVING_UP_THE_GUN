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