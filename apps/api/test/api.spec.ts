import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

process.env.DATABASE_PATH = ':memory:';

let app: INestApplication;
let agent: ReturnType<typeof request.agent>;

beforeAll(async () => {
  const { AppModule } = await import('../src/app.module');
  const { configureApp } = await import('../src/bootstrap');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = configureApp(mod.createNestApplication({ bodyParser: false }));
  await app.init();
  agent = request.agent(app.getHttpServer());
});
afterAll(() => app?.close());

describe('Ledger API', () => {
  let accountId: string;
  let savingsId: string;
  let groceriesId: string;
  let salaryId: string;

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/api/accounts').expect(401);
  });

  it('validates registration with a helpful message', async () => {
    const res = await agent.post('/api/auth/register').send({ name: 'A', email: 'a@b.co', password: 'short' }).expect(400);
    expect(res.body.message).toMatch(/at least 8 characters/);
  });

  it('registers, seeds defaults and signs in', async () => {
    const res = await agent.post('/api/auth/register').send({ name: 'Ada', email: 'Ada@Example.com', password: 'correct horse' }).expect(201);
    expect(res.body.email).toBe('ada@example.com');
    expect(res.body.currency).toBe('NPR');
    expect(res.body.locale).toBe('en-IN');
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    const cats = (await agent.get('/api/categories').expect(200)).body;
    groceriesId = cats.find((c: any) => c.name === 'Groceries').id;
    salaryId = cats.find((c: any) => c.name === 'Salary').id;
    const accts = (await agent.get('/api/accounts').expect(200)).body;
    expect(accts).toHaveLength(1);
    accountId = accts[0].id;
  });

  it('refuses duplicate emails', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send({ name: 'X', email: 'ada@example.com', password: '12345678' }).expect(409);
  });

  it('tracks balances across income, expense and transfers', async () => {
    savingsId = (await agent.post('/api/accounts').send({ name: 'Savings', type: 'savings', color: '#34c759', openingBalance: 10000 }).expect(201)).body.id;
    await agent.post('/api/transactions').send({ type: 'income', amount: 500000, accountId, categoryId: salaryId, date: '2026-11-01', payee: 'Employer' }).expect(201);
    await agent.post('/api/transactions').send({ type: 'expense', amount: 4550, accountId, categoryId: groceriesId, date: '2026-11-03', payee: 'Market' }).expect(201);
    await agent.post('/api/transactions').send({ type: 'transfer', amount: 100000, accountId, toAccountId: savingsId, date: '2026-11-04' }).expect(201);
    const accts = (await agent.get('/api/accounts')).body;
    expect(accts.find((a: any) => a.id === accountId).balance).toBe(500000 - 4550 - 100000);
    expect(accts.find((a: any) => a.id === savingsId).balance).toBe(110000);
  });

  it('rejects a category of the wrong kind', async () => {
    const res = await agent.post('/api/transactions').send({ type: 'expense', amount: 100, accountId, categoryId: salaryId, date: '2026-11-05' }).expect(400);
    expect(res.body.message).toMatch(/expense category/);
  });

  it('rejects a transfer to the same account', async () => {
    await agent.post('/api/transactions').send({ type: 'transfer', amount: 100, accountId, toAccountId: accountId, date: '2026-11-05' }).expect(400);
  });

  it('searches and filters transactions', async () => {
    const res = await agent.get('/api/transactions').query({ q: 'mark', from: '2026-11-01', to: '2026-11-30' }).expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].categoryName).toBe('Groceries');
    expect(res.body.expense).toBe(4550);
  });

  it('computes budgets and insights for a month', async () => {
    await agent.put(`/api/budgets/${groceriesId}`).send({ amount: 30000 }).expect(200);
    const budgets = (await agent.get('/api/budgets').query({ month: '2026-11' })).body;
    expect(budgets[0].spent).toBe(4550);
    const ov = (await agent.get('/api/insights/overview').query({ month: '2026-11' }).expect(200)).body;
    expect(ov.income).toBe(500000);
    expect(ov.expense).toBe(4550);
    expect(ov.netWorth).toBe(500000 - 4550 + 10000);
    expect(ov.trend).toHaveLength(12);
    expect(ov.trend[11].netWorth).toBe(ov.netWorth);
    expect(ov.daily.current).toHaveLength(30);
  });

  it('posts a recurring bill and advances its due date with month-end clamping', async () => {
    const r = (await agent.post('/api/recurring').send({
      name: 'Gym', type: 'expense', amount: 3000, accountId, cadence: 'monthly', nextDate: '2027-01-31',
    }).expect(201)).body;
    const posted = (await agent.post(`/api/recurring/${r.id}/post`).expect(200)).body;
    expect(posted.nextDate).toBe('2027-02-28');
  });

  it('imports CSV rows and creates missing categories', async () => {
    const res = await agent.post('/api/data/import').send({
      accountId, rows: [
        { date: '2026-10-01', amount: -1234, payee: 'Cafe', category: 'Coffee' },
        { date: '2026-10-02', amount: 9900, payee: 'Refund' },
        { date: '2026-10-03', amount: 0 },
      ],
    }).expect(200);
    expect(res.body).toEqual({ imported: 2, skipped: 1 });
    const cats = (await agent.get('/api/categories')).body;
    expect(cats.some((c: any) => c.name === 'Coffee' && c.kind === 'expense')).toBe(true);
  });

  it('exports CSV with formula injection neutralised', async () => {
    await agent.post('/api/transactions').send({ type: 'expense', amount: 1, accountId, date: '2026-11-06', payee: '=HYPERLINK("x")' }).expect(201);
    const res = await agent.get('/api/data/export.csv').expect(200);
    expect(res.text).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it('isolates data between users', async () => {
    const other = request.agent(app.getHttpServer());
    await other.post('/api/auth/register').send({ name: 'Eve', email: 'eve@example.com', password: 'password123' }).expect(201);
    await other.patch(`/api/accounts/${accountId}`).send({ name: 'pwned' }).expect(404);
    await other.post('/api/transactions').send({ type: 'expense', amount: 1, accountId, date: '2026-11-01' }).expect(404);
    expect((await other.get('/api/transactions')).body.total).toBe(0);
  });

  it('signs out', async () => {
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('loads sample data for a new user', async () => {
    const fresh = request.agent(app.getHttpServer());
    await fresh.post('/api/auth/register').send({ name: 'Sam', email: 'sam@example.com', password: 'password123' }).expect(201);
    await fresh.post('/api/data/sample').expect(200);
    const tx = (await fresh.get('/api/transactions')).body;
    expect(tx.total).toBeGreaterThan(20);
    await fresh.post('/api/data/sample').expect(400);
    await fresh.post('/api/data/reset').expect(200);
    expect((await fresh.get('/api/transactions')).body.total).toBe(0);
    expect((await fresh.get('/api/accounts')).body).toHaveLength(1);
    expect((await fresh.get('/api/goals')).body).toHaveLength(0);
    await fresh.post('/api/data/sample').expect(200);
  });
});
