/** Text printed on tower faces and chip packages. Mixes film-style status words with real work. */
export const WORDS = [
  'STATUS', 'REPORT', 'QUEUE', 'OVERRIDE', 'CONFIRM', 'INITIATE', 'DUMP', 'SECURE', 'ROUTE', 'PARSE',
  'MATCH', 'DRAFT', 'POST', 'SYNC', 'WEBHOOK', 'CHECKOUT', 'ORDER', 'INVOICE', 'LEDGER', 'CACHE',
  'DEPLOY', 'BUILD', 'ERROR', 'RETRY', 'ACK', 'HANDSHAKE', 'APPROVE', 'INDEX',
] as const;

export const DATA = [
  'INV-1047 POSTED', 'QBO #214', 'LAB-HARD 38.00', 'MAT-SAND 14.00', 'NET 15', '5,818.00', '3,230.00',
  'ORDER #88104', '200 OK', '201 CREATED', 'p50 1.4s', 'LCP 0.9s', 'GRAPHQL OK', 'HYDROGEN', 'FUNCTIONS',
  'MS GRAPH', 'XLSX D2:D5', 'NODE NYC-MIA', 'TLS 1.3', 'SHOPIFY PLUS', 'WHAT_A_ROOM', 'VERONICA_BEARD',
  'MYNTR', 'ORDERGROOVE', 'SUBS 4,118', 'CART 9F3A',
] as const;

export const CODE = [
  'await qbo.invoice.create(draft)', 'if (!match) queue.review(msg)', 'shopify.webhooks.on("orders/create")',
  'const margin = (rev - cost) / rev', 'git push origin main', 'export default defineConfig({',
  'for await (const msg of inbox)', 'schema.parse(llm.extract(body))', 'redis.set(key, id, "NX")',
  'graph.api("/me/drive/items")', 'SELECT * FROM invoices WHERE', 'return { status: 201, id }',
] as const;

/** [label, subtitle] printed on chip and CPU packages. */
export const CHIP_LABELS: readonly (readonly [string, string])[] = [
  ['BNSVG-1047', 'AI-OPS // 2026'],
  ['QBO-214', 'LEDGER BRIDGE'],
  ['SHOPIFY+', 'COMMERCE CORE'],
  ['GQL-09', 'STOREFRONT API'],
  ['LLM-X2', 'EXTRACT UNIT'],
  ['XLSX-D4', 'GRAPH / EXCEL'],
];
