# fennoa-agentic

Fennoa Accounting API as agent tools — three ways to use [Fennoa's accounting API](https://tietopankki.fennoa.com/api-accounting) from AI agents and CLI tools.

| Approach | Best for |
|---|---|
| [Plugin / Marketplace](https://github.com/ljack/fennoa-agentic) | Easiest install — one command in Claude Code |
| [MCP Server](#a--mcp-server) | Claude Code, Claude Desktop, VS Code — structured tool calls |
| [Bash wrapper](#b--bash-wrapper) | Terminal, scripts, CI/CD — no Node.js runtime needed |
| [Claude Code Skill](#c--claude-code-skill) | Ad hoc queries from Claude Code — no config needed |

## Plugin / Marketplace install

The fastest way to get started from Claude Code:

```
/plugin marketplace add ljack/fennoa-agentic
```

Then install the plugin:

```
/plugin install fennoa
```

This gives you the `/fennoa` skill immediately — no manual file copying needed.

To install via CLI instead:

```bash
claude plugin install fennoa@ljack/fennoa-agentic
```

## Prerequisites

- Fennoa account with API access
- API key and company code from Fennoa settings

## A — MCP Server

A Node.js MCP server exposing all 12 Fennoa endpoints as typed tools.

### Setup

```bash
npm install
npm run build
```

### Configure Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "fennoa": {
      "command": "node",
      "args": ["/path/to/fennoa-agentic/dist/index.js"],
      "env": {
        "FENNOA_API_KEY": "your_api_key",
        "FENNOA_COMPANY_CODE": "your_company_code"
      }
    }
  }
}
```

### Configure Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "fennoa": {
      "command": "node",
      "args": ["/path/to/fennoa-agentic/dist/index.js"],
      "env": {
        "FENNOA_API_KEY": "your_api_key",
        "FENNOA_COMPANY_CODE": "your_company_code"
      }
    }
  }
}
```

### Development (no build step)

```json
{
  "mcpServers": {
    "fennoa": {
      "command": "npx",
      "args": ["tsx", "/path/to/fennoa-agentic/src/index.ts"],
      "env": {
        "FENNOA_API_KEY": "your_api_key",
        "FENNOA_COMPANY_CODE": "your_company_code"
      }
    }
  }
}
```

### Tools exposed

| Tool | Method | Endpoint |
|------|--------|----------|
| `get_periods` | GET | `/get/periods` |
| `get_locking_periods` | GET | `/get/locking_periods` |
| `get_opening_balances` | GET | `/get/opening_balances/:period_id` |
| `get_accounts` | GET | `/get/accounts` |
| `get_vatcodes` | GET | `/get/vatcodes` |
| `get_account_balance` | GET | `/get/account_balance/:account/:date` |
| `get_ledger` | GET | `/get/ledger/:start/:end` |
| `add_statement` | POST | `/add` |
| `upload_attachment` | POST | `/do/upload_attachment/:id` |
| `get_budgets` | GET | `/get/budgets` |
| `create_budget` | POST | `/add/budgets` |
| `update_budget` | PATCH | `/budgets/:id` |

---

## B — Bash Wrapper

`fennoa.sh` wraps all endpoints with curl. No Node.js required.

### Setup

```bash
cp .env.example .env   # add your API key and company code
```

Or export environment variables directly:

```bash
export FENNOA_API_KEY=your_api_key
export FENNOA_COMPANY_CODE=your_company_code
```

### Usage

```bash
# Reference data
./fennoa.sh get_periods
./fennoa.sh get_accounts
./fennoa.sh get_vatcodes

# Ledger
./fennoa.sh get_ledger 2025-01-01 2025-12-31
./fennoa.sh get_ledger 2025-01-01 2025-12-31 --accounts 1900,1910 --limit 500
./fennoa.sh get_account_balance 1910 2025-12-31

# Create a journal entry (JSON from stdin)
echo '{
  "entry_date": "2025-03-17",
  "series_code": "GL",
  "description": "Office supplies",
  "rows": [
    { "account": 4400, "debit": 121.00, "vatcode_id": 1 },
    { "account": 1910, "credit": 121.00 }
  ]
}' | ./fennoa.sh add_statement

# Attach a receipt PDF
./fennoa.sh upload_attachment 1234 receipt.pdf

# Budgets
./fennoa.sh get_budgets
cat budget.json | ./fennoa.sh create_budget
cat budget.json | ./fennoa.sh update_budget 42

./fennoa.sh help   # full command reference
```

---

## C — Claude Code Skill

Install once, use from any Claude Code session via `/fennoa`. No MCP config or running process needed.

### Install

```bash
mkdir -p ~/.claude/skills/fennoa
cp skill/fennoa.md ~/.claude/skills/fennoa/SKILL.md
```

### Usage

```
/fennoa show me all purchase invoices from Q1 2025
/fennoa what is the balance on account 1910?
/fennoa post a journal entry for a 100€ office supply purchase
```

Claude will use `fennoa.sh` if available, or fall back to direct curl calls.

---

## Authentication

All approaches use the same credentials:

- `FENNOA_API_KEY` — API key from Fennoa settings
- `FENNOA_COMPANY_CODE` — your company's identifier
- `FENNOA_BASE_URL` — optional, defaults to `https://app.fennoa.com`

See [SKILL.md](./SKILL.md) for full API reference, key concepts, and workflow examples.
