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