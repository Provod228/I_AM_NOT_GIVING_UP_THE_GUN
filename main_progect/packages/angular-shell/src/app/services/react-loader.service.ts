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
            const url = '/react-checkout/react-checkout.js'
            this.loading = import(/* @vite-ignore */ url)
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