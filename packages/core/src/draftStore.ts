import type { Draft } from './types';
import { api } from './api';

const KEY = 'market.checkout.draft.v1';

export const draftStore = {
    loadLocal(): Draft | null {
        try {
            const raw = localStorage.getItem(KEY);
            return raw ? (JSON.parse(raw) as Draft) : null;
        } catch { return null; }
    },
    saveLocal(draft: Draft) { localStorage.setItem(KEY, JSON.stringify(draft)); },
    async loadRemote(draftId: string): Promise<Draft | null> {
        try { return await api.getDraft(draftId); } catch { return null; }
    },
    pickLatest(a: Draft | null, b: Draft | null): Draft | null {
        if (!a) return b;
        if (!b) return a;
        return a.updatedAt >= b.updatedAt ? a : b;
    },
};