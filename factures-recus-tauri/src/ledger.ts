export type TxType = "expense" | "income" | "transfer";
export type Category = { id: string; name: string };
export type Wallet = { id: string; name: string; type: string; initial: number };
export type Transaction = {
  id: string; type: TxType; amount: number; date: string; category: string;
  wallet?: string; walletSrc?: string; walletDst?: string;
  note?: string; source?: string; attachments?: string[];
};
export type Receipt = { id: string; dataUrl: string; createdAt: string };
export type Ledger = {
  categories: Category[]; wallets: Wallet[];
  transactions: Transaction[]; receiptsInbox: Receipt[];
};

export const STORAGE_KEY = "fr-app-v1";
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "food", name: "Nourriture" }, { id: "transport", name: "Transport" },
  { id: "housing", name: "Logement" }, { id: "health", name: "Santé" },
  { id: "pro", name: "Pro" }, { id: "leisure", name: "Loisirs" },
  { id: "other", name: "Divers" },
];
export const DEFAULT_WALLETS: Wallet[] = [
  { id: "cash", name: "Cash", type: "cash", initial: 0 },
  { id: "om", name: "Orange Money", type: "om", initial: 0 },
  { id: "momo", name: "MTN MoMo", type: "momo", initial: 0 },
];
export function emptyLedger(): Ledger {
  return { categories: DEFAULT_CATEGORIES.map(c => ({ ...c })),
    wallets: DEFAULT_WALLETS.map(w => ({ ...w })), transactions: [], receiptsInbox: [] };
}

// XAF amounts are whole units. Never turn a minus sign or decimal into a larger amount.
export function parseAmount(input: string): number {
  const value = input.trim();
  if (!/^[+-]?(?:\d+|\d{1,3}(?:[ \u00a0\u202f]\d{3})+)$/.test(value)) return NaN;
  const amount = Number(value.replace(/[ \u00a0\u202f]/g, ""));
  return Number.isSafeInteger(amount) ? amount : NaN;
}

function ensure(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendar = new Date(0);
  calendar.setUTCFullYear(year, month - 1, day);
  return calendar.getUTCFullYear() === year && calendar.getUTCMonth() === month - 1 &&
    calendar.getUTCDate() === day && Number.isFinite(Date.parse(value));
}
function validImage(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/[^;,]+;base64,[A-Za-z0-9+/=\r\n]+$/.test(value);
}
function ids(rows: unknown, label: string, nonempty = false): Set<string> {
  ensure(Array.isArray(rows) && (!nonempty || rows.length > 0), `${label} : liste invalide ou vide.`);
  const result = new Set<string>();
  for (const row of rows) {
    ensure(row && typeof row === "object" && typeof row.id === "string" && row.id.trim() && !result.has(row.id),
      `${label} : identifiant absent ou en double.`);
    result.add(row.id);
  }
  return result;
}

// Validate the complete snapshot before either loading or replacing any part of the ledger.
export function validateLedger(value: unknown): Ledger {
  ensure(value && typeof value === "object", "Sauvegarde invalide.");
  const data = value as Ledger;
  const categories = ids(data.categories, "Catégories", true);
  const wallets = ids(data.wallets, "Portefeuilles", true);
  ids(data.transactions, "Opérations"); ids(data.receiptsInbox, "Reçus");
  for (const c of data.categories) ensure(typeof c.name === "string" && c.name.trim(), "Nom de catégorie invalide.");
  for (const w of data.wallets) {
    ensure(typeof w.name === "string" && w.name.trim() && typeof w.type === "string", "Portefeuille invalide.");
    ensure(Number.isSafeInteger(w.initial), "Solde initial invalide.");
  }
  for (const tx of data.transactions) {
    ensure(["income", "expense", "transfer"].includes(tx.type), "Type d'opération invalide.");
    ensure(Number.isSafeInteger(tx.amount) && tx.amount > 0, "Montant invalide : saisis un entier XAF strictement positif.");
    ensure(validDate(tx.date), "Date d'opération invalide.");
    if (tx.type === "transfer") {
      ensure(wallets.has(tx.walletSrc!) && wallets.has(tx.walletDst!) && tx.walletSrc !== tx.walletDst,
        "Transfert : choisis deux portefeuilles existants et différents.");
    } else {
      ensure(wallets.has(tx.wallet!), "Ce portefeuille est absent ou utilisé par une opération.");
      ensure(categories.has(tx.category), "Cette catégorie est absente ou utilisée par une opération.");
    }
    ensure(tx.note === undefined || typeof tx.note === "string", "Note invalide.");
    ensure(tx.source === undefined || typeof tx.source === "string", "Origine invalide.");
    ensure(tx.attachments === undefined || (Array.isArray(tx.attachments) && tx.attachments.every(validImage)), "Pièce jointe invalide.");
  }
  for (const r of data.receiptsInbox) ensure(validImage(r.dataUrl) && validDate(r.createdAt), "Reçu invalide.");
  ensure(Number.isSafeInteger(data.transactions.reduce((sum, tx) => sum + tx.amount, 0)), "Le total dépasse la précision des montants XAF.");
  calculateBalances(data);
  return data;
}

export type LedgerStorage = Pick<Storage, "getItem" | "setItem">;
export function readLedger(storage: LedgerStorage): { ledger: Ledger; error: string | null } {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return { ledger: raw === null ? emptyLedger() : validateLedger(JSON.parse(raw)), error: null };
  } catch {
    return { ledger: emptyLedger(), error: "Les données locales ne peuvent pas être lues. Elles sont conservées sans modification. Restaure une sauvegarde JSON valide depuis Export avant de saisir des opérations." };
  }
}
export function writeLedger(storage: LedgerStorage, ledger: Ledger): Ledger {
  validateLedger(ledger);
  // A single write holds operations and receipts together. A failed write must not advance the UI.
  storage.setItem(STORAGE_KEY, JSON.stringify(ledger));
  return ledger;
}

export function recordTransactions(ledger: Ledger, additions: Transaction[], receiptId: string | null = null): Ledger {
  if (receiptId) {
    const receipt = ledger.receiptsInbox.find(r => r.id === receiptId);
    ensure(receipt && additions.length === 1 && additions[0].attachments?.includes(receipt.dataUrl),
      "Le reçu à classer doit être joint à l'opération enregistrée.");
  }
  return validateLedger({ ...ledger, transactions: [...additions, ...ledger.transactions],
    receiptsInbox: receiptId ? ledger.receiptsInbox.filter(r => r.id !== receiptId) : ledger.receiptsInbox });
}

export function parseSMSDraft(text: string, ledger: Ledger) {
  const t = text.trim();
  if (!t) return null;
  const walletType = /orange|\bom\b/i.test(t) ? "om" : /mtn|momo/i.test(t) ? "momo" : null;
  const wallet = ledger.wallets.find(w => w.type === walletType)?.id ?? ledger.wallets[0].id;
  // A monetary value needs a currency or an explicit amount label; phone/reference numbers are not amounts.
  const number = "([+-]?(?:[0-9]{1,3}(?:[ .\\u00a0\\u202f][0-9]{3})+|[0-9]+))";
  const currency = "(?:XAF|F\\s*CFA|FCFA|F)\\b";
  const main = t.replace(/frais[^0-9+\-]*[+\-]?[0-9][0-9 .\u00a0\u202f]*(?:XAF|F\s*CFA|FCFA|F)?/gi, "");
  const labelled = main.match(new RegExp("(?:montant|somme|paiement(?: de)?|pay[ée]|reçu|envoy[ée]|transf[ée]r[ée])\\s*:?\\s*" + number + "\\s*" + currency, "i"));
  const monetary = Array.from(main.matchAll(new RegExp("(?<![0-9.,+\\-])" + number + "\\s*" + currency, "gi")));
  const match = labelled ?? (monetary.length === 1 ? monetary[0] : null);
  const feeMatch = t.match(new RegExp("frais[^0-9+\\-]*" + number, "i"));
  const amount = match ? parseAmount(match[1].replace(/\./g, " ")) : NaN;
  const fees = feeMatch ? parseAmount(feeMatch[1].replace(/\./g, " ")) : 0;
  ensure(Number.isSafeInteger(amount) && amount > 0 && Number.isSafeInteger(fees) && fees >= 0,
    "Montant du SMS non reconnu. Saisis l'opération manuellement.");
  const type: TxType = /reçu|cr[ée]dit/i.test(t) && !/transf[ée]r[ée]|envoy[ée]|paiement|pay[ée]|d[ée]bit/i.test(t) ? "income" : "expense";
  const category = ledger.categories.find(c => c.id === (type === "income" ? "pro" : "other"))?.id ?? ledger.categories[0].id;
  const who = t.match(/(?:à|de)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9_ '\-]{2,29})/i)?.[1]?.trim();
  return { type, amount, fees, wallet, category, note: who ? `SMS: ${who}` : "SMS importé", date: new Date().toISOString() };
}

export function transactionsCSV(transactions: Transaction[]): string {
  const headers = ["id", "type", "amount", "date", "category", "wallet", "walletSrc", "walletDst", "note", "source"] as const;
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...transactions.map(tx => headers.map(h => cell(tx[h])).join(","))].join("\r\n");
}

export function calculateBalances(ledger: Ledger): Map<string, number> {
  const balances = new Map(ledger.wallets.map(w => [w.id, w.initial]));
  const move = (id: string, delta: number) => {
    const next = balances.get(id)! + delta;
    ensure(Number.isSafeInteger(next), "Le solde dépasse la précision des montants XAF.");
    balances.set(id, next);
  };
  for (const tx of ledger.transactions) {
    if (tx.type === "income") move(tx.wallet!, tx.amount);
    if (tx.type === "expense") move(tx.wallet!, -tx.amount);
    if (tx.type === "transfer") {
      move(tx.walletSrc!, -tx.amount); move(tx.walletDst!, tx.amount);
    }
  }
  return balances;
}

export function calculateSummary(transactions: Transaction[], now = new Date()) {
  const t0 = new Date(now); t0.setHours(0, 0, 0, 0);
  const t1 = new Date(t0); t1.setDate(t1.getDate() + 1);
  const w0 = new Date(t0); w0.setDate(w0.getDate() - (w0.getDay() + 6) % 7);
  const w1 = new Date(w0); w1.setDate(w1.getDate() + 7);
  const m0 = new Date(t0); m0.setDate(1);
  const m1 = new Date(m0); m1.setMonth(m1.getMonth() + 1);
  const acc = { today: { income: 0, expense: 0 }, week: { income: 0, expense: 0 }, month: { income: 0, expense: 0 } };
  const expByCat = new Map<string, number>();
  for (const tx of transactions) {
    if (tx.type === "transfer") continue;
    const when = new Date(tx.date);
    for (const [key, from, until] of [["today", t0, t1], ["week", w0, w1], ["month", m0, m1]] as const)
      if (when >= from && when < until) acc[key][tx.type] += tx.amount;
    if (tx.type === "expense" && when >= m0 && when < m1)
      expByCat.set(tx.category, (expByCat.get(tx.category) || 0) + tx.amount);
  }
  const days = new Set(transactions.map(tx => new Date(tx.date).toDateString()));
  let streak = 0; let covered = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(t0); d.setDate(d.getDate() - i);
    if (i < 30 && days.has(d.toDateString())) covered++;
    if (streak === i && days.has(d.toDateString())) streak++;
  }
  return { acc, topCats: Array.from(expByCat).sort((a,b) => b[1] - a[1]).slice(0,5), streak,
    clarityScore: Math.round(covered / 30 * 100) };
}
