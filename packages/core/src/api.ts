import type { Draft } from './types';

async function json<T>(res: Response): Promise<T> {
    if (!res.ok) throw new Error(`API ${res.status}`);
    return res.json() as Promise<T>;
}

export const api = {
    async getDraft(draftId: string): Promise<Draft | null> {
        const res = await fetch(`/api/drafts/${draftId}`, { credentials: 'include' });
        if (res.status === 404) return null;
        return json<Draft>(res);
    },
    async saveDraft(draft: Draft, idempotencyKey: string): Promise<Draft> {
        const res = await fetch(`/api/drafts/${draft.draftId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify(draft),
        });
        return json<Draft>(res);
    },
    async submitOrder(draftId: string, idempotencyKey: string): Promise<{ orderId: string }> {
        const res = await fetch(`/api/orders`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
            body: JSON.stringify({ draftId }),
        });
        return json<{ orderId: string }>(res);
    },
};