import test from "node:test";
import assert from "node:assert/strict";
import { calculateBalances, calculateSummary, emptyLedger, parseAmount, parseSMSDraft, readLedger, recordTransactions,
  STORAGE_KEY, transactionsCSV, validateLedger, writeLedger } from "../src/ledger.ts";

const date = "2026-10-20T08:30:00.000Z";
const image = "data:image/png;base64,aGVsbG8=";
const expense = (id = "expense-1") => ({ id, type: "expense" as const, amount: 2500,
  date, category: "transport", wallet: "cash", note: "Taxi", attachments: [] });
function memory(raw: string | null = null) {
  let value = raw; const writes: string[] = [];
  return { getItem: (key:string) => { assert.equal(key, STORAGE_KEY); return value; },
    setItem: (key:string, next:string) => { assert.equal(key, STORAGE_KEY); writes.push(next); value = next; }, writes };
}

test("amounts preserve their sign and reject decimals, noise, and unsafe integers", () => {
  for (const input of ["2500", "2 500", "2\u202f500", "+2500"]) assert.equal(parseAmount(input), 2500);
  assert.equal(parseAmount("-2 500"), -2500);
  for (const input of ["", "2.50", "2,50", "2 50", "2 000 taxi", "9007199254740992", "NaN"]) assert.ok(Number.isNaN(parseAmount(input)), input);
});
test("loading an existing complete ledger never writes defaults", () => {
  const ledger = { ...emptyLedger(), transactions: [expense()] };
  const storage = memory(JSON.stringify(ledger));
  assert.deepEqual(readLedger(storage), { ledger, error: null }); assert.equal(storage.writes.length, 0);
});
test("an absent ledger is initialized in memory without writing", () => {
  const storage = memory(); assert.deepEqual(readLedger(storage).ledger, emptyLedger()); assert.equal(storage.writes.length, 0);
});
test("corrupt or unavailable storage is reported without overwriting it", () => {
  for (const raw of ["{broken", "{}", '{"transactions":[]}']) {
    const storage = memory(raw); assert.ok(readLedger(storage).error); assert.equal(storage.getItem(STORAGE_KEY), raw); assert.equal(storage.writes.length, 0);
  }
  assert.ok(readLedger({ getItem: () => { throw Error("denied"); }, setItem: () => assert.fail() }).error);
});
test("successful receipt classification saves the complete operation and removes only its inbox entry", () => {
  const before = { ...emptyLedger(), receiptsInbox: [{ id: "r1", dataUrl: image, createdAt: date }, { id: "r2", dataUrl: image, createdAt: date }] };
  const storage = memory(JSON.stringify(before));
  const next = recordTransactions(before, [{ ...expense(), attachments: [image] }], "r1");
  writeLedger(storage, next);
  assert.equal(storage.writes.length, 1); assert.equal(readLedger(storage).ledger.transactions[0].attachments?.[0], image);
  assert.deepEqual(readLedger(storage).ledger.receiptsInbox.map(r => r.id), ["r2"]);
  assert.equal(before.receiptsInbox.length, 2); assert.equal(before.transactions.length, 0);
});
test("classification fails if the receipt has not been attached, leaving the inbox intact", () => {
  const before = { ...emptyLedger(), receiptsInbox: [{ id: "r1", dataUrl: image, createdAt: date }] };
  assert.throws(() => recordTransactions(before, [expense()], "r1"));
  assert.throws(() => recordTransactions(before, [{ ...expense(), attachments: [image] }], "missing"));
  assert.equal(before.receiptsInbox.length, 1);
});
test("quota failure leaves the saved receipt and ledger intact, not a partial operation", () => {
  const before = { ...emptyLedger(), receiptsInbox: [{ id: "r1", dataUrl: image, createdAt: date }] };
  const saved = JSON.stringify(before); let calls = 0;
  const storage = { getItem: () => saved, setItem: () => { calls++; throw new DOMException("full", "QuotaExceededError"); } };
  assert.throws(() => writeLedger(storage, recordTransactions(before, [{ ...expense(), attachments: [image] }], "r1")), /full/);
  assert.equal(calls, 1); assert.deepEqual(readLedger(storage).ledger, before);
});
test("manual and restored transactions reject negative, zero, fractional and invalid amounts", () => {
  for (const amount of [-2500, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => validateLedger({ ...emptyLedger(), transactions: [{ ...expense(), amount }] }));
});
test("negative opening balances remain valid without reversing their sign", () => {
  const ledger = emptyLedger(); ledger.wallets[0].initial = -5000;
  assert.equal(validateLedger(ledger).wallets[0].initial, -5000);
});
test("invalid or non-calendar dates are refused before writing", () => {
  for (const invalid of ["bad", "2026-02-30T08:00:00Z", "2026-13-01T08:00:00Z", "2026-10-20T99:00:00Z"])
    assert.throws(() => validateLedger({ ...emptyLedger(), transactions: [{ ...expense(), date: invalid }] }));
});
test("restoration refuses orphan wallet/category references and duplicate transaction IDs", () => {
  for (const changes of [{ wallet: "missing" }, { category: "missing" }, { type: "wrong" }])
    assert.throws(() => validateLedger({ ...emptyLedger(), transactions: [{ ...expense(), ...changes }] }));
  assert.throws(() => validateLedger({ ...emptyLedger(), transactions: [expense(), expense()] }));
});
test("used categories and wallets, as well as the last available one, cannot be removed", () => {
  const ledger = { ...emptyLedger(), transactions: [expense()] };
  assert.throws(() => validateLedger({ ...ledger, wallets: ledger.wallets.filter(w => w.id !== "cash") }));
  assert.throws(() => validateLedger({ ...ledger, categories: ledger.categories.filter(c => c.id !== "transport") }));
  assert.throws(() => validateLedger({ ...emptyLedger(), wallets: [] }));
  assert.throws(() => validateLedger({ ...emptyLedger(), categories: [] }));
});
test("transfers require existing distinct wallets and conserve the combined balance", () => {
  const transfer = { id: "transfer-1", type: "transfer" as const, category: "transfer", amount: 1200, date, walletSrc: "cash", walletDst: "om" };
  const next = recordTransactions(emptyLedger(), [transfer]);
  const amounts = Array.from(calculateBalances(next).values());
  assert.deepEqual(amounts, [-1200, 1200, 0]); assert.equal(amounts.reduce((a,b) => a+b, 0), 0);
  for (const walletDst of ["cash", "missing"]) assert.throws(() => recordTransactions(emptyLedger(), [{ ...transfer, walletDst }]));
});
test("an invalid restore is all-or-nothing and does not call storage", () => {
  const original = { ...emptyLedger(), transactions: [expense()] }; const storage = memory(JSON.stringify(original));
  assert.throws(() => writeLedger(storage, { ...original, wallets: [] }));
  assert.deepEqual(readLedger(storage).ledger, original); assert.equal(storage.writes.length, 0);
});
test("complete JSON backups round-trip receipts, attachments, balances and unknown legacy fields", () => {
  const original = { ...emptyLedger(), transactions: [{ ...expense(), attachments: [image], legacyField: "preserved" }], receiptsInbox: [{ id: "r1", dataUrl: image, createdAt: date }] };
  const storage = memory(); writeLedger(storage, validateLedger(JSON.parse(JSON.stringify(original))));
  assert.deepEqual(readLedger(storage).ledger, original);
});
test("CSV uses real record separators and escapes quotes/newlines in notes", () => {
  const csv = transactionsCSV([{ ...expense(), note: 'Taxi, "aller"\nretour' }, expense("expense-2")]);
  assert.ok(csv.startsWith("id,type,amount,date,category,wallet,walletSrc,walletDst,note,source\r\n"));
  assert.ok(csv.includes('"Taxi, ""aller""\nretour"')); assert.ok(csv.includes('\r\n"expense-2"')); assert.ok(!csv.includes('\\n'));
});
test("OM SMS produces a human-confirmed draft with principal and fees separately", () => {
  const draft = parseSMSDraft("Orange Money : paiement de 2 500 FCFA à Taxi. Frais : 50 FCFA. Réf 987654321", emptyLedger())!;
  assert.equal(draft.amount, 2500); assert.equal(draft.fees, 50); assert.equal(draft.wallet, "om"); assert.equal(draft.type, "expense");
});
test("MoMo income and grouped amounts are parsed without swallowing phone/reference numbers", () => {
  const draft = parseSMSDraft("MTN MoMo : vous avez reçu 10.000 F CFA de Alice. Réf 998877665", emptyLedger())!;
  assert.equal(draft.amount, 10000); assert.equal(draft.wallet, "momo"); assert.equal(draft.type, "income");
  assert.throws(() => parseSMSDraft("OM référence 987654321 téléphone 690123456", emptyLedger()));
  assert.throws(() => parseSMSDraft("Orange montant 0 FCFA", emptyLedger()));
});
test("custom-only wallets/categories are used by the SMS proposal without inventing references", () => {
  const ledger = { ...emptyLedger(), wallets: [{ id: "bank", name: "Bank", type: "bank", initial: 0 }], categories: [{ id: "local", name: "Local" }] };
  const draft = parseSMSDraft("OM montant 2500 FCFA", ledger)!;
  const { fees, ...tx } = draft;
  assert.equal(fees, 0); assert.equal(recordTransactions(ledger, [{ ...tx, id: "sms1" }]).transactions.length, 1);
});
test("SMS signs, decimals and ambiguous balances are never silently turned into a positive principal", () => {
  for (const sms of ["OM montant -2500 FCFA", "OM montant 2,50 FCFA", "OM montant 2.50 FCFA", "OM montant 2500 FCFA frais -50 FCFA", "Solde 2500 FCFA, disponible 1000 FCFA"])
    assert.throws(() => parseSMSDraft(sms, emptyLedger()), sms);
  assert.equal(parseSMSDraft("Solde 8000 FCFA. Vous avez reçu 1000 FCFA", emptyLedger())?.amount, 1000);
});
test("real balance calculation accounts for expenses, income, transfers and signed opening balances", () => {
  const ledger = emptyLedger(); ledger.wallets[0].initial = -500;
  ledger.transactions = [expense(), { ...expense("in"), type: "income", wallet: "om", amount: 10000 },
    { id: "transfer", type: "transfer", category: "transfer", amount: 1000, date, walletSrc: "om", walletDst: "cash" }];
  assert.deepEqual(Array.from(calculateBalances(validateLedger(ledger))), [["cash", -2000], ["om", 9000], ["momo", 0]]);
});
test("daily, weekly and monthly summaries have upper date bounds and exclude transfers", () => {
  const now = new Date(2026, 9, 20, 12);
  const at = (day:number, month = 9) => new Date(2026, month, day, 12).toISOString();
  const summary = calculateSummary([
    { ...expense(), date: at(20) }, { ...expense("tomorrow"), date: at(21), amount: 100 },
    { ...expense("next-week"), date: at(27), amount: 200 }, { ...expense("next-month"), date: at(1,10), amount: 300 },
    { id: "transfer", type: "transfer", amount: 1000, date: at(20), category: "transfer", walletSrc: "cash", walletDst: "om" },
  ], now);
  assert.equal(summary.acc.today.expense, 2500); assert.equal(summary.acc.week.expense, 2600);
  assert.equal(summary.acc.month.expense, 2800); assert.deepEqual(summary.topCats, [["transport", 2800]]);
});
test("safe individual amounts cannot overflow totals or opening balances silently", () => {
  const ledger = emptyLedger(); ledger.wallets[0].initial = Number.MAX_SAFE_INTEGER;
  assert.throws(() => validateLedger({ ...ledger, transactions: [{ ...expense(), type: "income", amount: 1 }] }));
  assert.throws(() => validateLedger({ ...emptyLedger(), transactions: [{ ...expense(), amount: Number.MAX_SAFE_INTEGER }, { ...expense("second"), amount: 1 }] }));
});
