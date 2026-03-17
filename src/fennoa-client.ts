/**
 * Fennoa Accounting API HTTP client
 * Docs: https://tietopankki.fennoa.com/api-accounting
 */

export interface FennoaConfig {
  apiKey: string;
  companyCode: string;
  baseUrl?: string;
}

export class FennoaClient {
  private baseUrl: string;
  private companyCode: string;
  private authHeader: string;

  constructor(config: FennoaConfig) {
    this.baseUrl = (config.baseUrl ?? "https://app.fennoa.com").replace(/\/$/, "");
    this.companyCode = config.companyCode;
    this.authHeader = `Token token=${config.apiKey}`;
  }

  private url(path: string): string {
    return `${this.baseUrl}/${this.companyCode}${path}`;
  }

  private async get(path: string): Promise<unknown> {
    const res = await fetch(this.url(path), {
      headers: { Authorization: this.authHeader },
    });
    return res.json();
  }

  private async post(path: string, body: FormData | string, contentType?: string): Promise<unknown> {
    const headers: Record<string, string> = { Authorization: this.authHeader };
    if (contentType) headers["Content-Type"] = contentType;
    const res = await fetch(this.url(path), { method: "POST", headers, body });
    return res.json();
  }

  private async patch(path: string, body: string): Promise<unknown> {
    const res = await fetch(this.url(path), {
      method: "PATCH",
      headers: { Authorization: this.authHeader, "Content-Type": "application/json" },
      body,
    });
    return res.json();
  }

  // ── Periods & locking ────────────────────────────────────────────────────

  getPeriods() {
    return this.get("/accounting_api/get/periods");
  }

  getLockingPeriods() {
    return this.get("/accounting_api/get/locking_periods");
  }

  getOpeningBalances(periodId: number, accounts?: string) {
    const path = accounts
      ? `/accounting_api/get/opening_balances/${periodId}/${accounts}`
      : `/accounting_api/get/opening_balances/${periodId}`;
    return this.get(path);
  }

  // ── Accounts & VAT ───────────────────────────────────────────────────────

  getAccounts(accounts?: string) {
    const path = accounts
      ? `/accounting_api/get/accounts/${accounts}`
      : "/accounting_api/get/accounts";
    return this.get(path);
  }

  getVatCodes() {
    return this.get("/accounting_api/get/vatcodes");
  }

  // ── Ledger ───────────────────────────────────────────────────────────────

  getAccountBalance(account: number, date: string, dimensions?: string) {
    const path = dimensions
      ? `/accounting_api/get/account_balance/${account}/${date}/${dimensions}`
      : `/accounting_api/get/account_balance/${account}/${date}`;
    return this.get(path);
  }

  getLedger(params: {
    startDate: string;
    endDate: string;
    accounts?: string;
    series?: string;
    dimensions?: string;
    page?: number;
    limit?: number;
  }) {
    const { startDate, endDate, accounts, series, dimensions, page = 1, limit = 100 } = params;

    let filters = "";
    if (accounts) filters += `/accounts:${accounts}`;
    if (series) filters += `/series:${series}`;
    if (dimensions) filters += `/${dimensions}`;

    return this.get(
      `/accounting_api/get/ledger/${startDate}/${endDate}${filters}?page=${page}&limit=${limit}`
    );
  }

  // ── Statements ───────────────────────────────────────────────────────────

  addStatement(params: {
    entryDate?: string;
    seriesCode?: string;
    description?: string;
    purchaseInvoiceId?: number;
    rows: Array<{
      account: number;
      debit?: number;
      credit?: number;
      description?: string;
      vatcodeId?: number;
      dimensions?: Record<string, string>;
      accrualStart?: string;
      accrualCount?: number;
    }>;
  }) {
    const form = new URLSearchParams();
    if (params.entryDate) form.append("entry_date", params.entryDate);
    if (params.seriesCode) form.append("statement_series_code", params.seriesCode);
    if (params.description) form.append("description", params.description);
    if (params.purchaseInvoiceId) form.append("purchase_invoice_id", String(params.purchaseInvoiceId));

    params.rows.forEach((row, i) => {
      form.append(`row[${i}][account]`, String(row.account));
      if (row.debit !== undefined) form.append(`row[${i}][debit]`, String(row.debit));
      if (row.credit !== undefined) form.append(`row[${i}][credit]`, String(row.credit));
      if (row.description) form.append(`row[${i}][description]`, row.description);
      if (row.vatcodeId !== undefined) form.append(`row[${i}][vatcode]`, String(row.vatcodeId));
      if (row.accrualStart) form.append(`row[${i}][accrual_start]`, row.accrualStart);
      if (row.accrualCount !== undefined) form.append(`row[${i}][accrual_count]`, String(row.accrualCount));
      if (row.dimensions) {
        for (const [dimId, code] of Object.entries(row.dimensions)) {
          form.append(`row[${i}][dim_${dimId}]`, code);
        }
      }
    });

    return this.post(
      "/accounting_api/add",
      form.toString(),
      "application/x-www-form-urlencoded"
    );
  }

  uploadAttachment(statementId: number, fileContent: Uint8Array, filename: string, mimeType: string) {
    const form = new FormData();
    form.append("file", new Blob([fileContent.buffer as ArrayBuffer], { type: mimeType }), filename);
    return this.post(`/accounting_api/do/upload_attachment/${statementId}`, form);
  }

  // ── Budgets ──────────────────────────────────────────────────────────────

  createBudget(budget: {
    name: string;
    accountingPeriodId: number;
    accounts: BudgetAccount[];
  }) {
    return this.post(
      "/accounting_api/add/budgets",
      JSON.stringify({
        name: budget.name,
        accounting_period_id: budget.accountingPeriodId,
        accounts: budget.accounts,
      }),
      "application/json"
    );
  }

  updateBudget(budgetId: number, budget: {
    name: string;
    accountingPeriodId: number;
    accounts: BudgetAccount[];
  }) {
    return this.patch(
      `/accounting_api/budgets/${budgetId}`,
      JSON.stringify({
        name: budget.name,
        accounting_period_id: budget.accountingPeriodId,
        accounts: budget.accounts,
      })
    );
  }

  getBudgets(accountingPeriodId?: number) {
    const qs = accountingPeriodId ? `?accountingPeriodId=${accountingPeriodId}` : "";
    return this.get(`/accounting_api/get/budgets${qs}`);
  }
}

export interface BudgetAccount {
  code: string;
  period_total_sum?: number;
  months?: Array<{ month: number; sum: number }>;
  dimensions?: Array<{
    dimension_id: number;
    period_total_sum?: number;
    months?: Array<{ month: number; sum: number }>;
  }>;
}

export function clientFromEnv(): FennoaClient {
  const apiKey = process.env.FENNOA_API_KEY;
  const companyCode = process.env.FENNOA_COMPANY_CODE;
  if (!apiKey || !companyCode) {
    throw new Error("FENNOA_API_KEY and FENNOA_COMPANY_CODE environment variables are required");
  }
  return new FennoaClient({
    apiKey,
    companyCode,
    baseUrl: process.env.FENNOA_BASE_URL,
  });
}
