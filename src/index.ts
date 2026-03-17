#!/usr/bin/env node
/**
 * Fennoa Accounting API — MCP Server
 *
 * Exposes all Fennoa Accounting API endpoints as Model Context Protocol tools,
 * usable from Claude Code, Claude Desktop, VS Code Copilot, and any MCP-compatible agent.
 *
 * Config via environment variables:
 *   FENNOA_API_KEY        – required
 *   FENNOA_COMPANY_CODE   – required
 *   FENNOA_BASE_URL       – optional, default https://app.fennoa.com
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { clientFromEnv } from "./fennoa-client.js";

const server = new McpServer({
  name: "fennoa-accounting",
  version: "1.0.0",
});

const client = clientFromEnv();

// ── Periods & Locking ────────────────────────────────────────────────────────

server.tool(
  "get_periods",
  "List all accounting periods with their start and end dates",
  {},
  async () => {
    const data = await client.getPeriods();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_locking_periods",
  "Get the lock dates for accounting, sales invoices, and purchase invoices. Entries before these dates cannot be modified.",
  {},
  async () => {
    const data = await client.getLockingPeriods();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_opening_balances",
  "Fetch opening balances for a given accounting period, optionally filtered by account codes",
  {
    period_id: z.number().int().positive().describe("Accounting period ID (from get_periods)"),
    accounts: z.string().optional().describe("Comma-separated account codes, e.g. '1900,1910'"),
  },
  async ({ period_id, accounts }) => {
    const data = await client.getOpeningBalances(period_id, accounts);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Accounts & VAT ───────────────────────────────────────────────────────────

server.tool(
  "get_accounts",
  "List all chart of accounts entries, or fetch specific accounts by code. Returns account names (FI/SV/EN), VAT code associations, and active status.",
  {
    accounts: z.string().optional().describe("Comma-separated account codes to filter, e.g. '1900,1910'. Omit to get all accounts."),
  },
  async ({ accounts }) => {
    const data = await client.getAccounts(accounts);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_vatcodes",
  "List all available VAT codes with their IDs, types (sales/purchases), and names. Use IDs when creating accounting statements.",
  {},
  async () => {
    const data = await client.getVatCodes();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Ledger ───────────────────────────────────────────────────────────────────

server.tool(
  "get_account_balance",
  "Fetch the debit and credit balance of a single account at a specific date, optionally filtered by dimensions",
  {
    account: z.number().int().positive().describe("Account number, e.g. 1910"),
    date: z.string().describe("Date in YYYY-MM-DD format"),
    dimensions: z.string().optional().describe("Dimension filter, e.g. 'dim1:100'"),
  },
  async ({ account, date, dimensions }) => {
    const data = await client.getAccountBalance(account, date, dimensions);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_ledger",
  "Fetch paginated ledger entries for a date range. Supports filtering by accounts, dimension, and journal series. Returns statement details with opening/closing balances and links to source documents.",
  {
    start_date: z.string().describe("Start date in YYYY-MM-DD format"),
    end_date: z.string().describe("End date in YYYY-MM-DD format"),
    accounts: z.string().optional().describe("Comma-separated account codes, e.g. '1900,1910'"),
    series: z.string().optional().describe("Journal series filter: 1=GL, 2=IN, 3=PU, 5=PJ, 16=CA, 40=TI"),
    dimensions: z.string().optional().describe("Dimension filter, e.g. 'dim1:100'"),
    page: z.number().int().positive().optional().default(1).describe("Page number (default 1)"),
    limit: z.number().int().min(1).max(500).optional().default(100).describe("Items per page, 1–500 (default 100)"),
  },
  async ({ start_date, end_date, accounts, series, dimensions, page, limit }) => {
    const data = await client.getLedger({ startDate: start_date, endDate: end_date, accounts, series, dimensions, page, limit });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Statements ───────────────────────────────────────────────────────────────

server.tool(
  "add_statement",
  "Create a new accounting statement (journal entry). Debits and credits must balance across all rows. Returns the new statement ID and number.",
  {
    entry_date: z.string().optional().describe("Entry date YYYY-MM-DD (defaults to today)"),
    series_code: z.string().optional().describe("Journal series: CA, GL, GL2–GL6, PU. Defaults to GL. Use PU for purchase invoices."),
    description: z.string().optional().describe("Statement-level description"),
    purchase_invoice_id: z.number().int().optional().describe("Required when series_code is PU"),
    rows: z.array(z.object({
      account: z.number().int().describe("Account number"),
      debit: z.number().optional().describe("Debit amount (max 2 decimals). Provide either debit or credit, not both."),
      credit: z.number().optional().describe("Credit amount (max 2 decimals). Provide either debit or credit, not both."),
      description: z.string().optional().describe("Row-level description"),
      vatcode_id: z.number().int().optional().describe("VAT code ID (from get_vatcodes)"),
      dimensions: z.record(z.string(), z.string()).optional().describe("Dimension codes keyed by dimension type ID, e.g. {\"1\": \"100\"}"),
      accrual_start: z.string().optional().describe("Accrual start date YYYY-MM-DD"),
      accrual_count: z.number().int().optional().describe("Number of accrual periods"),
    })).min(2).describe("Minimum 2 rows required. Total debits must equal total credits."),
  },
  async ({ entry_date, series_code, description, purchase_invoice_id, rows }) => {
    const data = await client.addStatement({
      entryDate: entry_date,
      seriesCode: series_code,
      description,
      purchaseInvoiceId: purchase_invoice_id,
      rows: rows.map(r => ({
        account: r.account,
        debit: r.debit,
        credit: r.credit,
        description: r.description,
        vatcodeId: r.vatcode_id,
        dimensions: r.dimensions,
        accrualStart: r.accrual_start,
        accrualCount: r.accrual_count,
      })),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "upload_attachment",
  "Attach a file (PDF, JPEG, or PNG) to an existing accounting statement by its ID",
  {
    statement_id: z.number().int().positive().describe("Statement ID to attach the file to"),
    file_base64: z.string().describe("File content encoded as base64"),
    filename: z.string().describe("Original filename including extension, e.g. 'receipt.pdf'"),
    mime_type: z.string().describe("MIME type: 'application/pdf', 'image/jpeg', or 'image/png'"),
  },
  async ({ statement_id, file_base64, filename, mime_type }) => {
    const buf = Buffer.from(file_base64, "base64");
    const fileBytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    const data = await client.uploadAttachment(statement_id, fileBytes, filename, mime_type);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Budgets ──────────────────────────────────────────────────────────────────

server.tool(
  "get_budgets",
  "Fetch all budgets, optionally filtered by accounting period. Returns full budget hierarchy with monthly breakdowns.",
  {
    accounting_period_id: z.number().int().positive().optional().describe("Filter by accounting period ID (from get_periods)"),
  },
  async ({ accounting_period_id }) => {
    const data = await client.getBudgets(accounting_period_id);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "create_budget",
  "Create a new budget for an accounting period. You can specify either a period_total_sum (distributed evenly across months) or per-month values. Supports dimension-level budgets.",
  {
    name: z.string().describe("Budget name"),
    accounting_period_id: z.number().int().positive().describe("Accounting period ID (from get_periods)"),
    accounts: z.array(z.object({
      code: z.string().describe("Account code"),
      period_total_sum: z.number().optional().describe("Total for the period — automatically distributed evenly across months"),
      months: z.array(z.object({
        month: z.number().int().min(1).max(12).describe("Period month number (1 = first month of the accounting period)"),
        sum: z.number().describe("Budget sum for this month"),
      })).optional().describe("Per-month budget values (alternative to period_total_sum)"),
      dimensions: z.array(z.object({
        dimension_id: z.number().int().describe("Dimension type ID"),
        period_total_sum: z.number().optional(),
        months: z.array(z.object({
          month: z.number().int().min(1).max(12),
          sum: z.number(),
        })).optional(),
      })).optional().describe("Dimension-level budget breakdowns"),
    })).describe("Budget accounts list"),
  },
  async ({ name, accounting_period_id, accounts }) => {
    const data = await client.createBudget({ name, accountingPeriodId: accounting_period_id, accounts });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_budget",
  "Update an existing budget. NOTE: You must include ALL accounts with ALL previously submitted months — any omitted data will be cleared.",
  {
    budget_id: z.number().int().positive().describe("Budget ID to update (from get_budgets)"),
    name: z.string().describe("Budget name"),
    accounting_period_id: z.number().int().positive().describe("Accounting period ID"),
    accounts: z.array(z.object({
      code: z.string().describe("Account code"),
      period_total_sum: z.number().optional(),
      months: z.array(z.object({
        month: z.number().int().min(1).max(12),
        sum: z.number(),
      })).optional(),
      dimensions: z.array(z.object({
        dimension_id: z.number().int(),
        period_total_sum: z.number().optional(),
        months: z.array(z.object({
          month: z.number().int().min(1).max(12),
          sum: z.number(),
        })).optional(),
      })).optional(),
    })).describe("Complete account list — partial updates are not supported"),
  },
  async ({ budget_id, name, accounting_period_id, accounts }) => {
    const data = await client.updateBudget(budget_id, { name, accountingPeriodId: accounting_period_id, accounts });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ── Start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
