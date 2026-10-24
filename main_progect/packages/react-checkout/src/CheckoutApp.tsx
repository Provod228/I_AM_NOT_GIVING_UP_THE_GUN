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