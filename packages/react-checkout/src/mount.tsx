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