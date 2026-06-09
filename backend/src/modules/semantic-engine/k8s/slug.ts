export function sanitizeSourceSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
    .replace(/_+$/g, '');
}

export function buildMcpServerSlug(sourceName: string, mcpServerId: string): string {
  const sourceSlug = sanitizeSourceSlug(sourceName).replace(/_/g, '-');
  const shortId = mcpServerId.replace(/-/g, '').slice(0, 6);
  return `mcp-${sourceSlug}-${shortId}`;
}
