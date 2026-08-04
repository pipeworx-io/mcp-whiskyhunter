# mcp-whiskyhunter

WhiskyHunter MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `list_distilleries` | List whisky distilleries tracked by whiskyhunter.net (300+ distilleries with auction data). Returns each distillery name, slug, and country. Use the slug with distillery_prices to get its auction price history. Keyless. |
| `distillery_prices` | A single distillery's monthly online whisky-auction price/volume history: per-month max/min/mean winning bid, total trading volume, and lots count. Prices are in the auctions' reporting currency and aggregate many online auction houses. Pass a distillery slug from list_distilleries (e.g. "macallan", "8_doors"). Returns the most recent ~60 months. Keyless. |
| `auction_stats` | Latest aggregate monthly stats per online whisky-auction house: mean winning bid, total trading volume, lots count for that house, and the all-auctions total lots count for the month. Aggregates online whisky-auction data; prices are in each house's reporting currency. Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "whiskyhunter": {
      "url": "https://gateway.pipeworx.io/whiskyhunter/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Whiskyhunter data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
