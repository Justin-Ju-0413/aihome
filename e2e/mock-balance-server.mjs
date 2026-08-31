import http from 'node:http';

const GOOD_KEY = 'sk-good-deepseek';

const server = http.createServer((req, res) => {
  const auth = req.headers.authorization ?? '';
  const key = auth.replace(/^Bearer /, '');
  const url = new URL(req.url, 'http://127.0.0.1:3210');
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (url.pathname === '/' || url.pathname === '/index.html') {
    return json(200, { ok: true });
  }
  if (url.pathname === '/user/balance') {
    if (key !== GOOD_KEY) return json(401, { error: 'Unauthorized' });
    return json(200, {
      is_available: true,
      balance_infos: [{ currency: 'CNY', total_balance: '110.00', granted_balance: '10.00', topped_up_balance: '100.00' }],
    });
  }
  if (url.pathname === '/api/v1/auth/key') {
    if (key !== 'sk-or-good') return json(401, { error: 'Unauthorized' });
    return json(200, { data: { label: 'e2e', usage: 2500, limit: 10000, is_free_tier: false } });
  }
  if (url.pathname === '/v1/dashboard/billing/credit_grants') {
    return json(404, { error: { message: 'not found' } });
  }
  json(404, { error: 'not found' });
});

server.listen(3210, '127.0.0.1', () => {
  console.log('[mock-balance] listening on http://127.0.0.1:3210');
});
