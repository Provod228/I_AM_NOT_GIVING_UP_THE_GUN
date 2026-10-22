import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const flags = { checkout: 'split', reactPercent: 50, killSwitch: false };
const drafts = new Map<string, unknown>();
const idempotency = new Map<string, unknown>();
const analytics: unknown[] = [];

app.get('/api/flags', (_req, res) => res.json(flags));

// Управление флагами (kill switch) — для демонстрации отката без релиза
app.post('/api/flags', (req, res) => {
    Object.assign(flags, req.body);
    res.json(flags);
});

app.get('/api/drafts/:id', (req, res) => {
    const d = drafts.get(req.params.id);
    if (!d) return res.status(404).json({ error: 'not found' });
    res.json(d);
});

app.put('/api/drafts/:id', (req, res) => {
    const key = String(req.header('Idempotency-Key') ?? '');
    if (key && idempotency.has(key)) return res.json(idempotency.get(key));
    drafts.set(req.params.id, req.body);
    if (key) idempotency.set(key, req.body);
    res.json(req.body);
});

app.post('/api/orders', (req, res) => {
    const key = String(req.header('Idempotency-Key') ?? '');
    if (key && idempotency.has(key)) return res.json(idempotency.get(key));
    const result = { orderId: `order-${Date.now()}` };
    if (key) idempotency.set(key, result);
    res.json(result);
});

app.post('/api/analytics', (req, res) => { analytics.push(req.body); res.status(204).end(); });
app.get('/api/analytics', (_req, res) => res.json(analytics));

app.listen(4000, () => console.log('mock server on http://localhost:4000'));