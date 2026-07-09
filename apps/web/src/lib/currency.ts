// Centralised GHS currency formatting. Amounts move over the wire and
// through the DB as `amountMinor` (integer pesewas — GHS's minor unit,
// 100 pesewas = GH₵ 1), same convention as `fee_items.amount_minor` /
// `learner_fees.amount_minor` / `fee_payments.amount_minor` on the API
// side. Never format a minor-unit integer with ad-hoc `/100` + string
// concat scattered across components — use this instead.

const FORMATTER = new Intl.NumberFormat("en-GH", {
  style: "currency",
  currency: "GHS",
  currencyDisplay: "narrowSymbol",
});

/** `12345` (pesewas) → "GH₵123.45". */
export function formatCedis(amountMinor: number): string {
  return FORMATTER.format(amountMinor / 100);
}
