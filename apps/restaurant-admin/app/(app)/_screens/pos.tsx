'use client';

import { Badge, Button, Card, Empty, ErrorBanner, Field, formatDateTime, formatPaise, Input, Loading, PageHeader, useAction, useLoad } from '@xeva/ui';
import { useState, type FormEvent } from 'react';
import { useTenant } from '../tenant';
import { itemLine, type Order, OrderComposer, rupees, usePolling } from '../shared';

interface Invoice {
  seller: { name: string; gstin: string | null; address: string };
  invoiceNumber: string | null;
  date: string;
  order: { label: string; tableCode: string | null; type: string };
  items: { name: string; variantName: string | null; addons: { name: string }[]; quantity: number; unitPricePaise: number; lineTotalPaise: number; taxRateBps: number }[];
  subtotalPaise: number;
  discountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  totalPaise: number;
  payments: { method: string; amountPaise: number; refunded: boolean }[];
}
interface Closing { ordersPaid: number; grossSalesPaise: number; discountsPaise: number; taxPaise: number; netCollectedPaise: number; byMethod: Record<string, number>; refundsPaise: number; unpaidOrders: number }

const paid = (o: Order) => (o.payments ?? []).filter((p) => !p.refundedAt).reduce((s, p) => s + p.amountPaise, 0);

/** Cashier POS (spec 9.7, 13): open bills, discounts, split payments, GST invoice, closing report. */
export default function PosScreen() {
  const { call, tenant } = useTenant();
  const action = useAction();
  const bills = useLoad(() => call<Order[]>('/pos/orders'), []);
  const closing = useLoad(() => call<Closing>('/pos/closing-report'), []);
  const [selected, setSelected] = useState<string | null>(null);
  const [newOrder, setNewOrder] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [pay, setPay] = useState({ method: 'CASH', amount: '', reference: '' });
  const [discount, setDiscount] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  usePolling(bills.reload, 6000);

  const bill = bills.data?.find((b) => b.id === selected) ?? null;
  const balance = bill ? bill.totalPaise - paid(bill) : 0;
  const refresh = () => (bills.reload(), closing.reload());

  const takePayment = (e: FormEvent) => {
    e.preventDefault();
    if (!bill) return;
    void action.run(async () => {
      const r = await call<{ order: Order; balancePaise: number; changePaise: number }>(`/pos/orders/${bill.id}/payments`, {
        method: 'POST',
        body: { method: pay.method, amountPaise: pay.amount ? rupees(pay.amount) : balance, reference: pay.reference || undefined },
      });
      setPay({ method: pay.method, amount: '', reference: '' });
      setMessage(r.balancePaise === 0 ? `Paid. ${r.changePaise ? `Give change ${formatPaise(r.changePaise)}. ` : ''}Invoice ${r.order.invoiceNumber}` : `Balance due ${formatPaise(r.balancePaise)}`);
      if (r.balancePaise === 0) {
        setInvoice(await call<Invoice>(`/pos/orders/${bill.id}/invoice`));
        setSelected(null);
      }
      refresh();
    });
  };
  const applyDiscount = (e: FormEvent) => {
    e.preventDefault();
    const reason = prompt('Reason for the discount?');
    if (!bill || !reason) return;
    void action.run(async () => {
      await call(`/pos/orders/${bill.id}/discount`, { method: 'POST', body: { discountPaise: rupees(discount || '0'), reason } });
      setDiscount('');
      refresh();
    });
  };

  return (
    <>
      <PageHeader title="POS & Billing" description="Settle bills by cash, UPI or card. Split payments and GST invoices included." actions={<Button onClick={() => setNewOrder(!newOrder)}>{newOrder ? 'Close' : 'New counter order'}</Button>} />
      <ErrorBanner error={bills.error ?? action.error} />
      {message && <p role="status" className="mb-4 rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{message}</p>}
      {newOrder && (
        <Card title="Counter order" className="mb-4">
          <OrderComposer source="POS" call={call} onPlaced={(o) => (setNewOrder(false), setSelected(o.id), refresh())} />
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        <Card title={`Open bills (${bills.data?.length ?? 0})`}>
          {!bills.data ? <Loading /> : bills.data.length === 0 ? <Empty>All bills are settled.</Empty> : (
            <ul className="-mx-2 space-y-1">
              {bills.data.map((b) => (
                <li key={b.id}>
                  <button onClick={() => (setSelected(b.id), setMessage(null))} className={`flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm ${b.id === selected ? 'bg-[var(--brand)]/10' : 'hover:bg-stone-50'}`}>
                    <span><span className="font-semibold">{b.label}</span> {b.tableCode ? `· T ${b.tableCode}` : b.type === 'TAKEAWAY' ? '· takeaway' : ''}</span>
                    <span className="tabular-nums">{formatPaise(b.totalPaise)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {bill ? (
          <Card title={<span className="flex items-center gap-2">Bill {bill.label} <Badge>{bill.status}</Badge></span>}>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-stone-100">
                {bill.items.map((i) => (
                  <tr key={i.id}><td className="py-1.5">{i.quantity}× {itemLine(i)}</td><td className="py-1.5 text-right tabular-nums">{formatPaise(i.lineTotalPaise)}</td></tr>
                ))}
              </tbody>
              <tfoot className="text-stone-600">
                <tr><td className="pt-3">Subtotal</td><td className="pt-3 text-right tabular-nums">{formatPaise(bill.subtotalPaise)}</td></tr>
                {bill.discountPaise > 0 && <tr><td>Discount</td><td className="text-right tabular-nums">−{formatPaise(bill.discountPaise)}</td></tr>}
                <tr><td>GST</td><td className="text-right tabular-nums">{formatPaise(bill.taxPaise)}</td></tr>
                <tr className="text-base font-semibold text-stone-900"><td className="pt-1">Total</td><td className="pt-1 text-right tabular-nums">{formatPaise(bill.totalPaise)}</td></tr>
                {paid(bill) > 0 && <tr><td>Paid so far</td><td className="text-right tabular-nums">{formatPaise(paid(bill))}</td></tr>}
                <tr className="font-semibold text-[var(--brand-strong)]"><td>Balance due</td><td className="text-right tabular-nums">{formatPaise(balance)}</td></tr>
              </tfoot>
            </table>

            <form onSubmit={takePayment} className="mt-4 space-y-3 border-t border-stone-100 pt-4">
              <div className="flex gap-2">
                {['CASH', 'UPI', 'CARD'].map((m) => (
                  <Button key={m} type="button" variant={pay.method === m ? 'primary' : 'secondary'} onClick={() => setPay({ ...pay, method: m })}>{m}</Button>
                ))}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Amount ₹" hint={`Leave empty to collect the full ${formatPaise(balance)}`}>
                  <Input type="number" min={0.01} step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                </Field>
                {pay.method !== 'CASH' && <Field label={pay.method === 'UPI' ? 'UPI reference' : 'Card slip no.'}><Input maxLength={64} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>}
              </div>
              <Button type="submit" className="min-h-11 w-full text-base" disabled={action.busy || balance <= 0}>Take payment</Button>
            </form>

            {paid(bill) === 0 && (
              <form onSubmit={applyDiscount} className="mt-3 flex items-end gap-2">
                <Field label="Discount ₹"><Input type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} /></Field>
                <Button type="submit" variant="secondary" disabled={action.busy}>Apply</Button>
              </form>
            )}
          </Card>
        ) : (
          <Card><Empty>Select a bill to settle it.</Empty></Card>
        )}
      </div>

      {closing.data && (
        <Card title="Today at the register" className="mt-4">
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div><dt className="text-stone-500">Bills paid</dt><dd className="text-xl font-semibold tabular-nums">{closing.data.ordersPaid}</dd></div>
            <div><dt className="text-stone-500">Collected</dt><dd className="text-xl font-semibold tabular-nums">{formatPaise(closing.data.netCollectedPaise)}</dd></div>
            <div><dt className="text-stone-500">Cash / UPI / Card</dt><dd className="tabular-nums">{['CASH', 'UPI', 'CARD'].map((m) => formatPaise(closing.data!.byMethod[m] ?? 0)).join(' / ')}</dd></div>
            <div><dt className="text-stone-500">GST collected</dt><dd className="tabular-nums">{formatPaise(closing.data.taxPaise)}</dd></div>
          </dl>
          {(closing.data.unpaidOrders > 0 || closing.data.refundsPaise > 0) && (
            <p className="mt-3 text-sm text-amber-800">{closing.data.unpaidOrders} unpaid bill(s){closing.data.refundsPaise ? ` · refunds ${formatPaise(closing.data.refundsPaise)}` : ''}</p>
          )}
        </Card>
      )}

      {invoice && (
        <div role="dialog" aria-modal="true" aria-label="Tax invoice" className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-black/40 p-4 print:static print:bg-white print:p-0">
          <div className="w-full max-w-md rounded-lg bg-white p-6 text-sm print:max-w-none print:rounded-none">
            <h2 className="text-center text-lg font-semibold">{invoice.seller.name}</h2>
            <p className="text-center text-xs text-stone-500">{invoice.seller.address}{invoice.seller.gstin ? ` · GSTIN ${invoice.seller.gstin}` : ''}</p>
            <p className="mt-3 text-center font-medium">TAX INVOICE</p>
            <p className="flex justify-between text-xs"><span>{invoice.invoiceNumber}</span><span>{formatDateTime(invoice.date)}</span></p>
            <p className="text-xs text-stone-500">Order {invoice.order.label}{invoice.order.tableCode ? ` · Table ${invoice.order.tableCode}` : ''}</p>
            <table className="mt-3 w-full">
              <tbody>{invoice.items.map((i, n) => <tr key={n}><td className="py-0.5">{i.quantity}× {itemLine(i)}</td><td className="text-right tabular-nums">{formatPaise(i.lineTotalPaise)}</td></tr>)}</tbody>
              <tfoot className="border-t border-stone-200">
                <tr><td className="pt-2">Subtotal</td><td className="pt-2 text-right tabular-nums">{formatPaise(invoice.subtotalPaise)}</td></tr>
                {invoice.discountPaise > 0 && <tr><td>Discount</td><td className="text-right tabular-nums">−{formatPaise(invoice.discountPaise)}</td></tr>}
                <tr><td>CGST</td><td className="text-right tabular-nums">{formatPaise(invoice.cgstPaise)}</td></tr>
                <tr><td>SGST</td><td className="text-right tabular-nums">{formatPaise(invoice.sgstPaise)}</td></tr>
                <tr className="font-semibold"><td>Total</td><td className="text-right tabular-nums">{formatPaise(invoice.totalPaise)}</td></tr>
              </tfoot>
            </table>
            <p className="mt-2 text-xs text-stone-500">Paid: {invoice.payments.map((p) => `${p.method} ${formatPaise(p.amountPaise)}`).join(', ')}</p>
            <p className="mt-3 text-center text-xs text-stone-400">Thank you for dining at {tenant.name}</p>
            <div className="mt-4 flex justify-center gap-2 print:hidden">
              <Button onClick={() => window.print()}>Print</Button>
              <Button variant="secondary" onClick={() => setInvoice(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
