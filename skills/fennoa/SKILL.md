---
name: fennoa
description: Use the Fennoa Accounting API to read ledger data, post journal entries, attach receipts, and manage budgets. Triggers on "fennoa", "kirjanpito", "tiliote", or any request involving Fennoa accounting data.
---

You are working with the **Fennoa Accounting API**. Full docs: https://tietopankki.fennoa.com/api-accounting

## Authentication

Credentials come from environment variables. Check for them before any API call:
```bash
echo "API_KEY set: ${FENNOA_API_KEY:+yes}" && echo "COMPANY set: ${FENNOA_COMPANY_CODE:+yes}"
```

If not set, look for a `.env` file in the current project or in `~/dev/fennoa-agentic/.env` and ask the user to set the variables.

**Base URL pattern:** `https://app.fennoa.com/{COMPANY_CODE}/accounting_api/...`
**Auth header:** `Authorization: Token token={API_KEY}`

## Two Ways to Call the API

### Option 1 — Bash wrapper (preferred if available)

Check if the wrapper exists:
```bash
ls ~/dev/fennoa-agentic/fennoa.sh 2>/dev/null && echo "wrapper available"
```

If available, use it directly:
```bash
FENNOA_API_KEY=... FENNOA_COMPANY_CODE=... ~/dev/fennoa-agentic/fennoa.sh get_periods
```

Or with a .env file present in that directory, just:
```bash
~/dev/fennoa-agentic/fennoa.sh get_ledger 2025-01-01 2025-12-31
```

### Option 2 — Direct curl

```bash
BASE="https://app.fennoa.com/${FENNOA_COMPANY_CODE}/accounting_api"
AUTH="Authorization: Token token=${FENNOA_API_KEY}"

# GET example
curl -sf -H "$AUTH" "$BASE/get/periods"

# POST JSON example
curl -sf -H "$AUTH" -H "Content-Type: application/json" -X POST "$BASE/add/budgets" -d '{...}'
```

---

## All Available Operations

### Read-only (safe to call freely)

| What | Bash wrapper | curl path |
|------|-------------|-----------|
| List accounting periods | `get_periods` | `GET /get/periods` |
| Get lock dates | `get_locking_periods` | `GET /get/locking_periods` |
| List accounts | `get_accounts [codes]` | `GET /get/accounts[/1900,1910]` |
| List VAT codes | `get_vatcodes` | `GET /get/vatcodes` |
| Get opening balances | `get_opening_balances <period_id>` | `GET /get/opening_balances/{id}` |
| Account balance at date | `get_account_balance <acct> <date>` | `GET /get/account_balance/{acct}/{date}` |
| Ledger entries | `get_ledger <start> <end> [opts]` | `GET /get/ledger/{start}/{end}?page=1&limit=100` |
| List budgets | `get_budgets [period_id]` | `GET /get/budgets` |

### Write operations (confirm intent before executing)

| What | Bash wrapper | Notes |
|------|-------------|-------|
| Create journal entry | `add_statement` (JSON stdin) | Debits must equal credits |
| Attach file to statement | `upload_attachment <id> <file>` | PDF/JPEG/PNG |
| Create budget | `create_budget` (JSON stdin) | |
| Update budget | `update_budget <id>` (JSON stdin) | Full replace, not partial |

---

## Key Rules

**Journal entries (`add_statement`):**
- Minimum 2 rows
- Each row has **either** `debit` or `credit`, never both
- Total debits must exactly equal total credits
- Max 2 decimal places

**Ledger pagination:**
- Always check `pagination.pagesCount` — fetch all pages for full analysis
- Max `limit` is 500

**Ledger series codes:**
- `1`=GL (general ledger), `2`=IN (sales invoices), `3`=PU (purchase invoices)
- `5`=PJ (bank), `16`=CA (cash), `40`=TI (automated)

**Budget months:**
- `month: 1` = first month of the *accounting period*, not January

**Locking:** Check `get_locking_periods` before posting entries — cannot modify entries before lock dates.

---

## Common Workflows

### "Show me all transactions for Q1 2025"
```bash
./fennoa.sh get_ledger 2025-01-01 2025-03-31 --page 1 --limit 500
# If pagesCount > 1, loop through all pages
```

### "What's the balance on account 1910 today?"
```bash
./fennoa.sh get_account_balance 1910 $(date +%Y-%m-%d)
```

### "Post a receipt as a journal entry"
1. Check accounts: `./fennoa.sh get_accounts`
2. Check VAT codes: `./fennoa.sh get_vatcodes`
3. Create statement:
```json
{
  "entry_date": "2025-03-17",
  "series_code": "GL",
  "description": "Office supplies",
  "rows": [
    { "account": 4400, "debit": 121.00, "vatcode_id": 1, "description": "Office supplies incl. VAT" },
    { "account": 1910, "credit": 121.00, "description": "Bank payment" }
  ]
}
```
```bash
echo '{...}' | ./fennoa.sh add_statement
```
4. Attach receipt: `./fennoa.sh upload_attachment <statement_id> receipt.pdf`

### "Analyze budget vs actuals"
```bash
# Get current period
./fennoa.sh get_periods

# Get budget
./fennoa.sh get_budgets <period_id>

# Get actuals from ledger
./fennoa.sh get_ledger <period_start> <period_end> --limit 500
```
