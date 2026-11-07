/**
 * Order money maths (all integer paise). Menu prices exclude GST; GST is per line at the item's
 * rate, then scaled down proportionally when a bill discount is applied.
 */
export interface PricedLine {
  unitPricePaise: number;
  quantity: number;
  taxRateBps: number;
}

export function lineTotal(l: PricedLine) {
  return l.unitPricePaise * l.quantity;
}

export function totals(lines: PricedLine[], discountPaise = 0) {
  const subtotalPaise = lines.reduce((s, l) => s + lineTotal(l), 0);
  const discount = Math.min(Math.max(0, discountPaise), subtotalPaise);
  const grossTax = lines.reduce((s, l) => s + Math.round((lineTotal(l) * l.taxRateBps) / 10_000), 0);
  const taxPaise = subtotalPaise === 0 ? 0 : Math.round((grossTax * (subtotalPaise - discount)) / subtotalPaise);
  return { subtotalPaise, discountPaise: discount, taxPaise, totalPaise: subtotalPaise - discount + taxPaise };
}
