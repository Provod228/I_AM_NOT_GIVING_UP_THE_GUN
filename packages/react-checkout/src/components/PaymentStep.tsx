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