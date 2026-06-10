interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * WhiskyHunter MCP.
 *
 * Open data on whisky distilleries and aggregated online whisky-auction
 * prices/volumes from whiskyhunter.net. Covers 300+ distilleries and 30+
 * online auction houses, with monthly time series of winning-bid prices and
 * trading volumes. Keyless. A unique niche — no other catalog source covers
 * the secondary whisky-auction market.
 *
 * Prices are reported in the auction's reporting currency (typically GBP for
 * the UK/EU houses, but varies per house) and aggregate data across many
 * online whisky auctions.
 */


const BASE = 'https://whiskyhunter.net/api';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'list_distilleries',
    description:
      'List whisky distilleries tracked by whiskyhunter.net (300+ distilleries with auction data). Returns each distillery name, slug, and country. Use the slug with distillery_prices to get its auction price history. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Optional case-insensitive substring filter on distillery name, e.g. "macallan", "glen".',
        },
        limit: {
          type: 'number',
          description: 'Max distilleries to return (default 25, max 60).',
        },
      },
    },
  },
  {
    name: 'distillery_prices',
    description:
      "A single distillery's monthly online whisky-auction price/volume history: per-month max/min/mean winning bid, total trading volume, and lots count. Prices are in the auctions' reporting currency and aggregate many online auction houses. Pass a distillery slug from list_distilleries (e.g. \"macallan\", \"8_doors\"). Returns the most recent ~60 months. Keyless.",
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Distillery slug from list_distilleries, e.g. "macallan", "8_doors", "ardbeg".',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'auction_stats',
    description:
      'Latest aggregate monthly stats per online whisky-auction house: mean winning bid, total trading volume, lots count for that house, and the all-auctions total lots count for the month. Aggregates online whisky-auction data; prices are in each house\'s reporting currency. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max auction-house records to return, newest first (default 25, max 60).',
        },
      },
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'list_distilleries':
        return listDistilleries(args);
      case 'distillery_prices':
        return distilleryPrices(args);
      case 'auction_stats':
        return auctionStats(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

async function safeGet(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (res.status === 404) return { __error: 'not found' };
  if (!res.ok) return { __error: `whiskyhunter: ${res.status} ${(await res.text()).slice(0, 200)}` };
  const text = await res.text();
  if (!text.trim()) return { __error: 'empty response' };
  try {
    return JSON.parse(text);
  } catch {
    return { __error: `whiskyhunter: non-JSON response ${text.slice(0, 120)}` };
  }
}

function clampLimit(raw: unknown, def: number, max: number): number {
  const n = typeof raw === 'number' && Number.isFinite(raw) ? Math.floor(raw) : def;
  return Math.max(1, Math.min(max, n));
}

function mapDistillery(d: Record<string, unknown>) {
  return { name: d.name, slug: d.slug, country: d.country };
}

function mapDistilleryPoint(d: Record<string, unknown>) {
  return {
    date: d.dt,
    winning_bid_max: d.winning_bid_max,
    winning_bid_min: d.winning_bid_min,
    winning_bid_mean: d.winning_bid_mean,
    trading_volume: d.trading_volume,
    lots_count: d.lots_count,
  };
}

function mapAuction(a: Record<string, unknown>) {
  return {
    date: a.dt,
    auction_name: a.auction_name,
    auction_slug: a.auction_slug,
    winning_bid_mean: a.winning_bid_mean,
    trading_volume: a.auction_trading_volume,
    lots_count: a.auction_lots_count,
    all_auctions_lots_count: a.all_auctions_lots_count,
  };
}

async function listDistilleries(args: Record<string, unknown>): Promise<unknown> {
  const data = await safeGet('/distilleries_info/');
  if (data && typeof data === 'object' && '__error' in data) {
    return { error: (data as { __error: string }).__error };
  }
  if (!Array.isArray(data)) return { error: 'unexpected response shape', distilleries: [] };

  const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : '';
  const limit = clampLimit(args.limit, 25, 60);

  let list = data as Array<Record<string, unknown>>;
  if (search) {
    list = list.filter((d) => String(d.name ?? '').toLowerCase().includes(search));
  }
  const sliced = list.slice(0, limit);
  return {
    count: sliced.length,
    total_matched: list.length,
    distilleries: sliced.map(mapDistillery),
  };
}

async function distilleryPrices(args: Record<string, unknown>): Promise<unknown> {
  const slug = typeof args.slug === 'string' ? args.slug.trim() : '';
  if (!slug) return { error: 'provide a distillery slug (from list_distilleries)', slug: args.slug ?? null };

  const data = await safeGet(`/distillery_data/${encodeURIComponent(slug)}/`);
  if (data && typeof data === 'object' && '__error' in data) {
    return { error: (data as { __error: string }).__error, slug };
  }
  if (!Array.isArray(data)) return { error: 'unexpected response shape', slug, history: [] };

  const list = data as Array<Record<string, unknown>>;
  const CAP = 60;
  const sliced = list.slice(0, CAP);
  return {
    slug,
    name: list[0]?.name ?? slug,
    count: sliced.length,
    truncated: list.length > CAP,
    history: sliced.map(mapDistilleryPoint),
  };
}

async function auctionStats(args: Record<string, unknown>): Promise<unknown> {
  const data = await safeGet('/auctions_data/');
  if (data && typeof data === 'object' && '__error' in data) {
    return { error: (data as { __error: string }).__error };
  }
  if (!Array.isArray(data)) return { error: 'unexpected response shape', auctions: [] };

  const limit = clampLimit(args.limit, 25, 60);
  const list = (data as Array<Record<string, unknown>>).slice(0, limit);
  return {
    count: list.length,
    auctions: list.map(mapAuction),
  };
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
