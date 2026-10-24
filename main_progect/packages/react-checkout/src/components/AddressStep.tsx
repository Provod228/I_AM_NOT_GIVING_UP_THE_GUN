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