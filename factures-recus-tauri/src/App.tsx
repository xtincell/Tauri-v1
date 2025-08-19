
import React, { useEffect, useMemo, useState } from "react";

const CURRENCY = "XAF";
const nf = new Intl.NumberFormat("fr-FR", { style: "currency", currency: CURRENCY, maximumFractionDigits: 0 });
type TxType = "expense" | "income" | "transfer";

function formatMoney(v:number){ if (!isFinite(v as any)) return "—"; return nf.format(Math.round(v)); }
function parseAmount(input:string){ if(!input) return 0; const clean = input.replace(/[^0-9]/g, ""); return parseInt(clean || "0", 10); }
function ymd(d: Date | string | number){ const dd = new Date(d); return dd.toISOString().slice(0,10); }
function iso(d: Date | string | number){ const dd = new Date(d); return dd.toISOString(); }
function todayStart(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
function weekStart(){ const d = new Date(); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0,0,0,0); return d; }
function monthStart(){ const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; }
function uid(){ return `${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }

const DEFAULT_CATEGORIES = [
  { id: "food", name: "Nourriture" },
  { id: "transport", name: "Transport" },
  { id: "housing", name: "Logement" },
  { id: "health", name: "Santé" },
  { id: "pro", name: "Pro" },
  { id: "leisure", name: "Loisirs" },
  { id: "other", name: "Divers" },
];
const DEFAULT_WALLETS = [
  { id: "cash", name: "Cash", type: "cash", initial: 0 },
  { id: "om", name: "Orange Money", type: "om", initial: 0 },
  { id: "momo", name: "MTN MoMo", type: "momo", initial: 0 },
];

const STORAGE_KEY = "fr-app-v1";
function loadState(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(!raw) return null; return JSON.parse(raw);}catch{return null;} }
function saveState(state:any){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch{} }

const Pill: React.FC<{children:React.ReactNode, tone?:"muted"|"ok"|"warn"|"danger"}> = ({children, tone="muted"}) => (
  <span className={
    "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium " +
    (tone==="ok"?"bg-green-100 text-green-800": tone==="warn"?"bg-amber-100 text-amber-800": tone==="danger"?"bg-red-100 text-red-800":"bg-gray-100 text-gray-800")
  }>{children}</span>
);
const Tag: React.FC<{children:React.ReactNode}> = ({children}) => (
  <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-gray-600">{children}</span>
);
const Field: React.FC<{label:string, children:React.ReactNode}> = ({label, children}) => (
  <label className="grid gap-1 text-sm">
    <span className="text-gray-600">{label}</span>
    {children}
  </label>
);
const Section: React.FC<{title:string, right?:React.ReactNode, children:React.ReactNode}> = ({title, right, children}) => (
  <section className="mb-6">
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {right}
    </div>
    <div className="bg-white rounded-2xl shadow p-4">{children}</div>
  </section>
);

export default function App(){
  const [tab, setTab] = useState<"capture"|"inbox"|"history"|"dashboard"|"export"|"settings">("capture");
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [wallets, setWallets] = useState(DEFAULT_WALLETS);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [receiptsInbox, setReceiptsInbox] = useState<any[]>([]);
  const [type, setType] = useState<TxType>("expense");
  const [amount, setAmount] = useState<string>("");
  const [category, setCategory] = useState<string>(DEFAULT_CATEGORIES[0].id);
  const [walletSrc, setWalletSrc] = useState<string>(DEFAULT_WALLETS[0].id);
  const [walletDst, setWalletDst] = useState<string>(DEFAULT_WALLETS[1].id);
  const [note, setNote] = useState("");
  const [date, setDate] = useState(ymd(new Date()));
  const [time, setTime] = useState<string>(() => new Date().toTimeString().slice(0,5));
  const [attach, setAttach] = useState<string | null>(null);
  const [smsText, setSmsText] = useState("");
  const [smsDraft, setSmsDraft] = useState<any | null>(null);

  useEffect(()=>{
    const saved = loadState();
    if(saved){
      setCategories(saved.categories || DEFAULT_CATEGORIES);
      setWallets(saved.wallets || DEFAULT_WALLETS);
      setTransactions(saved.transactions || []);
      setReceiptsInbox(saved.receiptsInbox || []);
    }
  },[]);
  useEffect(()=>{
    saveState({ categories, wallets, transactions, receiptsInbox });
  }, [categories, wallets, transactions, receiptsInbox]);

  function addTransaction(tx:any){ setTransactions(prev => [{...tx, id: uid()}, ...prev]); }
  function onSubmitCapture(e:any){
    e.preventDefault();
    const amt = parseAmount(amount);
    if(!amt || amt <= 0){ alert("Montant invalide"); return; }
    const dateTime = new Date(`${date}T${time}:00`);
    if(type === "transfer"){
      if(walletSrc === walletDst){ alert("Choisis des portefeuilles différents"); return; }
      addTransaction({ type, amount: amt, date: iso(dateTime), category: "transfer", walletSrc, walletDst, note: note.trim(), source:"manual", attachments: attach?[attach]:[] });
    } else {
      addTransaction({ type, amount: amt, date: iso(dateTime), category, wallet: walletSrc, note: note.trim(), source:"manual", attachments: attach?[attach]:[] });
    }
    setAmount(""); setNote(""); setAttach(null);
  }
  async function onPickFileToDataURL(file: File){
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  function parseSMS(){
    const t = smsText.trim();
    if(!t){ setSmsDraft(null); return; }
    const w = /orange|om/i.test(t) ? "om" : /mtn|momo/i.test(t) ? "momo" : wallets[0]?.id;
    const amountMatch = t.match(/([0-9]{1,3}(?:[ .][0-9]{3})+|\\d{3,})\\s*(?:XAF|F\\s*CFA|FCFA)?/i);
    const m = amountMatch ? parseAmount(amountMatch[1]) : 0;
    const feeMatch = t.match(/frais[^0-9]*([0-9]{1,3}(?:[ .][0-9]{3})+|\\d{2,})/i);
    const fees = feeMatch ? parseAmount(feeMatch[1]) : 0;
    let ttype:TxType = "expense";
    if(/reçu|credit|crédit|vous avez reçu/i.test(t)) ttype = "income";
    if(/transfert|transféré|envoyé|paiement|payé|débit/i.test(t)) ttype = "expense";
    let who = "";
    const whoMatch = t.match(/à\\s+([A-Za-z0-9_\\-.' ]{3,30})|de\\s+([A-Za-z0-9_\\-.' ]{3,30})/i);
    if(whoMatch) who = (whoMatch[1]||whoMatch[2]||"").trim();
    setSmsDraft({ type: ttype, amount: m, fees, wallet: w, category: ttype==="income"? "pro":"other", note: who? `SMS: ${who}` : "SMS importé", date: iso(new Date()) });
  }
  function applySMSDraft(){
    if(!smsDraft) return;
    addTransaction({ type: smsDraft.type, amount: smsDraft.amount, date: smsDraft.date, category: smsDraft.category, wallet: smsDraft.wallet, note: smsDraft.note, source:"sms" });
    if(smsDraft.fees){ addTransaction({ type: "expense", amount: smsDraft.fees, date: smsDraft.date, category: "other", wallet: smsDraft.wallet, note: "Frais (SMS)", source:"sms" }); }
    setSmsText(""); setSmsDraft(null);
  }
  async function onAddReceipts(files: FileList | null){
    if(!files || !files.length) return;
    const items: any[] = [];
    for(const f of Array.from(files)){
      const dataUrl = await onPickFileToDataURL(f);
      items.push({ id: uid(), dataUrl, createdAt: iso(new Date())});
    }
    setReceiptsInbox(prev => [...items, ...prev]);
  }
  function removeReceipt(id:string){ setReceiptsInbox(prev => prev.filter(r => r.id !== id)); }
  function assimilateReceipt(r:any){
    setAttach(r.dataUrl);
    setType("expense");
    setCategory("other");
    setWalletSrc("cash");
    setTab("capture");
    removeReceipt(r.id);
  }

  const summary = useMemo(()=>{
    const t0 = todayStart(), w0 = weekStart(), m0 = monthStart();
    const base = { income:0, expense:0 }; const acc:any = { today:{...base}, week:{...base}, month:{...base} };
    for(const tx of transactions){
      if(tx.type === "transfer") continue;
      const when = new Date(tx.date);
      const bucket = (b:any) => { if(tx.type === "income") b.income += tx.amount; else if(tx.type === "expense") b.expense += tx.amount; };
      if(when >= t0) bucket(acc.today);
      if(when >= w0) bucket(acc.week);
      if(when >= m0) bucket(acc.month);
    }
    const expByCat = new Map<string, number>();
    for(const tx of transactions){
      if(tx.type !== "expense") continue;
      const when = new Date(tx.date);
      if(when < m0) continue;
      const key = tx.category || "other";
      expByCat.set(key, (expByCat.get(key) || 0) + tx.amount);
    }
    const topCats = Array.from(expByCat.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const daysSet = new Set(transactions.map(tx => new Date(tx.date).toDateString()));
    let streak = 0;
    for(let i=0; i<365; i++){ const d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0); if(daysSet.has(d.toDateString())) streak++; else break; }
    const last30 = new Set<string>(); for(let i=0;i<30;i++){ const d = new Date(); d.setDate(d.getDate()-i); last30.add(d.toDateString()); }
    const covered = new Set(transactions.map(tx => new Date(tx.date).toDateString()).filter(s => last30.has(s)));
    const clarityScore = Math.round((covered.size/30)*100);
    return { acc, topCats, streak, clarityScore };
  }, [transactions]);

  const [q, setQ] = useState("");
  const [fltType, setFltType] = useState<"all"|TxType>("all");
  const [fltCat, setFltCat] = useState<string>("all");
  const [fltWal, setFltWal] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const filtered = useMemo(()=>{
    return transactions.filter(tx =>{
      if(fltType !== "all" && tx.type !== fltType) return false;
      if(fltCat !== "all" && tx.category !== fltCat) return false;
      if(fltWal !== "all"){
        if(tx.type === "transfer"){
          if(tx.walletSrc !== fltWal && tx.walletDst !== fltWal) return false;
        } else if(tx.wallet !== fltWal) return false;
      }
      if(dateFrom && new Date(tx.date) < new Date(dateFrom)) return false;
      if(dateTo){ const end = new Date(dateTo); end.setHours(23,59,59,999); if(new Date(tx.date) > end) return false; }
      if(q){ const blob = JSON.stringify(tx).toLowerCase(); if(!blob.includes(q.toLowerCase())) return false; }
      return true;
    });
  }, [transactions, fltType, fltCat, fltWal, dateFrom, dateTo, q]);

  const walletBalances = useMemo(()=>{
    const map = new Map<string, number>(); for(const w of wallets){ map.set(w.id, w.initial || 0); }
    for(const tx of transactions){
      if(tx.type === "income") map.set(tx.wallet, (map.get(tx.wallet)||0) + tx.amount);
      if(tx.type === "expense") map.set(tx.wallet, (map.get(tx.wallet)||0) - tx.amount);
      if(tx.type === "transfer"){ map.set(tx.walletSrc, (map.get(tx.walletSrc)||0) - tx.amount); map.set(tx.walletDst, (map.get(tx.walletDst)||0) + tx.amount); }
    }
    return map;
  }, [wallets, transactions]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 backdrop-blur bg-white/80 border-b">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-orange-600 text-white flex items-center justify-center font-bold">FR</div>
          <div className="mr-auto">
            <div className="font-semibold">Factures & Reçus</div>
            <div className="text-xs text-gray-500">Desktop • Offline • XAF</div>
          </div>
          <nav className="hidden sm:flex gap-1">
            {[
              ["capture","Capture"], ["inbox","Reçus"], ["history","Historique"], ["dashboard","Dashboard"], ["export","Export"], ["settings","Paramètres"],
            ].map(([key,label])=> (
              <button key={key} onClick={()=>setTab(key as any)} className={`px-3 py-1.5 rounded-full text-sm ${tab===key?"bg-orange-600 text-white":"hover:bg-gray-100"}`}>{label}</button>
            ))}
          </nav>
          <div className="sm:hidden">
            <select className="border rounded-full px-3 py-1.5 text-sm" value={tab} onChange={e=>setTab(e.target.value as any)}>
              <option value="capture">Capture</option>
              <option value="inbox">Reçus</option>
              <option value="history">Historique</option>
              <option value="dashboard">Dashboard</option>
              <option value="export">Export</option>
              <option value="settings">Paramètres</option>
            </select>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Capture */}
        {tab === "capture" && (
          <>
            <div className="grid md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                <Section title="Saisie ultra‑rapide">
                  <form onSubmit={onSubmitCapture} className="grid md:grid-cols-2 gap-4">
                    <Field label="Type d'opération">
                      <div className="flex gap-2">
                        {[
                          ["expense","Dépense"], ["income","Revenu"], ["transfer","Transfert"]
                        ].map(([val,label])=> (
                          <button type="button" key={val} onClick={()=>setType(val as TxType)} className={`px-3 py-1.5 rounded-full text-sm border ${type===val?"bg-orange-600 text-white border-orange-600":"hover:bg-gray-100"}`}>{label}</button>
                        ))}
                      </div>
                    </Field>

                    <Field label="Montant (XAF)">
                      <input value={amount} onChange={e=>setAmount(e.target.value)} placeholder="ex: 2 500" className="border rounded-xl px-3 py-2" inputMode="numeric" />
                    </Field>

                    {type !== 'transfer' && (
                      <Field label="Catégorie">
                        <select value={category} onChange={e=>setCategory(e.target.value)} className="border rounded-xl px-3 py-2">
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </Field>
                    )}

                    <Field label={type === 'transfer'? "Depuis le portefeuille" : "Portefeuille"}>
                      <select value={walletSrc} onChange={e=>setWalletSrc(e.target.value)} className="border rounded-xl px-3 py-2">
                        {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                      </select>
                    </Field>

                    {type === 'transfer' && (
                      <Field label="Vers le portefeuille">
                        <select value={walletDst} onChange={e=>setWalletDst(e.target.value)} className="border rounded-xl px-3 py-2">
                          {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                      </Field>
                    )}

                    <Field label="Date & heure">
                      <div className="flex gap-2">
                        <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="border rounded-xl px-3 py-2" />
                        <input type="time" value={time} onChange={e=>setTime(e.target.value)} className="border rounded-xl px-3 py-2" />
                      </div>
                    </Field>

                    <Field label="Note (facultatif)">
                      <input value={note} onChange={e=>setNote(e.target.value)} placeholder="ex: Taxi Douala → Bonapriso" className="border rounded-xl px-3 py-2" />
                    </Field>

                    <Field label="Photo du reçu (facultatif)">
                      <input type="file" accept="image/*" onChange={async e=>{
                        const f = e.target.files?.[0];
                        if(f){ const d = await onPickFileToDataURL(f); setAttach(d); }
                      }} className="block" />
                      {attach && (
                        <img src={attach} alt="reçu" className="mt-2 max-h-32 rounded-lg border" />
                      )}
                    </Field>

                    <div className="md:col-span-2 flex items-center gap-3 pt-2">
                      <button className="px-4 py-2 rounded-xl bg-orange-600 text-white">Enregistrer</button>
                      <span className="text-sm text-gray-500">Astuce : tape juste « 2 000 taxi » dans montant & note, puis Valider.</span>
                    </div>
                  </form>
                </Section>

                <Section title="Coller un SMS OM/MoMo ➜ proposition d'opération" right={<button onClick={parseSMS} className="px-3 py-1.5 rounded-lg border">Analyser</button>}>
                  <textarea value={smsText} onChange={e=>setSmsText(e.target.value)} placeholder="Colle ici un SMS de confirmation…" className="w-full border rounded-xl p-3 min-h-[120px]" />
                  {smsDraft && (
                    <div className="mt-3 p-3 border rounded-xl bg-gray-50">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <Pill tone={smsDraft.type==='income'? 'ok':'warn'}>{smsDraft.type==='income'? 'Revenu':'Dépense'}</Pill>
                        <Pill>{formatMoney(smsDraft.amount)}</Pill>
                        {smsDraft.fees? <Pill tone="danger">Frais {formatMoney(smsDraft.fees)}</Pill> : null}
                        <Tag>{wallets.find(w=>w.id===smsDraft.wallet)?.name || 'Portefeuille'}</Tag>
                        <Tag>Cat: {categories.find(c=>c.id===smsDraft.category)?.name}</Tag>
                      </div>
                      <div className="mt-2 text-sm text-gray-600">{smsDraft.note}</div>
                      <div className="mt-3 flex gap-2">
                        <button onClick={applySMSDraft} className="px-3 py-1.5 bg-orange-600 text-white rounded-lg">Valider</button>
                        <button onClick={()=> setSmsDraft(null)} className="px-3 py-1.5 border rounded-lg">Annuler</button>
                      </div>
                    </div>
                  )}
                </Section>
              </div>

              <div>
                <Section title="Repères rapides">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-orange-600 text-white">
                      <div className="text-xs/5 text-white/80">Aujourd'hui</div>
                      <div className="text-sm">Revenus: {formatMoney(summary.acc.today.income)}</div>
                      <div className="text-sm">Dépenses: {formatMoney(summary.acc.today.expense)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-orange-50">
                      <div className="text-xs text-orange-600">Semaine</div>
                      <div className="text-sm">Revenus: {formatMoney(summary.acc.week.income)}</div>
                      <div className="text-sm">Dépenses: {formatMoney(summary.acc.week.expense)}</div>
                    </div>
                    <div className="p-3 rounded-xl bg-orange-50 col-span-2">
                      <div className="text-xs text-orange-600">Mois</div>
                      <div className="text-base font-semibold">Solde: {formatMoney(summary.acc.month.income - summary.acc.month.expense)}</div>
                      <div className="text-xs mt-1 text-gray-500">Revenus {formatMoney(summary.acc.month.income)} • Dépenses {formatMoney(summary.acc.month.expense)}</div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-3">
                    <Pill tone="ok">Streak: {summary.streak}j</Pill>
                    <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div className="h-full bg-orange-600" style={{width: `${summary.clarityScore}%`}}/>
                    </div>
                    <span className="text-xs text-gray-600">Clarté {summary.clarityScore}%</span>
                  </div>
                </Section>

                <Section title="Top dépenses — ce mois">
                  <div className="space-y-2">
                    {summary.topCats.length === 0 && <div className="text-sm text-gray-500">Aucune donnée</div>}
                    {summary.topCats.map(([catId, val]: any, i:number) => (
                      <div key={catId} className="flex items-center gap-3">
                        <div className="w-12 text-sm text-gray-500">#{i+1}</div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{categories.find(c=>c.id===catId)?.name || catId}</div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-orange-600" style={{width: '100%'}}/></div>
                        </div>
                        <div className="w-28 text-right text-sm">{formatMoney(val)}</div>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
            </div>
          </>
        )}

        {/* Inbox */}
        {tab === "inbox" && (
          <>
            <Section title="Boîte à reçus (non classés)" right={<label className="cursor-pointer px-3 py-1.5 border rounded-lg">Ajouter des reçus <input className="hidden" type="file" accept="image/*" multiple onChange={e=> onAddReceipts(e.target.files)} /></label>}>
              {receiptsInbox.length === 0 ? (
                <div className="text-sm text-gray-500">Aucun reçu en attente. Ajoute des photos pour les classer en 1 tap.</div>
              ) : (
                <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {receiptsInbox.map(r => (
                    <div key={r.id} className="border rounded-2xl overflow-hidden">
                      <img src={r.dataUrl} alt="reçu" className="w-full aspect-[4/3] object-cover" />
                      <div className="p-2 flex items-center justify-between text-sm">
                        <div className="text-gray-500">{new Date(r.createdAt).toLocaleString()}</div>
                        <div className="flex gap-2">
                          <button onClick={()=> assimilateReceipt(r)} className="px-2 py-1 rounded-lg bg-orange-600 text-white">Assimiler</button>
                          <button onClick={()=> removeReceipt(r.id)} className="px-2 py-1 rounded-lg border">Suppr.</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}

        {/* History */}
        {tab === "history" && (
          <>
            <Section title="Filtres">
              <div className="grid md:grid-cols-6 gap-3">
                <input placeholder="Rechercher…" value={q} onChange={e=>setQ(e.target.value)} className="border rounded-xl px-3 py-2 md:col-span-2" />
                <select value={fltType} onChange={e=>setFltType(e.target.value as any)} className="border rounded-xl px-3 py-2">
                  <option value="all">Type: Tous</option>
                  <option value="expense">Dépenses</option>
                  <option value="income">Revenus</option>
                  <option value="transfer">Transferts</option>
                </select>
                <select value={fltCat} onChange={e=>setFltCat(e.target.value)} className="border rounded-xl px-3 py-2">
                  <option value="all">Catégorie: Toutes</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <select value={fltWal} onChange={e=>setFltWal(e.target.value)} className="border rounded-xl px-3 py-2">
                  <option value="all">Portefeuille: Tous</option>
                  {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} className="border rounded-xl px-3 py-2 flex-1"/>
                  <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} className="border rounded-xl px-3 py-2 flex-1"/>
                </div>
              </div>
            </Section>

            <Section title={`Historique (${filtered.length})`}>
              {filtered.length === 0 ? (
                <div className="text-sm text-gray-500">Aucune opération ne correspond aux filtres.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-2">Date</th>
                        <th>Type</th>
                        <th>Montant</th>
                        <th>Catégorie</th>
                        <th>Portefeuille</th>
                        <th>Note</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(tx => (
                        <tr key={tx.id} className="border-t">
                          <td className="py-2 whitespace-nowrap">{new Date(tx.date).toLocaleString()}</td>
                          <td>
                            {tx.type === 'income' && <Pill tone="ok">Revenu</Pill>}
                            {tx.type === 'expense' && <Pill tone="warn">Dépense</Pill>}
                            {tx.type === 'transfer' && <Pill>Transfert</Pill>}
                          </td>
                          <td className={`${tx.type==='expense'?'text-red-600': tx.type==='income'?'text-green-700':''} font-medium`}>{tx.type==='expense'?'-':''}{formatMoney(tx.amount)}</td>
                          <td>{tx.type==='transfer'? '—' : (categories.find(c=>c.id===tx.category)?.name || tx.category || '—')}</td>
                          <td>
                            {tx.type==='transfer'? (
                              <span className="text-xs">{wallets.find(w=>w.id===tx.walletSrc)?.name} → {wallets.find(w=>w.id===tx.walletDst)?.name}</span>
                            ) : (
                              wallets.find(w=>w.id===tx.wallet)?.name || '—'
                            )}
                          </td>
                          <td className="max-w-[280px] truncate" title={tx.note}>{tx.note || '—'}</td>
                          <td className="text-right">
                            <div className="flex items-center gap-2 justify-end">
                              {Array.isArray(tx.attachments) && tx.attachments[0] && (
                                <button onClick={()=> window.open(tx.attachments[0], '_blank')} className="px-2 py-1 border rounded-lg">Reçu</button>
                              )}
                              <button onClick={()=> setTransactions(prev => prev.filter(p => p.id !== tx.id))} className="px-2 py-1 border rounded-lg">Suppr.</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </>
        )}

        {/* Dashboard */}
        {tab === "dashboard" && (
          <>
            <Section title="Vue d'ensemble">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-2xl bg-orange-600 text-white">
                  <div className="text-xs text-white/80">Aujourd'hui</div>
                  <div className="text-3xl font-semibold">{formatMoney(summary.acc.today.income - summary.acc.today.expense)}</div>
                  <div className="text-xs text-white/80 mt-1">R {formatMoney(summary.acc.today.income)} • D {formatMoney(summary.acc.today.expense)}</div>
                </div>
                <div className="p-4 rounded-2xl bg-white border">
                  <div className="text-xs text-gray-500">Semaine</div>
                  <div className="text-3xl font-semibold">{formatMoney(summary.acc.week.income - summary.acc.week.expense)}</div>
                  <div className="text-xs text-gray-500 mt-1">R {formatMoney(summary.acc.week.income)} • D {formatMoney(summary.acc.week.expense)}</div>
                </div>
                <div className="p-4 rounded-2xl bg-white border">
                  <div className="text-xs text-gray-500">Mois</div>
                  <div className="text-3xl font-semibold">{formatMoney(summary.acc.month.income - summary.acc.month.expense)}</div>
                  <div className="text-xs text-gray-500 mt-1">R {formatMoney(summary.acc.month.income)} • D {formatMoney(summary.acc.month.expense)}</div>
                </div>
              </div>
            </Section>

            <Section title="Soldes par portefeuille">
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
                {wallets.map(w => (
                  <div key={w.id} className="p-3 rounded-2xl bg-white border">
                    <div className="text-sm text-gray-500">{w.name}</div>
                    <div className="text-xl font-semibold">{formatMoney(walletBalances.get(w.id) || 0)}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Top dépenses — ce mois">
              <div className="space-y-2">
                {summary.topCats.length === 0 && <div className="text-sm text-gray-500">Aucune donnée</div>}
                {summary.topCats.map(([catId, val]: any, i:number) => (
                  <div key={catId} className="flex items-center gap-3">
                    <div className="w-8 text-sm text-gray-500">#{i+1}</div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{categories.find(c=>c.id===catId)?.name || catId}</div>
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-orange-600" style={{width: `${Math.min(100, 100)}%`}}/></div>
                    </div>
                    <div className="w-28 text-right text-sm">{formatMoney(val)}</div>
                  </div>
                ))}
              </div>
            </Section>

            <Section title="Habitudes">
              <div className="flex items-center gap-3">
                <Pill tone="ok">Streak {summary.streak} jours</Pill>
                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-600" style={{width: `${summary.clarityScore}%`}}/>
                </div>
                <span className="text-xs text-gray-600">Clarté {summary.clarityScore}% (30j)</span>
              </div>
            </Section>
          </>
        )}

        {/* Export */}
        {tab === "export" && (
          <>
            <Section title="Exporter & Sauvegarder">
              <div className="flex flex-wrap gap-3">
                <button onClick={()=>{
                  const headers = ["id","type","amount","date","category","wallet","walletSrc","walletDst","note","source"];
                  const lines = [headers.join(",")];
                  for(const r of transactions){
                    const obj:any = {}; headers.forEach(h => obj[h] = r[h] ?? "");
                    lines.push(headers.map(h => JSON.stringify(obj[h])).join(","));
                  }
                  const content = lines.join("\\n");
                  const blob = new Blob([content], {type: "text/csv;charset=utf-8;"});
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob); a.download = `transactions_${new Date().toISOString().slice(0,10)}.csv`; a.click();
                  setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
                }} className="px-4 py-2 rounded-xl bg-orange-600 text-white">Télécharger CSV</button>
                <button onClick={()=>{
                  const content = JSON.stringify({categories, wallets, transactions, receiptsInbox}, null, 2);
                  const blob = new Blob([content], {type: "application/json"});
                  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
                  setTimeout(()=> URL.revokeObjectURL(a.href), 5000);
                }} className="px-4 py-2 rounded-xl border">Sauvegarde JSON</button>
                <label className="px-4 py-2 rounded-xl border cursor-pointer">Restaurer JSON<input type="file" className="hidden" accept="application/json" onChange={(evt:any)=>{
                  const file = evt.target.files?.[0]; if(!file) return; const reader = new FileReader();
                  reader.onload = () => {
                    try{ const data = JSON.parse(String(reader.result));
                      if(data.categories) setCategories(data.categories);
                      if(data.wallets) setWallets(data.wallets);
                      if(data.transactions) setTransactions(data.transactions);
                      if(data.receiptsInbox) setReceiptsInbox(data.receiptsInbox);
                      alert("Données importées ✓");
                    }catch(e){ alert("Fichier invalide"); }
                  };
                  reader.readAsText(file);
                }} /></label>
              </div>
              <p className="text-xs text-gray-500 mt-3">Le CSV contient toutes les colonnes clés. La sauvegarde JSON inclut catégories, portefeuilles, opérations et reçus.</p>
            </Section>
          </>
        )}

        {/* Settings */}
        {tab === "settings" && (
          <>
            <Section title="Catégories">
              <CategoryManager categories={categories} setCategories={setCategories} />
            </Section>
            <Section title="Portefeuilles & soldes initiaux">
              <WalletManager wallets={wallets} setWallets={setWallets} balances={walletBalances} />
            </Section>
            <Section title="Danger zone">
              <button onClick={()=>{
                if(confirm("Supprimer toutes les données locales ?")){
                  setTransactions([]); setReceiptsInbox([]); setCategories(DEFAULT_CATEGORIES); setWallets(DEFAULT_WALLETS);
                }
              }} className="px-4 py-2 rounded-xl bg-red-600 text-white">Réinitialiser</button>
            </Section>
          </>
        )}
      </main>

      <footer className="pb-10 text-center text-xs text-gray-500">Tauri • WebView • Données locales</footer>
    </div>
  );
}

function CategoryManager({categories, setCategories}:{categories:any[], setCategories:(v:any)=>void}){
  const [name, setName] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input className="border rounded-xl px-3 py-2" placeholder="Nouvelle catégorie" value={name} onChange={e=>setName(e.target.value)} />
        <button className="px-3 py-2 rounded-xl bg-orange-600 text-white" onClick={()=>{
          const n = name.trim(); if(!n) return;
          const id = n.toLowerCase().replace(/[^a-z0-9]+/g,'-');
          if(categories.some((c:any)=> c.id===id)) { alert("Existe déjà"); return; }
          setCategories([...categories, {id, name:n}]); setName("");
        }}>Ajouter</button>
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
        {categories.map((c:any) => (
          <div key={c.id} className="border rounded-xl px-3 py-2 flex items-center justify-between">
            <span>{c.name}</span>
            <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>{
              if(confirm(`Supprimer « ${c.name} » ?`)) setCategories(categories.filter((x:any)=>x.id!==c.id));
            }}>Suppr.</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function WalletManager({wallets, setWallets, balances}:{wallets:any[], setWallets:(v:any)=>void, balances: Map<string, number>}){
  const [name, setName] = useState("");
  const [type, setType] = useState("custom");
  const [initial, setInitial] = useState<string>("0");
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-4 gap-2">
        <input className="border rounded-xl px-3 py-2" placeholder="Nom (ex: Banque)" value={name} onChange={e=>setName(e.target.value)} />
        <select className="border rounded-xl px-3 py-2" value={type} onChange={e=>setType(e.target.value)}>
          <option value="custom">Type: Perso</option>
          <option value="cash">Cash</option>
          <option value="om">Orange Money</option>
          <option value="momo">MTN MoMo</option>
          <option value="bank">Banque</option>
        </select>
        <input className="border rounded-xl px-3 py-2" placeholder="Solde initial" value={initial} onChange={e=>setInitial(e.target.value)} />
        <button className="px-3 py-2 rounded-xl bg-orange-600 text-white" onClick={()=>{
          const n = name.trim(); if(!n) return;
          const id = n.toLowerCase().replace(/[^a-z0-9]+/g,'-');
          if(wallets.some((w:any)=> w.id===id)) { alert("Existe déjà"); return; }
          setWallets([...wallets, {id, name:n, type, initial: parseAmount(initial)}]);
          setName(""); setType("custom"); setInitial("0");
        }}>Ajouter</button>
      </div>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
        {wallets.map((w:any) => (
          <div key={w.id} className="border rounded-xl px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="font-medium">{w.name}</span>
              <button className="text-xs px-2 py-1 border rounded-lg" onClick={()=>{
                if(confirm(`Supprimer « ${w.name} » ?`)) setWallets(wallets.filter((x:any)=>x.id!==w.id));
              }}>Suppr.</button>
            </div>
            <div className="text-xs text-gray-500">Type: {w.type}</div>
            <div className="text-sm mt-1">Solde initial: {formatMoney(w.initial||0)}</div>
            <div className="text-sm">Solde actuel: <span className="font-semibold">{formatMoney(balances.get(w.id)||0)}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
