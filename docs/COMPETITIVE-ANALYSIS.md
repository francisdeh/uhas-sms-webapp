# Competitive Analysis & Feature Roadmap

Reference doc benchmarking the UHAS SMS against typical school-ERP competitors in the Ghana / West Africa market. Companion to [PRICING.md](PRICING.md) — what we charge depends on what we offer.

Last reviewed: 2026-05-21.

> **Caveat**: competitor feature lists and pricing referenced here are based on public material and recall — verify current specifics on each vendor's site before quoting them in a sales conversation.

---

## Competitors observed

| Product | Origin | Typical market | Notes |
|---|---|---|---|
| **SchoolPad** | Nigeria | Basic schools across Nigeria + Ghana | Biggest regional incumbent. Mature, tiered SaaS, native Android app. |
| **iSchool** | Ghana | Basic + SHS | Locally relationship-driven, weaker UX. |
| **TopHat** | Ghana | Basic + SHS | Newer; growing. |
| **ClassEra** | Global | Wide, K-12 | English-speaking markets, hosted SaaS. |
| **Fedena** | India (open source) | Self-hosters worldwide | Free + paid hosting; older UI. |
| **Bdash / SchoolMate** | Nigeria | Basic + SHS | Direct competitors to SchoolPad. |
| **Edu Spence** | Ghana | Mostly private schools | Older; weak on mobile. |

The dominant pricing model is **per-school annual SaaS, $200–$500/year** for small schools — that's the market floor.

---

## Feature gap analysis

### Core SIS (we have parity or better)

| Feature | We have | Most competitors | Notes |
|---|---|---|---|
| Student records | ✅ | ✅ | — |
| Staff records | ✅ | ✅ | — |
| Class structure | ✅ | ✅ | We're single-stream + GES-aligned. |
| Subjects | ✅ | ✅ | — |
| Attendance (student) | ✅ | ✅ | We have "Mark all present" bulk action. |
| Attendance (staff) | ✅ | Sometimes | We're stronger here. |
| Leave requests | ✅ | Rare | Differentiator. |
| Examinations + scoring | ✅ | ✅ | We auto-compute grade + interpretation + position. |
| Report cards | ✅ | ✅ | We have print layout. |
| Lesson plans | ✅ + workflow | Just submit/view | **We're significantly stronger** — Teacher → Unit Head → DH review chain. |
| Schemes of work | ✅ | Sometimes | — |
| Assignments | ✅ | ✅ | — |
| Announcements | ✅ + audience scoping | ✅ | We have division-scoped delivery. |
| Calendar | ✅ | ✅ | — |
| Parent-teacher appointments | ✅ | Sometimes | — |
| Audit log | ✅ + diff viewer | Rare | **Differentiator** — compliance + trust. |
| In-app notifications | ✅ + 9 event types | Basic | We have a real per-recipient model. |
| Admin settings (school config) | ✅ | Basic | — |
| Promotion workflow | ✅ + transactional | Hand-wavy | **Differentiator** — most competitors have no real year-end transition. |
| Photo uploads | ✅ | ✅ | Through Firebase Storage. |
| Document uploads (signed URLs) | ✅ | ✅ | — |
| File attachments on plans/assignments | ✅ | Sometimes | — |
| Mobile responsive | ✅ | Mixed | We're web-only; some have native. |

### Features competitors have that we don't

Ranked by gap severity:

| Feature | We have | Gap | Why it matters |
|---|---|---|---|
| **Fee management** | ❌ | **Critical** | Every Ghana school evaluating an SMS asks "does it handle fees?" first. Without it you lose ~50% of leads. |
| **SMS gateway** | ❌ | **Critical** | Most Ghanaian parents have feature phones or data-light plans. SMS is *the* communication channel for absence alerts, fee reminders, results published. |
| **WhatsApp integration** | ❌ | High | ~80% WhatsApp adoption in Ghana. Many schools currently run on WhatsApp groups. |
| **Timetable / period scheduling** | ❌ | High | Visible weak spot — every competitor has it. We deferred. |
| **Library management** | ❌ | Medium | Many basic schools have a library; checkout tracking expected. |
| **Inventory / asset tracking** | ❌ | Medium | Computers, projectors, sports equipment. |
| **Behavior / discipline tracking** | ❌ | Medium | Demerit logs, incident reports, counselor notes. |
| **Online admissions** | ❌ | Medium-low | Growing demand; admissions UX is where new parents form first impression. |
| **Health records / sick bay log** | ❌ | Medium-low | Allergies + medications expected; full medical isn't. |
| **Transport / bus management** | ❌ | Low | Day-school dependent. |
| **Cafeteria / meal management** | ❌ | Low | Most basic schools either don't run one or run informal. |
| **HR / payroll** | ❌ | Low | Separate market; explicitly scoped out. |
| **Hostel / boarding** | ❌ | N/A | UHAS is day-school. |
| **Online learning / video class** | ❌ | Low | Post-COVID is back in-person. |
| **Question bank / online CBT** | ❌ | Low | Most basic schools still paper. |

---

## What we have that competitors typically don't

1. **Audit log with side-by-side diff view** — compliance-grade tracking, rare in this market.
2. **3-tier lesson-plan review chain** — Teacher → Unit Head → DH approval. Real academic supervision, not just "submit a plan".
3. **Transactional promotion workflow** — most SMSes hand-wave year-end; we have a real workflow with approvals + audit.
4. **Granular notification preferences via Admin Settings** — per-event email gating.
5. **Modern codebase** — easy customization. Not a customer-visible feature, but a real sales talking point and operational advantage.
6. **Mobile-responsive everywhere** — works on any device today; only the native-app box is unchecked.

---

## Top 5 features to add for the Ghana market

Ranked by **return on engineering investment** (revenue impact ÷ effort).

### 1. Fee management — **~40–60 hrs**

Components:
- Fee structures per class per term (tuition, books, exam, sports, uniform, etc.)
- Auto-generate term invoices for every active enrollment
- Pay-now button → **Paystack** (MoMo + card + bank transfer)
- Receipts auto-emailed + downloadable PDF
- Outstanding / overdue tracking with parent reminders
- Bursaries, scholarships, sibling discounts
- Financial reports for admin (collection rates, term totals)
- Audit log on every fee adjustment

**Pricing impact**: justifies a **25–40% subscription bump** (€3,000 → €3,800–4,200/year). Transforms the product from "academic admin" to "school operations". Single largest revenue lever.

### 2. SMS gateway — **~10–15 hrs**

Components:
- Plug into mNotify / Hubtel / Twilio-Ghana SMS API
- Trigger events: absence today, fee reminder, results published, urgent announcement
- Per-school SMS credit pool, topped up via Paystack
- Falls back from in-app notification to SMS for users who haven't opened the app recently
- Admin dashboard shows SMS usage + balance

**Pricing impact**: minor subscription premium + transparent SMS top-up revenue (3–10% margin per SMS). Makes the platform's communication side actually reach 100% of recipients.

### 3. Timetable management — **~30–40 hrs**

Components:
- Period structure (e.g. 8 periods/day × 5 days)
- Subject + teacher + class + room allocation per period
- Conflict detection: teacher can't be in two rooms, room can't host two classes
- Per-teacher view ("my week")
- Per-class view ("our timetable")
- Substitute overrides when a teacher is on approved leave
- Print-friendly layout

**Pricing impact**: removes a sales objection. Schools assume this is in every SMS. Without it we look unfinished.

### 4. WhatsApp Business API integration — **~20–30 hrs**

Components:
- Connect to WhatsApp Business via Meta Cloud API or Twilio
- Mirror SMS triggers but deliver via WhatsApp where available
- Two-way: parents can text structured queries ("FEE 2025-0021" → balance reply)
- Bulk messaging to defined audiences (e.g. all JHS 3 parents)
- Audit log of sent messages

**Pricing impact**: unique value prop for the Ghana market. Justifies a **€1,000+ one-time integration fee** + WhatsApp API costs passed through. Replaces the school's ad-hoc WhatsApp group with structured communication.

### 5. Online admissions — **~25–35 hrs**

Components:
- Public application form (no login required)
- Document uploads: birth certificate, transfer letter, photo
- Application tracking dashboard for admin
- Entrance exam scheduling (date + time + venue)
- Acceptance / rejection email workflow with templates
- Auto-create student record on acceptance

**Pricing impact**: seasonal but useful selling point. Strong for schools competing for enrollment.

---

## Top 3 differentiators (not parity — advantage)

### 1. AI-assisted lesson plans / report comments — **~25–35 hrs**

- "Generate this week's lesson plan from my scheme of work" → LLM call → editable draft
- "Suggest a personalized comment for each student" → consume their term scores + attendance + lesson record → 30 draft comments
- Teacher always reviews / edits before save — no auto-publish

LLM call costs are small (~$0.001–$0.005 per generation). Real productivity win for teachers stuck writing 30 report comments at term-end.

**Pricing impact**: premium module, **+€500–€1,000/year** on subscription.

### 2. Mobile PWA + offline mode — **~30–50 hrs** (already in roadmap)

- Installable on Android / iOS home screen
- Offline reads for already-fetched data (attendance roster, lesson plans, results)
- Background sync when connection returns

Ghana network coverage is patchy. PWA dominates this conversation cheaply.

**Pricing impact**: "premium" tier feature; differentiator vs SchoolPad's "you need data to do anything".

### 3. Parent-teacher chat — **~25–40 hrs**

- Threads per student, opt-in
- Teacher availability hours respected
- Admin oversight for safeguarding (all chats logged + auditable)
- Notifications via in-app + SMS + WhatsApp (if those modules exist)

Competitor offerings of this are weak. Real parent-satisfaction driver.

**Pricing impact**: subscription bump or per-school add-on.

---

## Out of scope for UHAS / basic-school market

These features are common in larger / boarding / SHS systems but not worth building for the basic-school segment:

| Feature | Why skip |
|---|---|
| Hostel / boarding | UHAS is day. Different market. |
| Cafeteria management | Most Ghana basic schools either don't have one or run informal. |
| Online class / video meetings | Post-COVID is in-person again. |
| Online CBT / question bank | Basic schools still do paper exams. JHS BECE mocks rarely need full CBT. |
| Transport management | Mostly relevant for private day schools with buses. Future tier. |
| Full HR / payroll | Separate market; schools use Excel or dedicated payroll tools. |
| Alumni management | Basic schools don't run alumni programs. SHS / university only. |

---

## Where we win on positioning

You're not competing on price — SchoolPad will always win cost-sensitive shootouts. The pitch:

1. **Bespoke fit** — Ewe-aware naming, KG → JHS structure, GES grading bands baked in, UHAS-specific branding. Generic SaaS can't match.
2. **Direct relationship** — a phone number that reaches *you*, not a ticket queue. Underrated value for relationship-driven Ghanaian institutions.
3. **Speed of change** — feature requests in days, not quarters.
4. **Data + platform ownership clarity** — contract guarantees data export, transparent hosting.
5. **Modern UX** — competitors mostly look 2014. Real difference.
6. **Workflows competitors hand-wave** — lesson plan reviews, audit log, promotion workflow.

Target customer profile: **schools that value quality, relationship, and customization over the lowest sticker price**. That's a real segment — probably 15–30% of the Ghana basic-school market. Don't chase the other 70–85%; they'll always go cheap.

---

## Recommended roadmap

Engineering hours estimated for solo dev at sustained pace.

### Now (next 2 months) — ~50–75 hrs

1. **Fee management** (#1 priority — biggest revenue lever + competitive gap)
2. **SMS gateway** (#2 priority — unblocks real communication value)

After these two ship, your subscription justifies €3,800–4,200/year, not €3,000. That delta funds your time.

### Soon (months 2–4) — ~80–110 hrs

3. **Timetable** — kills a sales objection
4. **Multi-tenancy refactor** — already deferred; **must** land before selling school #2

### Then (months 4–6) — ~80–100 hrs

5. **Mobile PWA** — unblocks data-poor environments
6. **WhatsApp Business API** — unique market value prop

### Later (post-PMF) — opportunistic

7. **AI-assisted lesson plans / comments** — premium tier
8. **Online admissions** — seasonal but real
9. **Library / inventory** — fill the gaps
10. **Parent-teacher chat** — differentiation

### Defer indefinitely unless a customer asks

- HR / payroll, hostel, transport, cafeteria, video class, online CBT, alumni

---

## Sequencing rationale

**Why fees + SMS first**, not the obvious "ship more academic modules":

- Both are blockers in the sales conversation. You'd be quoting €3,000+/year against SchoolPad at $300/year — you need overwhelmingly better feature parity AT LEAST on operational basics (fee + comms) before differentiation matters.
- Both directly drive revenue: fees + SMS top-ups become a fee revenue line per school, not just subscription.
- Both have well-understood scopes; not greenfield invention.

**Why timetable before mobile PWA**:

- Timetable is feature parity (competitors all have it). PWA is differentiator (most don't).
- Sales conversations dead-end on "no timetable?" faster than on "no offline mode?".

**Why multi-tenancy before more schools**:

- Currently every new school requires a separate Railway service, Neon DB, Firebase project. That's ~3 hours per school setup *and* ongoing cost. Multi-tenancy turns school onboarding into a 30-minute admin task and drives infrastructure cost per school toward zero. The break-even point is roughly school #3.

---

## Effort & revenue projection

If you execute the "Now → Soon → Then" tracks over 6 months, the product evolves like this:

```
Month 0 (today):
  Features: parity on academic; gaps on fees + SMS + timetable
  Sustainable subscription ceiling: ~€3,000/yr
  Realistic conversion rate vs SchoolPad: ~10–15%

Month 2 (after fees + SMS):
  Features: + fee management + SMS gateway
  Sustainable subscription: ~€4,000–4,200/yr
  Plus SMS top-up margin: ~€20–80/mo per school
  Realistic conversion rate: ~20–25%

Month 4 (after timetable + multi-tenancy):
  Features: + timetable; product is now multi-school-ready
  Sustainable subscription: ~€4,200/yr
  Realistic conversion rate: ~30–35%

Month 6 (after PWA + WhatsApp):
  Features: + PWA + WhatsApp; differentiation tier
  Sustainable subscription: ~€4,800–5,500/yr (premium tier)
  Realistic conversion rate: ~35–40%
```

If you land 5 schools by month 6 at avg €4,500/yr = €22,500/year recurring. Plus implementation fees on those (5 × €5,000 = €25,000 in Year 1 one-time). Total Year 1 income from sales: ~€47,500. That's enough runway to fund the multi-tenancy work and one more cycle.

By month 12, target 10 schools = €45,000 recurring. By month 24, target 20 schools = €90,000 recurring + ~€30,000 implementation income = roughly €120,000 annualized.

That's the path from "1 customer pilot" to "viable European-lifestyle business".

---

## Things to validate before betting on this roadmap

1. **UHAS willingness to pay for fee management** — would they pay an extra €1,000/year to have fees + SMS shipped to them? If yes, it pays for itself. If no, multi-tenancy comes first and we treat UHAS as a free beta on those modules in exchange for case-study rights.

2. **Sales pipeline existence** — is there a path to school #2 and #3? Without that, premature engineering investment is risky. The roadmap above assumes you'll actively sell, not just wait for inbound.

3. **Paystack / Hubtel / mNotify business accounts** — verify you can open these from Europe. Most require Ghana-resident director / Ghana phone number. Possible workarounds: partner with a Ghana-based operator who fronts the merchant account; you split revenue.

4. **WhatsApp Business API approval** — Meta has tightened verification. Worth checking eligibility before committing engineering to it.

5. **Multi-tenancy effort** — the deferred-tasks spec estimates this; verify the estimate by spec'ing it in detail before starting. Specifically: tenant-aware Firebase claims (one project per tenant or shared project with claim filtering?) is a non-trivial design call.
