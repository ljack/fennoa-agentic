# Fennoa Accounting API — Agent Skill

Tämä dokumentti kattaa kaikki kolme tapaa käyttää Fennoa Accounting APIa agenttisesti.
API docs: https://tietopankki.fennoa.com/api-accounting

---

## Kolme käyttötapaa

```
┌─────────────────────────────────────────────────────────────────┐
│                      FENNOA API                                 │
│              https://app.fennoa.com                             │
└──────────────────────┬──────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   [A] MCP       [B] fennoa.sh   [C] Skill
   Server        Bash wrapper    ~/.claude/skills/fennoa.md

   Paras kun:     Paras kun:      Paras kun:
   - Ohjelmoitu   - CLI-käyttö    - Ad hoc kysymykset
     integraatio  - CI/CD         - Claude Codesta
   - Jatkuva      - Skriptit      - Ei asennuksia
     käyttö       - Nopea testi   - Kontekstiavustus
```

---

## A — MCP Server (Node.js)

Käynnistyy taustaprosessina, Claude käyttää strukturoituja tool-kutsuja.

### Asennus

```bash
cd fennoa-agentic
npm install && npm run build
```

### Konfigurointi Claude Codeen (`~/.claude.json`)

```json
{
  "mcpServers": {
    "fennoa": {
      "command": "node",
      "args": ["/Users/jarkko/_dev/fennoa-agentic/dist/index.js"],
      "env": {
        "FENNOA_API_KEY": "your_api_key",
        "FENNOA_COMPANY_CODE": "your_company_code"
      }
    }
  }
}
```

### Konfigurointi Claude Desktopiin (`claude_desktop_config.json`)

```json
{
  "mcpServers": {
    "fennoa": {
      "command": "node",
      "args": ["/Users/jarkko/_dev/fennoa-agentic/dist/index.js"],
      "env": {
        "FENNOA_API_KEY": "your_api_key",
        "FENNOA_COMPANY_CODE": "your_company_code"
      }
    }
  }
}
```

### Kehityskäyttö (ilman buildia)

```json
{
  "mcpServers": {
    "fennoa": {
      "command": "npx",
      "args": ["tsx", "/Users/jarkko/_dev/fennoa-agentic/src/index.ts"],
      "env": {
        "FENNOA_API_KEY": "your_api_key",
        "FENNOA_COMPANY_CODE": "your_company_code"
      }
    }
  }
}
```

### Käyttö

Claude käyttää tooleja automaattisesti: `get_ledger`, `add_statement`, jne. Ei erityistä syntaksia.

---

## B — Bash Wrapper (`fennoa.sh`)

Curl-pohjainen wrapper, ei vaadi Node.js:ää. Toimii suoraan terminaalista tai Claude Coden Bash-toolista.

### Autentikointi

```bash
export FENNOA_API_KEY=your_api_key
export FENNOA_COMPANY_CODE=your_company_code

# TAI .env-tiedostolla (haetaan automaattisesti)
cp .env.example .env && vi .env
```

### Komennot

```bash
# Referenssidata
./fennoa.sh get_periods
./fennoa.sh get_locking_periods
./fennoa.sh get_accounts
./fennoa.sh get_accounts 1900,1910
./fennoa.sh get_vatcodes
./fennoa.sh get_opening_balances 2          # period_id=2
./fennoa.sh get_account_balance 1910 2025-12-31
./fennoa.sh get_account_balance 1910 2025-12-31 dim1:100

# Tiliote
./fennoa.sh get_ledger 2025-01-01 2025-12-31
./fennoa.sh get_ledger 2025-01-01 2025-12-31 --accounts 1900,1910
./fennoa.sh get_ledger 2025-01-01 2025-12-31 --series 3 --page 2 --limit 500

# Kirjaukset (JSON stdinistä)
echo '{"entry_date":"2025-03-17","rows":[...]}' | ./fennoa.sh add_statement
./fennoa.sh upload_attachment 1234 receipt.pdf

# Budjetit
./fennoa.sh get_budgets
./fennoa.sh get_budgets 2
cat budget.json | ./fennoa.sh create_budget
cat budget.json | ./fennoa.sh update_budget 42
```

### add_statement JSON-rakenne

```json
{
  "entry_date": "2025-03-17",
  "series_code": "GL",
  "description": "Toimistokulut",
  "rows": [
    { "account": 4400, "debit": 121.00, "vatcode_id": 1 },
    { "account": 1910, "credit": 121.00 }
  ]
}
```

---

## C — Claude Code Skill (installable)

Asennetaan kerran, käytettävissä kaikista projekteista ilman MCP-konfiguraatiota tai erillistä prosessia.

### Asennus

```bash
mkdir -p ~/.claude/skills/fennoa
cp /Users/jarkko/_dev/fennoa-agentic/skill/fennoa.md ~/.claude/skills/fennoa/SKILL.md
```

### Käyttö Claude Codessa

```
/fennoa show me all purchase invoices from Q1 2025
/fennoa what is the balance on account 1910?
/fennoa post a journal entry for a 100€ office supply purchase
```

### Miten se toimii

Skill lataa `~/.claude/skills/fennoa/SKILL.md`-tiedoston kontekstiksi. Claude ymmärtää Fennoa-APIa ja käyttää joko `fennoa.sh`-wrapperia (jos löytyy) tai suoria curl-kutsuja Bash-toolilla. Ei vaadi MCP-serveriä tai Node.js-prosessia.

Claudella on myös mahdollisuus aktivoida skill **automaattisesti** ilman `/fennoa`-komentoa, jos `description`-kenttä vastaa käyttäjän pyyntöä (esim. "kirjanpito", "tiliote").

### Päivitys

```bash
cp /Users/jarkko/_dev/fennoa-agentic/skill/fennoa.md ~/.claude/skills/fennoa/SKILL.md
```

### Ero skilliin vs subagentiin

- **Skill** (`~/.claude/skills/fennoa/SKILL.md`): toimii pääkeskustelun sisällä, ei omaa kontekstia
- **Subagent** (`~/.claude/agents/fennoa/AGENT.md`): oma eriytetty context window, Claude delegoi sille — parempi pitkiin itsenäisiin tehtäviin

---

## API-referenssi

### Autentikointi

- Header: `Authorization: Token token=<api_key>`
- URL-rakenne: `https://app.fennoa.com/<company_code>/accounting_api/<endpoint>`
- Virheelliset tunnukset → 401

### Endpointit

| Tool / Komento | Method | Polku |
|---|---|---|
| `get_periods` | GET | `/get/periods` |
| `get_locking_periods` | GET | `/get/locking_periods` |
| `get_accounts` | GET | `/get/accounts[/codes]` |
| `get_vatcodes` | GET | `/get/vatcodes` |
| `get_opening_balances` | GET | `/get/opening_balances/<period_id>[/accounts]` |
| `get_account_balance` | GET | `/get/account_balance/<acct>/<date>[/dims]` |
| `get_ledger` | GET | `/get/ledger/<start>/<end>[/filters]?page=&limit=` |
| `add_statement` | POST | `/add` (form-encoded) |
| `upload_attachment` | POST | `/do/upload_attachment/<id>` (multipart) |
| `get_budgets` | GET | `/get/budgets[?accountingPeriodId=]` |
| `create_budget` | POST | `/add/budgets` (JSON) |
| `update_budget` | PATCH | `/budgets/<id>` (JSON, full replace) |

### Kirjaussarjat (series)

| Koodi | ID | Kuvaus |
|---|---|---|
| GL | 1 | Yleinen päiväkirja (oletus) |
| IN | 2 | Myyntilaskut |
| PU | 3 | Ostolaskut — vaatii `purchase_invoice_id` |
| PJ | 5 | Pankkikirjaukset |
| CA | 16 | Käteinen |
| TI | 40 | Automaattiset kirjaukset |

### Yleiset ALV-koodit (Suomi)

| ID | Tyyppi | Prosentti |
|---|---|---|
| 11 | Myynti | 24% |
| 63 | Myynti | 25,5% |
| 1 | Ostot | 24% |
| 58 | Ostot | 25,5% |

### Kirjaussäännöt

- Vähintään 2 riviä per kirjaus
- Jokaisella rivillä joko `debit` TAI `credit`, ei kumpaakin
- Debet-summa = Kredit-summa (täsmäytettävä tasan)
- Max 2 desimaalia summissa

### Tiliotehaun sivutus

- Oletukset: `page=1`, `limit=100`
- Maksimi: `limit=500`
- Tarkista `pagination.pagesCount` — hae kaikki sivut täydelliseen analyysiin

### Dimensiot

Muoto URL:issa: `dim{type_id}:{code}` — esim. `dim1:100`
Kirjausriveillä: `dimensions: { "1": "100" }`

### Budjettikuukaudet

`month`-arvo viittaa **tilikauden kuukausinumeroon**, ei kalenterikuukauteen. Jos tilikausi alkaa huhtikuussa, `month: 1` = huhtikuu.
