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