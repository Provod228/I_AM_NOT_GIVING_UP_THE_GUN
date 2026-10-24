import { Routes } from '@angular/router';

export const routes: Routes = [
    { path: '', redirectTo: 'checkout', pathMatch: 'full' },
    {
        path: 'checkout',
        loadComponent: () =>
            import('./checkout-host/checkout-host.component').then((m) => m.CheckoutHostComponent),
    },
];