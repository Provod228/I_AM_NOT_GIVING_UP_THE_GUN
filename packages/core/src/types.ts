
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