# fennoa-agentic

MCP server that exposes the [Fennoa Accounting API](https://tietopankki.fennoa.com/api-accounting) as agent tools for use with Claude Code, Claude Desktop, VS Code Copilot, and any MCP-compatible client.

## Setup

```bash
npm install
cp .env.example .env   # fill in your API key and company code
npm run build
```

## Running

```bash
# Production (after build)
npm start

# Development (no build step)
npm run dev
```

## Tools exposed

| Tool | Endpoint |
|------|----------|
| `get_periods` | GET /accounting_api/get/periods |
| `get_locking_periods` | GET /accounting_api/get/locking_periods |
| `get_opening_balances` | GET /accounting_api/get/opening_balances/:period_id |
| `get_accounts` | GET /accounting_api/get/accounts |
| `get_vatcodes` | GET /accounting_api/get/vatcodes |
| `get_account_balance` | GET /accounting_api/get/account_balance/:account/:date |
| `get_ledger` | GET /accounting_api/get/ledger/:start/:end |
| `add_statement` | POST /accounting_api/add |
| `upload_attachment` | POST /accounting_api/do/upload_attachment/:id |
| `get_budgets` | GET /accounting_api/get/budgets |
| `create_budget` | POST /accounting_api/add/budgets |
| `update_budget` | PATCH /accounting_api/budgets/:id |

See [SKILL.md](./SKILL.md) for usage patterns, MCP configuration examples, and key concepts.
