# Pricing & Cost Analysis

Reference doc for pricing decisions on the UHAS Basic School SMS deployment and future similar customers. Not a contract — informs the proposal you'll draft separately.

Last reviewed: 2026-05-21.

---

## Customer profile (UHAS Basic School)

| Attribute | Value |
|---|---|
| Type | Private basic school |
| Location | Volta region, Ghana |
| Funding | Out-of-pocket (school revenue, not donor / GES) |
| Teaching staff | 50 |
| Admin staff | 2 |
| Head of school | 1 |
| Deputy heads | 1 |
| Students | ~350 |
| **Total users** | **~404** |
| School cycle | 3 terms / year |
| Provider location | Europe (you) |
| Currency exposure | GH₵ (customer) → € (provider), via Wise/Paystack |

---

## What's been built (replacement cost analysis)

Modules shipped:

- Phase 1: real Firebase Auth (no emulator in prod), role-based proxy, session cookies, reset password, session-expiry watcher
- Students: registration, edit, transfer, audit-logged
- Staff: registration, edit, deactivate, audit-logged
- Class structure: KG 1/2, Primary 1–6, JHS 1–3 (single stream per level)
- Attendance: student + staff sheets, "Mark all present", leave requests
- Exams: scoring, automatic grade + interpretation + position computation, publish/unpublish
- Lesson plans: full Teacher → Unit Head → Deputy Head approval chain, file attachments
- Schemes of work: term scheme creation, file uploads
- Assignments: per-class assignments with attachments
- Report cards: per-student, per-term, with print layout
- Student promotion workflow (end-of-year): Admin opens season → Teacher submits → DH approves → enrollments materialise
- Announcements (school-wide / role-scoped / division-scoped)
- Calendar + events
- Parent-teacher appointment booking
- Parent portal (children, attendance, results, assignments, appointments)
- Profile pages (with photo upload via Firebase Storage)
- Audit log viewer (all sensitive admin mutations tracked, side-by-side diff view)
- In-app notifications (9 event types, polling, mark-on-open)
- Admin Settings (Identity, Calendar, Grading, Security, Communication, Branding)
- File uploads (photos public-read; documents signed-URL-only)
- Email (Gmail SMTP, lesson-plan rejection wired; extendable)
- Mobile-responsive everywhere
- Vitest layer 1 + 2 (142 tests) + Playwright E2E (9 specs)
- CI/CD on GitHub Actions
- Deployment on Railway + Neon Postgres + Firebase

**Estimated build effort:** 400–600 hours of senior full-stack work.

**Replacement cost at European rates:**

| Hourly rate | 400 hrs | 600 hrs |
|---|---|---|
| €50/hr (junior) | €20,000 | €30,000 |
| €75/hr (mid) | €30,000 | €45,000 |
| €100/hr (senior) | €40,000 | €60,000 |

**Conclusion:** the system is worth €25,000 – €50,000 if built fresh by anyone else. We're not going to invoice that to a single school — that's the headline anchor for negotiation, not the asking price.

---

## Recommended pricing for UHAS

### Pricing structure

```
Implementation (Year 1, one-time)
  • System build & deployment .................. € 5,000     (~₵60,000)
  • Setup, data migration, staff training ...... €   800     (~₵10,000)
  Total Year 1 implementation .................. € 5,800     (~₵70,000)

Annual subscription (Year 2 onwards)
  ...........................................   € 3,000     (~₵36,000 / year)
                                                            (~₵12,000 / term × 3)

Included in annual subscription:
  • Cloud hosting (Railway + Neon + Firebase) ~ €25/mo cost
  • Bug fixes within 5 business days
  • 8 hours/year of feature changes / customizations
  • Email support, 48-hour response
  • Twice-yearly platform updates

Out of scope (billed separately):
  • Major new modules (fee management, payroll, transport)
  • On-site visits or extended training
  • Hours over the included 8/year — billed at € 80/hour
  • Third-party integrations (Paystack, WhatsApp gateway, etc.)
  • Data exports / migrations to other platforms
```

### Year 1 cash flow

```
On contract sign:        € 3,000     50% of implementation
On go-live:              € 2,800     Implementation remainder
End of Term 1:           € 1,000     Subscription
End of Term 2:           € 1,000     Subscription
End of Term 3:           € 1,000     Subscription
─────────────────────────────────────
Year 1 total:            € 8,800     (~₵106,000)
```

### Year 2+ cash flow (steady-state)

```
End of each term:        € 1,000     × 3 = € 3,000/year     (~₵36,000)
```

### Per-user economics

- Subscription €3,000 / 404 users = **€7.43 per user per year** (~₵90)
- Comparable to other regional SMSes for the customisation/dedicated-support tier

---

## Term-based billing rationale

Schools collect fees per term — billing in sync with their inflow reduces payment friction. Three invoices per year, not twelve.

**Invoice schedule** (calendar aligns with Ghana academic year):

| Invoice | Due | Amount |
|---|---|---|
| Term 1 (Sep–Dec) | end of Term 1 | € 1,000 |
| Term 2 (Jan–Apr) | end of Term 2 | € 1,000 |
| Term 3 (May–Aug) | end of Term 3 | € 1,000 |

Net 14 days. 1.5% / month late fee after 30 days.

**Why not annual upfront only?** Schools have lumpy cash flow — term-aligned billing matches their reality and improves on-time payment rates.

**Why not monthly?** 12 invoices/year is overhead with no benefit. Per-term is the local norm.

---

## Comparison: SchoolPad

| Axis | SchoolPad (estimated) | This product |
|---|---|---|
| **Annual cost (small school)** | $200–$500 (~₵2,500–6,000) | €3,000 (~₵36,000) |
| **Multiple vs single price** | Per school, SaaS | Per school, your build |
| **Setup fee** | None / minimal self-serve | €5,800 one-time |
| **Customization** | Limited; their roadmap | Per-school; included hours each year |
| **Support response** | 24–72h queue | 48h, direct relationship |
| **Data ownership** | Their cloud; export on request | Their data, your platform; SQL/CSV export in contract |
| **Mobile app** | Native Android (Yes) | Web responsive (PWA roadmap; native deferred) |
| **Multi-school capability** | Mature | Single-tenant (multi-tenancy deferred) |
| **Payment integration** | Some local methods | Not built; Paystack add-on possible |
| **Local presence** | Lagos/Nigeria-based, distributors in Ghana | Solo provider, EU-based |
| **Branding** | Theirs | Theirs |
| **Lock-in risk** | High (their stack) | Low (data exportable, contract terms) |

### Where you win

1. **Bespoke fit** — Ewe-aware naming, KG → JHS structure, GES grading bands baked in. SchoolPad is one-size-fits-all.
2. **Direct relationship** — a single phone number that reaches you. For relationship-driven institutions, this is undervalued in feature comparisons.
3. **Speed of change** — feature requests in days, not quarters.
4. **Tailoring** — UHAS-specific branding, workflows.

### Where you lose

1. **Price** — 5–10× more expensive headline.
2. **Mobile** — they have a native app; you don't yet.
3. **Maturity** — they have 1000+ schools; you have 1.
4. **Multi-school readiness** — they're built for many; you're built for one.

### Implication for sales

Don't compete on price. The pitch is **"premium, dedicated, customised, owned-by-you."** Schools that want cheapest possible cloud SMS will choose SchoolPad. Schools that want a partner who knows them by name will choose you.

That positioning has a real ceiling — probably 15–30% of the addressable Ghana basic-school market. The majority will prefer cheaper tiered SaaS.

---

## Revenue math at scale

What it takes to make this a viable European business:

```
Target monthly net income:         € 4,000 – € 8,000
Per-customer annual revenue:       € 3,000 (steady-state)
Per-customer monthly equivalent:   €   250

Customers needed for low target:   ~ 16 customers @ € 4,000/mo
Customers needed for high target:  ~ 32 customers @ € 8,000/mo
```

**Honest assessment for 1 customer (UHAS only):**

- UHAS alone generates ~€250/mo of recurring revenue.
- Far below a viable business income.
- Either this remains a side project, or you scale to 10+ schools.
- Scaling requires the multi-tenancy work currently deferred + a sales pipeline.

**Path to scale**:

1. Year 1: ship UHAS, get them happy, document case study.
2. Year 1–2 in parallel: multi-tenancy refactor (~80 hrs of work, see `docs/implementation-spec.md`).
3. Year 2: target 5 more schools at €3,000/yr each → €15,000/yr additional revenue.
4. Year 3: target 10 more → €30,000/yr additional.
5. By Year 4–5: 20+ schools at €3,000/yr = €60,000/yr stable recurring.

That's a small lifestyle business at the high end, not VC-scale. Acceptable for "European standard of living" if you keep overhead lean.

---

## Optional add-on features (additional revenue)

### Payment portal — ~10–15 hrs to build

In-app billing module:
- Invoices (term-aligned), pay-now button → Paystack hosted checkout
- Webhook posts back, updates invoice status
- Receipt PDFs emailed
- Admin dashboard: outstanding balance, payment history

**One-time charge to UHAS:** €1,200 – €1,800.

**Ongoing:** included in subscription. Paystack fees (~1.5–2.5% per transaction) are absorbed in your margin or passed through transparently.

### Feature request tracker — ~8–12 hrs to build

In-app request management:
- Admin form to submit feature requests
- Status workflow (received → reviewed → scoped → in-progress → done)
- Attach quote to scoped requests (hours + price)
- Generates invoice for accepted out-of-scope work

**One-time charge to UHAS:** €800 – €1,200.

**Ongoing benefit to you:** a structured channel for billable work beyond the included 8 hrs/yr, plus a queue of demand to prioritize for future tenants.

### Combined: payment + feature tracker

**Bundle as "Admin Operations" module:** €2,000 – €2,500 one-time. Build effort: ~20–25 hrs.

---

## Negotiation room

Acceptable concessions if needed:

1. **5–10% discount for 2-year prepay** — improves cash flow, locks them in.
2. **Reduce setup to €4,500** if they balk at €5,800 — preserves margin on subscription.
3. **Subscription tier-down**: drop to €2,400/yr (~€800/term) if they can't go higher. Margins thin but cash-positive.
4. **First-year subscription waived** if implementation fee is paid in full upfront (€5,800 + €0 = €5,800 Year 1, then €3,000/yr from Year 2). Speeds the close, doesn't change long-term economics significantly.

Floors (don't go below):

- **Implementation: €4,000 absolute floor**. Below this you're losing money on Year 1.
- **Subscription: €2,000/year absolute floor**. Below this you don't cover hosting + a single support hour.
- **Hourly out-of-scope: €60 absolute floor**. Below European-junior-dev rate.

---

## Termination and data

Contract language (draft, not legal advice):

1. **30-day notice for non-renewal** by either party at end of any term.
2. **Data export on termination**: SQL dump + CSV bundle, delivered within 14 days of termination.
3. **Account read-only for 90 days post-termination**: school can log in to view, can't modify.
4. **Full deletion 90 days after termination**, unless they request earlier or extend.
5. **Final invoice settles within 30 days** of termination notice — owe what was used through end of last paid term.

---

## Open questions to resolve before drafting the proposal

1. **GH₵ or € as the invoice currency?** — Euro is safer for you (no FX exposure), but Ghana schools usually pay in cedis. Most realistic: invoice in GH₵ at the spot rate when contract is signed, with an annual reset clause. Or invoice in € with the school assuming FX risk (cleaner for you).

2. **VAT / WHT obligations?** — Ghana's withholding tax on services to foreign providers is typically 15%. If they withhold, you receive 15% less. Confirm with a Ghana accountant before signing.

3. **Liability cap?** — recommend capping at the previous 12 months' fees. Avoids unbounded exposure if something goes sideways.

4. **Service Level commitments?** — what's the uptime promise? Suggest "99% monthly, excluding scheduled maintenance, with 4-hour response on outages."

5. **Hosting in school name vs your name?** — if Railway/Neon/Firebase are billed to your account, you have the leverage but also the responsibility. If billed to school, they control the cost but you've handed them the keys. Recommend: your name, infrastructure cost passed through transparently.

---

## Bottom-line ask to UHAS

```
Year 1 total cost:      € 8,800   (~₵106,000)
  • Build & deployment:                 € 5,000
  • Setup, training, migration:         €   800
  • Term subscriptions (3 × €1,000):    € 3,000

Year 2+ recurring:      € 3,000/year   (~₵36,000)
                        ~ € 1,000/term (~₵12,000)

Optional Admin Operations module (Year 1 add-on): € 2,000 – € 2,500 one-time
```

That's the number. Build the proposal around it; negotiate within the floors above.
