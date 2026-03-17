#!/usr/bin/env bash
# fennoa.sh — Bash wrapper for the Fennoa Accounting API
# Docs: https://tietopankki.fennoa.com/api-accounting
#
# Usage: ./fennoa.sh <command> [args...]
#
# Auth via environment variables:
#   export FENNOA_API_KEY=your_api_key
#   export FENNOA_COMPANY_CODE=your_company_code
#   export FENNOA_BASE_URL=https://app.fennoa.com  # optional

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────

BASE_URL="${FENNOA_BASE_URL:-https://app.fennoa.com}"
API_KEY="${FENNOA_API_KEY:-}"
COMPANY="${FENNOA_COMPANY_CODE:-}"

if [[ -z "$API_KEY" || -z "$COMPANY" ]]; then
  # Try loading from .env in current directory or script directory
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  for env_file in ".env" "$SCRIPT_DIR/.env"; do
    if [[ -f "$env_file" ]]; then
      set -a; source "$env_file"; set +a
      API_KEY="${FENNOA_API_KEY:-}"
      COMPANY="${FENNOA_COMPANY_CODE:-}"
      BASE_URL="${FENNOA_BASE_URL:-https://app.fennoa.com}"
      break
    fi
  done
fi

if [[ -z "$API_KEY" || -z "$COMPANY" ]]; then
  echo "ERROR: FENNOA_API_KEY and FENNOA_COMPANY_CODE must be set (env vars or .env file)" >&2
  exit 1
fi

ROOT="$BASE_URL/$COMPANY/accounting_api"
AUTH="Authorization: Token token=$API_KEY"

# ── Helpers ──────────────────────────────────────────────────────────────────

get() {
  curl -sf -H "$AUTH" "$ROOT/$1"
}

post_form() {
  local path="$1"; shift
  curl -sf -H "$AUTH" -X POST "$ROOT/$path" "$@"
}

post_json() {
  local path="$1"
  curl -sf -H "$AUTH" -H "Content-Type: application/json" -X POST "$ROOT/$path" -d @-
}

patch_json() {
  local path="$1"
  curl -sf -H "$AUTH" -H "Content-Type: application/json" -X PATCH "$ROOT/$path" -d @-
}

usage() {
  cat <<EOF
Fennoa Accounting API wrapper

REFERENCE DATA
  get_periods
  get_locking_periods
  get_vatcodes
  get_accounts [account_codes]        e.g. get_accounts 1900,1910
  get_opening_balances <period_id> [accounts]
  get_account_balance <account> <date> [dimensions]
                                      e.g. get_account_balance 1910 2024-12-31
                                           get_account_balance 1910 2024-12-31 dim1:100

LEDGER
  get_ledger <start> <end> [opts]     e.g. get_ledger 2025-01-01 2025-12-31
    --accounts 1900,1910
    --series   1              (1=GL 2=IN 3=PU 5=PJ 16=CA 40=TI)
    --dim      dim1:100
    --page     1
    --limit    100            (max 500)

WRITE (reads JSON from stdin unless noted)
  add_statement                       echo '{...}' | ./fennoa.sh add_statement
  upload_attachment <statement_id> <file_path>
  create_budget                       cat budget.json | ./fennoa.sh create_budget
  update_budget <budget_id>           cat budget.json | ./fennoa.sh update_budget 42

BUDGETS
  get_budgets [period_id]

AUTH
  Set FENNOA_API_KEY + FENNOA_COMPANY_CODE as env vars or in .env file.
EOF
}

# ── Commands ─────────────────────────────────────────────────────────────────

CMD="${1:-}"
shift || true

case "$CMD" in

  # ── Reference data ────────────────────────────────────────────────────────

  get_periods)
    get "get/periods"
    ;;

  get_locking_periods)
    get "get/locking_periods"
    ;;

  get_vatcodes)
    get "get/vatcodes"
    ;;

  get_accounts)
    ACCTS="${1:-}"
    if [[ -n "$ACCTS" ]]; then
      get "get/accounts/$ACCTS"
    else
      get "get/accounts"
    fi
    ;;

  get_opening_balances)
    PERIOD_ID="${1:?Usage: get_opening_balances <period_id> [accounts]}"
    ACCTS="${2:-}"
    if [[ -n "$ACCTS" ]]; then
      get "get/opening_balances/$PERIOD_ID/$ACCTS"
    else
      get "get/opening_balances/$PERIOD_ID"
    fi
    ;;

  get_account_balance)
    ACCOUNT="${1:?Usage: get_account_balance <account> <date> [dimensions]}"
    DATE="${2:?Usage: get_account_balance <account> <date> [dimensions]}"
    DIMS="${3:-}"
    if [[ -n "$DIMS" ]]; then
      get "get/account_balance/$ACCOUNT/$DATE/$DIMS"
    else
      get "get/account_balance/$ACCOUNT/$DATE"
    fi
    ;;

  # ── Ledger ────────────────────────────────────────────────────────────────

  get_ledger)
    START="${1:?Usage: get_ledger <start_date> <end_date> [--accounts X] [--series X] [--dim X] [--page N] [--limit N]}"
    END="${2:?Usage: get_ledger <start_date> <end_date>}"
    shift 2

    ACCOUNTS="" SERIES="" DIM="" PAGE=1 LIMIT=100
    while [[ $# -gt 0 ]]; do
      case "$1" in
        --accounts) ACCOUNTS="$2"; shift 2 ;;
        --series)   SERIES="$2";   shift 2 ;;
        --dim)      DIM="$2";      shift 2 ;;
        --page)     PAGE="$2";     shift 2 ;;
        --limit)    LIMIT="$2";    shift 2 ;;
        *) echo "Unknown option: $1" >&2; exit 1 ;;
      esac
    done

    FILTERS=""
    [[ -n "$ACCOUNTS" ]] && FILTERS+="/accounts:$ACCOUNTS"
    [[ -n "$SERIES" ]]   && FILTERS+="/series:$SERIES"
    [[ -n "$DIM" ]]      && FILTERS+="/$DIM"

    get "get/ledger/$START/$END$FILTERS?page=$PAGE&limit=$LIMIT"
    ;;

  # ── Write: statements ─────────────────────────────────────────────────────

  add_statement)
    # Reads JSON from stdin and converts to form-encoded data
    # JSON format:
    # {
    #   "entry_date": "2025-01-15",       -- optional
    #   "series_code": "GL",              -- optional
    #   "description": "Cash purchase",   -- optional
    #   "purchase_invoice_id": 123,       -- required when series_code=PU
    #   "rows": [
    #     { "account": 1910, "credit": 100.00, "description": "Bank" },
    #     { "account": 4000, "debit": 100.00, "vatcode_id": 1 }
    #   ]
    # }
    JSON=$(cat)
    FORM_ARGS=()

    entry_date=$(echo "$JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('entry_date',''))" 2>/dev/null || true)
    series_code=$(echo "$JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('series_code',''))" 2>/dev/null || true)
    description=$(echo "$JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('description',''))" 2>/dev/null || true)
    purchase_invoice_id=$(echo "$JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('purchase_invoice_id',''))" 2>/dev/null || true)

    [[ -n "$entry_date" ]]         && FORM_ARGS+=(-F "entry_date=$entry_date")
    [[ -n "$series_code" ]]        && FORM_ARGS+=(-F "statement_series_code=$series_code")
    [[ -n "$description" ]]        && FORM_ARGS+=(-F "description=$description")
    [[ -n "$purchase_invoice_id" ]] && FORM_ARGS+=(-F "purchase_invoice_id=$purchase_invoice_id")

    # Build row fields
    ROW_FIELDS=$(echo "$JSON" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for i, row in enumerate(d.get('rows', [])):
    for k in ('account','debit','credit','description','accrual_start','accrual_count'):
        if k in row:
            print(f'row[{i}][{k}]={row[k]}')
    if 'vatcode_id' in row:
        print(f'row[{i}][vatcode]={row[\"vatcode_id\"]}')
    for dim_id, code in (row.get('dimensions') or {}).items():
        print(f'row[{i}][dim_{dim_id}]={code}')
")

    while IFS='=' read -r key val; do
      [[ -n "$key" ]] && FORM_ARGS+=(-F "$key=$val")
    done <<< "$ROW_FIELDS"

    post_form "add" "${FORM_ARGS[@]}"
    ;;

  upload_attachment)
    STATEMENT_ID="${1:?Usage: upload_attachment <statement_id> <file_path>}"
    FILE="${2:?Usage: upload_attachment <statement_id> <file_path>}"
    [[ -f "$FILE" ]] || { echo "ERROR: File not found: $FILE" >&2; exit 1; }
    post_form "do/upload_attachment/$STATEMENT_ID" -F "file=@$FILE"
    ;;

  # ── Budgets ───────────────────────────────────────────────────────────────

  get_budgets)
    PERIOD="${1:-}"
    if [[ -n "$PERIOD" ]]; then
      get "get/budgets?accountingPeriodId=$PERIOD"
    else
      get "get/budgets"
    fi
    ;;

  create_budget)
    # Reads JSON from stdin
    # { "name": "...", "accounting_period_id": 1, "accounts": [...] }
    post_json "add/budgets"
    ;;

  update_budget)
    BUDGET_ID="${1:?Usage: update_budget <budget_id>  (JSON from stdin)}"
    patch_json "budgets/$BUDGET_ID"
    ;;

  # ── Help ──────────────────────────────────────────────────────────────────

  help|--help|-h|"")
    usage
    ;;

  *)
    echo "Unknown command: $CMD" >&2
    usage >&2
    exit 1
    ;;

esac
