import { buildMcpServerSlug, sanitizeSourceSlug } from './slug';

describe('slug', () => {
  it('sanitizes source name into <= 20 char lowercase slug', () => {
    expect(sanitizeSourceSlug('Sales Order Service v1')).toBe('sales_order_service');
  });

  it('builds K8s name with short uuid suffix', () => {
    const slug = buildMcpServerSlug('Sales Order', 'a1b2c3d4-e5f6-7890-abcd-ef0123456789');
    expect(slug).toBe('mcp-sales-order-a1b2c3');
    expect(slug.length).toBeLessThanOrEqual(63);
  });

  it('truncates long source names', () => {
    const longName = 'Very Long Source Name With Many Words Exceeding Limit';
    const slug = buildMcpServerSlug(longName, '11111111-2222-3333-4444-555555555555');
    expect(slug.startsWith('mcp-')).toBe(true);
    expect(slug.endsWith('-111111')).toBe(true);
    expect(slug.length).toBeLessThanOrEqual(63);
  });
});
