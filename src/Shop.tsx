import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { Modal, Field } from "./ui";

type Me = { userId: string; name: string; role: "admin" | "manager" | "technician"; email: string };
type WO = any;

const initials = (n: string) => (n || "?").split(/[\s@.]+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
const money = (n: number) => "$" + (Number(n) || 0).toFixed(2);
const fmtPct = (r: number) => ((Number(r) || 0) * 100).toFixed(2).replace(/\.00$/, "");
const STATUSES = ["Pending", "In Progress", "Awaiting Parts", "Completed", "Invoice Paid"];
const STATUS_CLASS: Record<string, string> = {
  "Pending": "yellow", "In Progress": "blue", "Awaiting Parts": "red", "Completed": "green", "Invoice Paid": "gray",
};

function calcOrder(o: WO, fallbackRate: number) {
  const labor = (o.laborItems || []).reduce((s: number, l: any) => s + (Number(l.hours) || 0) * (Number(l.rate) || 0), 0);
  const parts = (o.partItems || []).reduce((s: number, p: any) => s + (Number(p.qty) || 0) * (Number(p.price) || 0), 0);
  const gross = labor + parts;
  // Discount reduces the subtotal before tax.
  let discount = 0;
  if (o.discountType === "amount") discount = Number(o.discountValue) || 0;
  else if (o.discountType === "percent") discount = gross * ((Number(o.discountValue) || 0) / 100);
  discount = Math.min(Math.max(0, discount), gross); // never below zero or above subtotal
  const sub = gross - discount;
  const rate = o.taxRate != null ? Number(o.taxRate) : fallbackRate;
  const tax = sub * rate;
  return { labor, parts, gross, discount, sub, rate, tax, total: sub + tax };
}

export function Shop({ me }: { me: Me }) {
  const [tab, setTab] = useState("workorders");
  const { signOut } = useAuthActions();
  const changePassword = useAction(api.authActions.changeMyPassword);
  const isAdmin = me.role === "admin";
  const isManagerPlus = me.role === "admin" || me.role === "manager";

  async function onChangePassword() {
    const pw = prompt("Enter your new password (at least 6 characters):");
    if (pw === null) return;
    if (pw.length < 6) { alert("Password must be at least 6 characters."); return; }
    try {
      await changePassword({ email: me.email, newPassword: pw });
      alert("Password changed ✓");
    } catch (e: any) {
      alert("Change failed: " + (e.message || e));
    }
  }

  const orders = useQuery(api.workOrders.list) ?? [];
  const customers = useQuery(api.customers.list) ?? [];
  const inventory = useQuery(api.inventory.list) ?? [];
  const settings = useQuery(api.users.getSettings) ?? { laborRate: 75, taxRate: 0.0725 };

  const tabs = [["workorders", "Work Orders"], ["customers", "Customers"], ["inventory", "Inventory"]];
  if (isAdmin) tabs.push(["staff", "Staff"]);
  if (isManagerPlus) tabs.push(["settings", "Settings"]);

  const openCount = orders.filter((o) => !["Completed", "Invoice Paid"].includes(o.status)).length;
  const doneCount = orders.filter((o) => o.status === "Completed").length;
  const revenue = orders.filter((o) => o.status === "Completed").reduce((s, o) => s + calcOrder(o, settings.taxRate).total, 0);
  const lowStock = inventory.filter((p) => (Number(p.qty) || 0) <= 5).length;

  return (
    <div>
      <div className="topbar">
        <div className="topbar-in">
          <div className="brand"><div className="mark">⚙</div><div className="t">Geek Next Door</div></div>
          <div className="top-actions">
            <div className="user-chip"><div className="ua">{initials(me.name)}</div><div><div className="un">{me.name}</div><div className="ur">{me.role}</div></div></div>
            <button className="btn ghost sm" onClick={onChangePassword}>🔑 Password</button>
            <button className="btn ghost sm" onClick={() => signOut()}>Sign out</button>
          </div>
        </div>
        <div className="nav"><div className="nav-in">
          {tabs.map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
        </div></div>
      </div>
      <div className="statbar"><div className="statbar-in">
        <Stat label="OPEN ORDERS" val={openCount} color="#60a5fa" />
        <Stat label="COMPLETED" val={doneCount} color="#4ade80" />
        <Stat label="REVENUE (COMPLETE)" val={money(revenue)} color="var(--gold)" />
        <Stat label="LOW STOCK" val={lowStock} color={lowStock ? "#f87171" : "#4ade80"} />
      </div></div>
      <div className="wrap">
        {tab === "workorders" && <WorkOrders me={me} orders={orders} customers={customers} inventory={inventory} settings={settings} isManagerPlus={isManagerPlus} />}
        {tab === "customers" && <Customers customers={customers} orders={orders} />}
        {tab === "inventory" && <Inventory inventory={inventory} isManagerPlus={isManagerPlus} />}
        {tab === "staff" && <Staff me={me} />}
        {tab === "settings" && <Settings settings={settings} isManagerPlus={isManagerPlus} />}
      </div>
    </div>
  );
}
const Stat = ({ label, val, color }: any) => (
  <div className="stat"><span className="lbl">{label}</span><span className="val" style={{ color }}>{val}</span></div>
);

/* ============ WORK ORDERS ============ */
function WorkOrders({ me, orders, customers, inventory, settings, isManagerPlus }: any) {
  const [view, setView] = useState<{ mode: string; order?: WO }>({ mode: "list" });
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const create = useMutation(api.workOrders.create);
  const update = useMutation(api.workOrders.update);
  const remove = useMutation(api.workOrders.remove);

  const cust = (id: string) => customers.find((c: any) => c._id === id);

  if (view.mode === "detail" && view.order) {
    const o = orders.find((x: WO) => x._id === view.order._id) || view.order;
    return <WODetail o={o} customer={cust(o.customerId)} inventory={inventory} settings={settings} onBack={() => setView({ mode: "list" })} onEdit={() => setView({ mode: "form", order: o })} />;
  }
  if (view.mode === "form") {
    return <WOForm me={me} initial={view.order} customers={customers} inventory={inventory} settings={settings} isManagerPlus={isManagerPlus} orders={orders}
      onCancel={() => setView({ mode: "list" })}
      onSave={async (payload: any, id?: Id<"workOrders">) => { if (id) await update({ id, ...payload }); else await create(payload); setView({ mode: "list" }); }}
      onDelete={async (id: Id<"workOrders">) => { if (confirm("Delete this work order?")) { await remove({ id }); setView({ mode: "list" }); } }} />;
  }

  const nextNum = () => {
    const nums = orders.map((o: WO) => parseInt((o.number || "").replace("WO-", ""), 10)).filter((n: number) => !isNaN(n));
    return "WO-" + String((nums.length ? Math.max(...nums) : 0) + 1).padStart(4, "0");
  };
  const filtered = orders.filter((o: WO) => {
    const c = cust(o.customerId);
    const okStatus = filter === "All" || o.status === filter;
    const q = search.toLowerCase();
    const okQ = !q || (o.number || "").toLowerCase().includes(q) || (o.tagNumber || "").toLowerCase().includes(q) || (c?.name || "").toLowerCase().includes(q) || (o.equipment || "").toLowerCase().includes(q);
    return okStatus && okQ;
  });

  return (
    <>
      <div className="page-head"><h2>Work Orders</h2>
        <button className="btn primary" onClick={() => setView({ mode: "form", order: { number: nextNum(), status: "Pending", laborItems: [{ desc: "Service Call", hours: 1, rate: settings.laborRate }], partItems: [], createdAt: new Date().toISOString().slice(0, 10), technician: "" } })}>+ New Work Order</button>
      </div>
      <div className="toolbar">
        <div className="search"><span className="ic">⌕</span><input placeholder="Search orders…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="pills">{["All", ...STATUSES].map((s) => <button key={s} className={`pill ${filter === s ? "on" : ""}`} onClick={() => setFilter(s)}>{s}</button>)}</div>
      </div>
      {filtered.length ? filtered.map((o: WO) => {
        const c = cust(o.customerId);
        const { total } = calcOrder(o, settings.taxRate);
        return (
          <div className="row clickable" key={o._id} onClick={() => setView({ mode: "detail", order: o })} style={{ marginBottom: 8 }}>
            <div className="rl"><span className="wo-num">{o.number}</span><div><div className="rn">{c?.name || "Unknown Customer"}</div><div className="rs">{o.tagNumber ? <span className="tag-chip">Inv# {o.tagNumber}</span> : null}{o.tagNumber ? " · " : ""}{o.equipment}</div></div></div>
            <div className="rl" style={{ gap: 12 }}>
              <span className="rs">{o.createdAt}</span>
              <span className="wo-total">{money(total)}</span>
              <span className={`badge ${STATUS_CLASS[o.status]}`}>{o.status}</span>
            </div>
          </div>
        );
      }) : <div className="empty"><div className="big">🧰</div>No work orders found</div>}
    </>
  );
}

function WODetail({ o, customer, inventory, settings, onBack, onEdit }: any) {
  const { labor, parts, gross, discount, tax, total, rate } = calcOrder(o, settings.taxRate);
  const partName = (id: string) => inventory.find((i: any) => i._id === id) || {};
  return (
    <>
      <div className="detail-head">
        <button className="btn ghost sm" onClick={onBack}>← Back</button>
        <div className="rl" style={{ gap: 8 }}>
          <button className="btn" onClick={onEdit}>✎ Edit</button>
          <button className="btn primary" onClick={() => printInvoice(o, customer, inventory, rate)}>🖨 Print Invoice</button>
        </div>
      </div>
      <div className="card pad-lg">
        <div className="wo-detail-top">
          <div><div className="wo-detail-num">{o.number}</div><div className="rs">{o.tagNumber ? <span className="tag-chip">Inv# {o.tagNumber}</span> : null}{o.tagNumber ? " · " : ""}{o.createdAt} · Tech: {o.technician || "—"}</div></div>
          <span className={`badge ${STATUS_CLASS[o.status]}`}>{o.status}</span>
        </div>
        <div className="two-col" style={{ marginBottom: 18 }}>
          <div><div className="sec-label">Customer</div>{kv("Name", customer?.name)}{kv("Phone", customer?.phone)}{kv("Email", customer?.email)}</div>
          <div><div className="sec-label">Equipment</div>{kv("Make/Model", o.equipment)}{kv("Year", o.year)}{kv("Serial #", o.serial)}</div>
        </div>
        <div className="sec-label">Problem</div>
        <div className="boxed">{o.problem || "—"}</div>
        <div className="sec-label">Labor</div>
        <table className="t"><thead><tr><th>Description</th><th>Hrs</th><th>Rate</th><th className="r">Amount</th></tr></thead>
          <tbody>{(o.laborItems || []).map((l: any, i: number) => <tr key={i}><td>{l.desc}</td><td>{l.hours}</td><td>${l.rate}/hr</td><td className="r">{money((Number(l.hours) || 0) * (Number(l.rate) || 0))}</td></tr>)}</tbody></table>
        <div className="sec-label">Parts</div>
        <table className="t"><thead><tr><th>Part #</th><th>Description</th><th>Qty</th><th className="r">Unit</th><th className="r">Amount</th></tr></thead>
          <tbody>{(o.partItems || []).map((p: any, i: number) => { const part = partName(p.partId); return <tr key={i}><td>{part.partNumber || "—"}</td><td>{part.description || "—"}</td><td>{p.qty}</td><td className="r">{money(p.price)}</td><td className="r">{money((Number(p.qty) || 0) * (Number(p.price) || 0))}</td></tr>; })}</tbody></table>
        {o.notes && <><div className="sec-label">Notes</div><div className="boxed italic">{o.notes}</div></>}
        <div className="totals-wrap"><div className="totals">
          <div className="line"><span>Labor</span><span>{money(labor)}</span></div>
          <div className="line"><span>Parts</span><span>{money(parts)}</span></div>
          {discount > 0 && <div className="line discount"><span>Discount{o.discountType === "percent" ? ` (${Number(o.discountValue) || 0}%)` : ""}</span><span>−{money(discount)}</span></div>}
          {discount > 0 && <div className="line"><span>Subtotal</span><span>{money(gross - discount)}</span></div>}
          <div className="line"><span>Tax ({fmtPct(rate)}%)</span><span>{money(tax)}</span></div>
          <div className="total"><span>TOTAL</span><span>{money(total)}</span></div>
        </div></div>
      </div>
    </>
  );
}
const kv = (l: string, v?: string) => <div className="kv"><span className="k">{l}:</span><span>{v || "—"}</span></div>;

function WOForm({ me, initial, customers, inventory, settings, isManagerPlus, orders, onCancel, onSave, onDelete }: any) {
  const [o, setO] = useState<WO>(() => JSON.parse(JSON.stringify(initial)));
  const set = (k: string, v: any) => setO((p: WO) => ({ ...p, [k]: v }));
  const { labor, parts, gross, discount, tax, total, rate } = calcOrder(o, settings.taxRate);
  const isNew = !o._id;

  const setLabor = (i: number, k: string, v: any) => setO((p: WO) => { const a = [...p.laborItems]; a[i] = { ...a[i], [k]: k === "desc" ? v : Number(v) || 0 }; return { ...p, laborItems: a }; });
  const setPart = (i: number, k: string, v: any) => setO((p: WO) => { const a = [...p.partItems]; a[i] = { ...a[i], [k]: Number(v) || 0 }; return { ...p, partItems: a }; });
  const addPart = (pid: string) => { if (!pid) return; const part = inventory.find((x: any) => x._id === pid); if (!part) return; setO((p: WO) => { const ex = p.partItems.find((x: any) => x.partId === pid); if (ex) return { ...p, partItems: p.partItems.map((x: any) => x.partId === pid ? { ...x, qty: x.qty + 1 } : x) }; return { ...p, partItems: [...p.partItems, { partId: pid, qty: 1, price: Number(part.price) || 0 }] }; }); };

  function save() {
    // Enforce a 2-hour minimum on TOTAL labor time across all lines.
    // If the summed hours are below 2 (and there is at least one labor line),
    // bump the first line up so the total reaches 2 hours.
    const MIN_LABOR_HOURS = 2;
    let laborItems = (o.laborItems || []).map((l: any) => ({ ...l, hours: Number(l.hours) || 0 }));
    if (laborItems.length > 0) {
      const totalHours = laborItems.reduce((s: number, l: any) => s + l.hours, 0);
      if (totalHours < MIN_LABOR_HOURS) {
        const shortfall = MIN_LABOR_HOURS - totalHours;
        laborItems[0] = { ...laborItems[0], hours: laborItems[0].hours + shortfall };
      }
    }

    const payload = {
      number: o.number, tagNumber: o.tagNumber || undefined, customerId: o.customerId || undefined, status: o.status,
      equipment: o.equipment || undefined, year: o.year || undefined, serial: o.serial || undefined, problem: o.problem || undefined,
      laborItems, partItems: o.partItems || [], notes: o.notes || undefined, technician: o.technician || undefined,
      discountType: o.discountType && o.discountType !== "none" ? o.discountType : undefined,
      discountValue: o.discountType && o.discountType !== "none" ? (Number(o.discountValue) || 0) : undefined,
      createdAt: o.createdAt,
    };
    onSave(payload, o._id);
  }

  return (
    <>
      <div className="detail-head">
        <h2>{isNew ? "New Work Order" : "Edit " + o.number}</h2>
        <div className="rl" style={{ gap: 8 }}>
          {!isNew && isManagerPlus && <button className="btn danger" onClick={() => onDelete(o._id)}>🗑 Delete</button>}
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={save}>💾 Save</button>
        </div>
      </div>
      <div className="two-col" style={{ marginBottom: 14 }}>
        <div className="card pad"><div className="card-title">Work Order Info</div>
          <Field label="WO Number"><input value={o.number} readOnly /></Field>
          <Field label="Invoice Number"><input value={o.tagNumber || ""} onChange={(e) => set("tagNumber", e.target.value)} placeholder="Invoice number…" /></Field>
          <Field label="Status"><select value={o.status} onChange={(e) => set("status", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Date"><input type="date" value={o.createdAt} onChange={(e) => set("createdAt", e.target.value)} /></Field>
          <Field label="Technician"><input value={o.technician || ""} onChange={(e) => set("technician", e.target.value)} placeholder="Tech name" /></Field>
        </div>
        <div className="card pad"><div className="card-title">Customer</div>
          <Field label="Customer"><select value={o.customerId || ""} onChange={(e) => set("customerId", e.target.value || undefined)}>
            <option value="">— Select customer —</option>
            {customers.map((c: any) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select></Field>
          {o.customerId && (() => { const c = customers.find((x: any) => x._id === o.customerId); return c ? <div className="rs" style={{ lineHeight: 1.6 }}>{c.phone}<br />{c.email}<br />{c.address}</div> : null; })()}
        </div>
      </div>
      <div className="card pad" style={{ marginBottom: 14 }}><div className="card-title">Equipment</div>
        <div className="fg-row-3">
          <Field label="Make/Model"><input value={o.equipment || ""} onChange={(e) => set("equipment", e.target.value)} /></Field>
          <Field label="Year"><input value={o.year || ""} onChange={(e) => set("year", e.target.value)} /></Field>
          <Field label="Serial #"><input value={o.serial || ""} onChange={(e) => set("serial", e.target.value)} /></Field>
        </div>
        <Field label="Problem / Complaint"><textarea rows={2} value={o.problem || ""} onChange={(e) => set("problem", e.target.value)} /></Field>
      </div>
      <div className="card pad" style={{ marginBottom: 14 }}><div className="card-title">Labor</div>
        {(o.laborItems || []).map((l: any, i: number) => (
          <div className="line-row" key={i}>
            <Field label="Description"><input value={l.desc} onChange={(e) => setLabor(i, "desc", e.target.value)} /></Field>
            <Field label="Hours"><input type="number" step="0.25" value={l.hours} onChange={(e) => setLabor(i, "hours", e.target.value)} /></Field>
            <Field label="Rate/hr"><input type="number" value={l.rate} onChange={(e) => setLabor(i, "rate", e.target.value)} /></Field>
            <button className="btn ghost sm danger rmbtn" onClick={() => setO((p: WO) => ({ ...p, laborItems: p.laborItems.filter((_: any, x: number) => x !== i) }))}>✕</button>
          </div>
        ))}
        <button className="btn ghost sm" onClick={() => setO((p: WO) => ({ ...p, laborItems: [...p.laborItems, { desc: "Service Call", hours: 1, rate: settings.laborRate }] }))}>+ Add Labor Line</button>
        {(() => {
          const totalHrs = (o.laborItems || []).reduce((s: number, l: any) => s + (Number(l.hours) || 0), 0);
          if ((o.laborItems || []).length > 0 && totalHrs < 2) {
            return <div className="min-note">⚠ Total labor is {totalHrs} hr — a 2-hour minimum applies. Hours will be bumped to 2 on save.</div>;
          }
          return null;
        })()}
        <div className="line-total">Labor total: <strong>{money(labor)}</strong></div>
      </div>
      <div className="card pad" style={{ marginBottom: 14 }}><div className="card-title">Parts & Materials</div>
        <select value="" onChange={(e) => { addPart(e.target.value); e.target.value = ""; }} style={{ marginBottom: 12 }}>
          <option value="">+ Add part from inventory…</option>
          {inventory.map((p: any) => <option key={p._id} value={p._id}>[{p.partNumber}] {p.description} — {money(p.price)} (qty: {p.qty})</option>)}
        </select>
        {(o.partItems || []).map((p: any, i: number) => { const part = inventory.find((x: any) => x._id === p.partId) || {}; return (
          <div className="line-row parts" key={i}>
            <div className="part-name">{part.description || "Unknown"} <span className="rs">({part.partNumber})</span></div>
            <Field label="Qty"><input type="number" min={1} value={p.qty} onChange={(e) => setPart(i, "qty", e.target.value)} /></Field>
            <Field label="Unit Price"><input type="number" step="0.01" value={p.price} onChange={(e) => setPart(i, "price", e.target.value)} /></Field>
            <button className="btn ghost sm danger rmbtn" onClick={() => setO((pp: WO) => ({ ...pp, partItems: pp.partItems.filter((_: any, x: number) => x !== i) }))}>✕</button>
          </div>
        ); })}
        <div className="line-total">Parts total: <strong>{money(parts)}</strong></div>
      </div>
      <div className="card pad"><div className="card-title">Notes & Total</div>
        <div className="notes-total">
          <div>
            <Field label="Technician Notes"><textarea rows={4} value={o.notes || ""} onChange={(e) => set("notes", e.target.value)} /></Field>
            <div className="discount-row">
              <Field label="Discount">
                <select value={o.discountType || "none"} onChange={(e) => set("discountType", e.target.value)}>
                  <option value="none">No discount</option>
                  <option value="amount">$ off</option>
                  <option value="percent">% off</option>
                </select>
              </Field>
              <Field label={o.discountType === "percent" ? "Percent" : "Amount"}>
                <input type="number" min={0} step={o.discountType === "percent" ? "1" : "0.01"} value={o.discountValue ?? 0}
                  disabled={!o.discountType || o.discountType === "none"}
                  onChange={(e) => set("discountValue", Number(e.target.value) || 0)} />
              </Field>
            </div>
          </div>
          <div className="totals">
            <div className="line"><span>Labor</span><span>{money(labor)}</span></div>
            <div className="line"><span>Parts</span><span>{money(parts)}</span></div>
            {discount > 0 && <div className="line discount"><span>Discount{o.discountType === "percent" ? ` (${Number(o.discountValue) || 0}%)` : ""}</span><span>−{money(discount)}</span></div>}
            {discount > 0 && <div className="line"><span>Subtotal</span><span>{money(gross - discount)}</span></div>}
            <div className="line"><span>Tax ({fmtPct(rate)}%)</span><span>{money(tax)}</span></div>
            <div className="total"><span>TOTAL</span><span>{money(total)}</span></div>
            <div className="lock-note">{isNew ? `Will lock at current ${fmtPct(rate)}% on save` : `Locked at ${fmtPct(rate)}% (rate when created)`}</div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ============ CUSTOMERS ============ */
function Customers({ customers, orders }: any) {
  const create = useMutation(api.customers.create);
  const update = useMutation(api.customers.update);
  const remove = useMutation(api.customers.remove);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<any | null>(null);
  const list = customers.filter((c: any) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search));
  return (
    <>
      <div className="page-head"><h2>Customers</h2><button className="btn primary" onClick={() => setForm({})}>+ Add Customer</button></div>
      <div className="search" style={{ marginBottom: 14, maxWidth: 280 }}><span className="ic">⌕</span><input placeholder="Search customers…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      {list.map((c: any) => {
        const n = orders.filter((o: any) => o.customerId === c._id).length;
        return (
          <div className="row" key={c._id} style={{ marginBottom: 8 }}>
            <div className="rl"><div className="avatar">{initials(c.name)}</div><div><div className="rn">{c.name}</div><div className="rs">{c.phone}{c.phone && c.email ? " · " : ""}{c.email}</div><div className="rs dim">{c.address}</div></div></div>
            <div className="rl" style={{ gap: 12 }}><span className="rs">{n} order{n !== 1 ? "s" : ""}</span>
              <button className="btn ghost sm" onClick={() => setForm(c)}>✎</button>
              <button className="btn ghost sm danger" onClick={async () => { if (confirm("Delete customer?")) await remove({ id: c._id }); }}>🗑</button></div>
          </div>
        );
      })}
      {!list.length && <div className="empty">No customers</div>}
      {form && <CustomerForm initial={form} onClose={() => setForm(null)}
        onSave={async (payload: any, id?: Id<"customers">) => { if (id) await update({ id, ...payload }); else await create(payload); setForm(null); }} />}
    </>
  );
}
function CustomerForm({ initial, onClose, onSave }: any) {
  const [f, setF] = useState({ name: "", phone: "", email: "", address: "", ...initial });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  return (
    <Modal title={f._id ? "Edit Customer" : "New Customer"} onClose={onClose}
      footer={<><span /><button className="btn primary" onClick={() => { if (!f.name.trim()) return alert("Name required"); onSave({ name: f.name, phone: f.phone || undefined, email: f.email || undefined, address: f.address || undefined }, f._id); }}>Save</button></>}>
      <Field label="Full Name *"><input value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
      <div className="fg-row">
        <Field label="Phone"><input value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <Field label="Email"><input value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
      </div>
      <Field label="Address"><input value={f.address} onChange={(e) => set("address", e.target.value)} /></Field>
    </Modal>
  );
}

/* ============ INVENTORY ============ */
function Inventory({ inventory, isManagerPlus }: any) {
  const create = useMutation(api.inventory.create);
  const update = useMutation(api.inventory.update);
  const remove = useMutation(api.inventory.remove);
  const adjust = useMutation(api.inventory.adjustQty);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<any | null>(null);
  const list = inventory.filter((p: any) => !search || p.description.toLowerCase().includes(search.toLowerCase()) || p.partNumber.toLowerCase().includes(search.toLowerCase()));
  const totalValue = inventory.reduce((s: number, p: any) => s + (Number(p.qty) || 0) * (Number(p.cost) || 0), 0);
  return (
    <>
      <div className="page-head">
        <div><h2 style={{ marginBottom: 2 }}>Inventory</h2><span className="rs">{isManagerPlus ? <>Total stock value: <strong>{money(totalValue)}</strong> · </> : null}{inventory.length} SKUs</span></div>
        {isManagerPlus && <button className="btn primary" onClick={() => setForm({})}>+ Add Part</button>}
      </div>
      <div className="search" style={{ marginBottom: 14, maxWidth: 300 }}><span className="ic">⌕</span><input placeholder="Search parts…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="inv-table">
          <thead><tr><th>Part #</th><th>Description</th><th>Bin</th><th>Qty</th><th>Price</th>{isManagerPlus && <><th>Cost</th><th>Margin</th><th>Actions</th></>}</tr></thead>
          <tbody>{list.map((p: any) => {
            const m = p.cost > 0 ? ((p.price - p.cost) / p.cost * 100).toFixed(0) : "—";
            const low = (Number(p.qty) || 0) <= 5;
            return (
              <tr key={p._id}>
                <td><strong>{p.partNumber}</strong></td><td>{p.description}</td><td><span className="bin">{p.location}</span></td>
                <td><div className="qty-ctl"><button onClick={() => adjust({ id: p._id, delta: -1 })}>−</button><span style={{ color: low ? "var(--red)" : "inherit" }}>{p.qty}</span><button onClick={() => adjust({ id: p._id, delta: 1 })}>+</button>{low && <span title="Low" className="warn">⚠</span>}</div></td>
                <td>{money(p.price)}</td>
                {isManagerPlus && <><td>{money(p.cost)}</td><td>{m !== "—" ? m + "%" : "—"}</td>
                  <td><div className="rl" style={{ gap: 4 }}><button className="btn ghost sm" onClick={() => setForm(p)}>✎</button><button className="btn ghost sm danger" onClick={async () => { if (confirm("Delete part?")) await remove({ id: p._id }); }}>🗑</button></div></td></>}
              </tr>
            );
          })}</tbody>
        </table>
        {!list.length && <div className="empty">No parts found</div>}
      </div>
      {form && isManagerPlus && <PartForm initial={form} onClose={() => setForm(null)}
        onSave={async (payload: any, id?: Id<"inventory">) => { if (id) await update({ id, ...payload }); else await create(payload); setForm(null); }} />}
    </>
  );
}
function PartForm({ initial, onClose, onSave }: any) {
  const [f, setF] = useState({ partNumber: "", description: "", qty: 0, cost: 0, price: 0, location: "", ...initial });
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  const margin = f.cost > 0 ? (((f.price - f.cost) / f.cost) * 100).toFixed(0) + "%" : "—";
  return (
    <Modal title={f._id ? "Edit Part" : "Add Part"} onClose={onClose}
      footer={<><span /><button className="btn primary" onClick={() => { if (!f.partNumber.trim()) return alert("Part number required"); onSave({ partNumber: f.partNumber, description: f.description, qty: Number(f.qty) || 0, cost: Number(f.cost) || 0, price: Number(f.price) || 0, location: f.location || undefined }, f._id); }}>Save</button></>}>
      <div className="fg-row-3">
        <Field label="Part Number *"><input value={f.partNumber} onChange={(e) => set("partNumber", e.target.value)} /></Field>
        <Field label="Location/Bin"><input value={f.location} onChange={(e) => set("location", e.target.value)} /></Field>
        <Field label="Qty"><input type="number" value={f.qty} onChange={(e) => set("qty", e.target.value)} /></Field>
      </div>
      <Field label="Description"><input value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
      <div className="fg-row-3">
        <Field label="Cost (each)"><input type="number" step="0.01" value={f.cost} onChange={(e) => set("cost", e.target.value)} /></Field>
        <Field label="Sell Price (each)"><input type="number" step="0.01" value={f.price} onChange={(e) => set("price", e.target.value)} /></Field>
        <div className="margin-hint">Margin: <strong>{margin}</strong></div>
      </div>
    </Modal>
  );
}

/* ============ STAFF ============ */
function Staff({ me }: { me: Me }) {
  const staff = useQuery(api.users.listStaff) ?? [];
  const setRole = useMutation(api.users.setRole);
  const del = useMutation(api.admin.deleteStaff);
  const admins = staff.filter((s) => s.role === "admin").length;
  return (
    <>
      <div className="page-head"><h2>Staff Accounts</h2></div>
      <div className="rs" style={{ marginBottom: 12 }}>{staff.length} accounts · new sign-ups join as technicians</div>
      {staff.map((u) => {
        const meRow = u.userId === me.userId;
        const lastAdmin = u.role === "admin" && admins <= 1;
        return (
          <div className="row" key={u._id} style={{ marginBottom: 8 }}>
            <div className="rl"><div className="avatar">{initials(u.name)}</div><div><div className="rn">{u.name} {meRow && <span className="rs">(you)</span>}</div><div className="rs">{u.email}</div></div></div>
            <div className="rl" style={{ gap: 8 }}>
              <span className={`role-badge ${u.role}`}>{u.role}</span>
              <select value={u.role} disabled={lastAdmin} onChange={(e) => setRole({ profileId: u._id, role: e.target.value as any }).catch((err) => alert(err.message))}>
                <option value="technician">Technician</option><option value="manager">Manager</option><option value="admin">Admin</option>
              </select>
              {meRow || lastAdmin ? <button className="btn ghost sm" disabled style={{ opacity: 0.3 }}>🗑</button> :
                <button className="btn ghost sm danger" onClick={async () => { if (confirm(`Delete account "${u.name}"?`)) await del({ profileId: u._id }).catch((err) => alert(err.message)); }}>🗑</button>}
            </div>
          </div>
        );
      })}
      <div className="card pad" style={{ marginTop: 16, fontSize: 12.5, color: "var(--ink2)", lineHeight: 1.6 }}>
        Staff create their own login on the sign-up screen; set roles here. <strong>Manager</strong> = full operations incl. costs, pricing, settings, delete orders. <strong>Technician</strong> = work orders, customers, adjust stock; no cost visibility, no settings, no deletes. Each user can change their own password with the 🔑 button up top.
      </div>
    </>
  );
}

/* ============ SETTINGS ============ */
function Settings({ settings, isManagerPlus }: any) {
  const update = useMutation(api.users.updateSettings);
  const seed = useMutation(api.seed.sample);
  const [labor, setLabor] = useState(String(settings.laborRate));
  const [taxPct, setTaxPct] = useState(fmtPct(settings.taxRate));
  const [msg, setMsg] = useState("");
  async function save() {
    await update({ laborRate: Number(labor) || 0, taxRate: (Number(taxPct) || 0) / 100 });
    setMsg("✓ Saved"); setTimeout(() => setMsg(""), 2500);
  }
  return (
    <div style={{ maxWidth: 640 }}>
      <div className="page-head"><h2>Settings</h2></div>
      <div className="card pad"><div className="card-title">Shop Rates</div>
        <div className="fg-row">
          <Field label="Default Labor Rate ($/hr)"><input type="number" step="0.01" value={labor} onChange={(e) => setLabor(e.target.value)} disabled={!isManagerPlus} /></Field>
          <Field label="Tax Rate (%)"><input type="number" step="0.01" value={taxPct} onChange={(e) => setTaxPct(e.target.value)} disabled={!isManagerPlus} /></Field>
        </div>
        <div className="info-box">New labor lines default to this rate. Tax applies to the full subtotal (labor + parts). Each work order locks in the tax rate from when it was created — changing this only affects new orders.</div>
        {isManagerPlus && <div className="rl" style={{ gap: 10 }}><button className="btn primary" onClick={save}>💾 Save Rates</button><span className="ok">{msg}</span></div>}
      </div>
      <div className="card pad" style={{ marginTop: 16 }}><div className="card-title">Shop Information</div>
        <Field label="Shop Name"><input defaultValue="Geek Next Door" /></Field>
        <Field label="Address"><input defaultValue="120 Key Lane, Jacksonville NC 28546" /></Field>
        <Field label="Phone"><input defaultValue="+1 (910) 595-6067" /></Field>
        <div className="rs dim" style={{ marginTop: 8 }}>Shop name/address shown here are the printed-invoice header defaults.</div>
      </div>
      {isManagerPlus && (
        <div className="card pad" style={{ marginTop: 16 }}><div className="card-title">Sample Data</div>
          <div className="info-box">Load demo customers, parts, and work orders (only if the shop has no customers yet).</div>
          <button className="btn" onClick={async () => { const r = await seed({}); alert(r.skipped ? "Skipped — data already present." : "Sample data loaded."); }}>Load sample data</button>
        </div>
      )}
    </div>
  );
}

/* ============ PRINT INVOICE ============ */
function printInvoice(order: WO, customer: any, inventory: any[], rate: number) {
  const c = customer || {};
  const { labor, parts, gross, discount, tax, total } = calcOrder(order, rate);
  const esc = (s: any) => String(s == null ? "" : s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch] as string));
  const laborRows = (order.laborItems || []).map((l: any) => `<tr><td>${esc(l.desc)}</td><td>${l.hours}</td><td>$${(Number(l.rate) || 0).toFixed(2)}</td><td style="text-align:right">$${((Number(l.hours) || 0) * (Number(l.rate) || 0)).toFixed(2)}</td></tr>`).join("");
  const partRows = (order.partItems || []).map((p: any) => { const part = inventory.find((i) => i._id === p.partId) || {}; return `<tr><td>${esc(part.partNumber || "—")}</td><td>${esc(part.description || "—")}</td><td>${p.qty}</td><td style="text-align:right">$${(Number(p.price) || 0).toFixed(2)}</td><td style="text-align:right">$${((Number(p.qty) || 0) * (Number(p.price) || 0)).toFixed(2)}</td></tr>`; }).join("");
  const pct = (rate * 100).toFixed(2).replace(/\.00$/, "");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${esc(order.number)}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:13px;color:#111;padding:32px}
.header{display:flex;justify-content:space-between;border-bottom:2px solid #1d3c5b;padding-bottom:16px;margin-bottom:16px}
.shop-name{font-size:22px;font-weight:700;color:#1d3c5b}.shop-info{font-size:11px;color:#555;line-height:1.5}.inv-meta{text-align:right}
.inv-num{font-size:18px;font-weight:700;color:#1d3c5b}.status-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-top:4px;background:#DBEAFE;color:#1E40AF}
.section{margin:14px 0}.section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;border-bottom:.5px solid #e5e7eb;padding-bottom:4px;margin-bottom:8px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}.field{margin-bottom:4px}.field strong{color:#374151;font-size:12px}
table{width:100%;border-collapse:collapse;margin-top:4px}th{background:#f3f4f6;text-align:left;padding:6px 8px;font-size:11px;font-weight:700;color:#374151;border:.5px solid #d1d5db}
td{padding:6px 8px;border:.5px solid #e5e7eb}.totals{margin-top:12px;display:flex;justify-content:flex-end}.totals-table{width:240px}
.totals-table td{padding:4px 8px;border:none}.total-row td{font-size:15px;font-weight:700;color:#1d3c5b;border-top:2px solid #1d3c5b}
.footer{margin-top:24px;text-align:center;font-size:11px;color:#9ca3af}@media print{body{padding:16px}}</style></head><body>
<div class="header"><div><div class="shop-name">⚙ Geek Next Door</div><div class="shop-info">120 Key Lane, Jacksonville NC 28546<br>+1 (910) 595-6067 · human.gnd@gmail.com</div></div>
<div class="inv-meta"><div class="inv-num">${esc(order.number)}</div><div class="shop-info">${order.tagNumber ? `Invoice #: ${esc(order.tagNumber)}<br>` : ""}Date: ${esc(order.createdAt)}<br>Technician: ${esc(order.technician || "—")}</div><div class="status-badge">${esc(order.status)}</div></div></div>
<div class="two-col"><div class="section"><div class="section-title">Customer</div><div class="field"><strong>${esc(c.name || "—")}</strong></div><div class="field">${esc(c.phone || "")}</div><div class="field">${esc(c.email || "")}</div><div class="field">${esc(c.address || "")}</div></div>
<div class="section"><div class="section-title">Equipment</div><div class="field"><strong>${esc(order.equipment || "—")}</strong></div><div class="field">Year: ${esc(order.year || "—")} | Serial: ${esc(order.serial || "—")}</div><div class="field" style="margin-top:6px;font-style:italic;color:#374151">${esc(order.problem || "")}</div></div></div>
<div class="section"><div class="section-title">Labor</div><table><thead><tr><th>Description</th><th style="width:80px">Hours</th><th style="width:80px">Rate</th><th style="width:90px;text-align:right">Amount</th></tr></thead><tbody>${laborRows}</tbody></table></div>
<div class="section"><div class="section-title">Parts & Materials</div><table><thead><tr><th>Part</th><th>Description</th><th style="width:50px">Qty</th><th style="width:80px;text-align:right">Unit</th><th style="width:90px;text-align:right">Amount</th></tr></thead><tbody>${partRows}</tbody></table></div>
${order.notes ? `<div class="section"><div class="section-title">Technician Notes</div><div style="padding:8px;background:#f9fafb;border:.5px solid #e5e7eb;border-radius:4px;font-style:italic">${esc(order.notes)}</div></div>` : ""}
<div class="totals"><table class="totals-table"><tr><td>Labor</td><td style="text-align:right">$${labor.toFixed(2)}</td></tr><tr><td>Parts</td><td style="text-align:right">$${parts.toFixed(2)}</td></tr>${discount > 0 ? `<tr><td>Discount${order.discountType === "percent" ? ` (${Number(order.discountValue) || 0}%)` : ""}</td><td style="text-align:right">−$${discount.toFixed(2)}</td></tr><tr><td>Subtotal</td><td style="text-align:right">$${(gross - discount).toFixed(2)}</td></tr>` : ""}<tr><td>Tax (${pct}%)</td><td style="text-align:right">$${tax.toFixed(2)}</td></tr><tr class="total-row"><td>TOTAL DUE</td><td style="text-align:right">$${total.toFixed(2)}</td></tr></table></div>
<div class="footer">Thank you for your business! · Est. repairs guaranteed 30 days on labor & parts</div></body></html>`;
  const win = window.open("", "_blank");
  if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 300); }
}
