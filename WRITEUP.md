# Shipment Tracking: write-up

Prototype: https://mb-shipment-tracking-app.vercel.app/
Repository: https://github.com/Franz15/MBShipment-Tracking-App

## 1. Where the AI goes, and how

The prototype runs no AI. Every AI output is precomputed in `src/data.ts` or built by code from the shipment views, and labelled as AI in the UI. Below is how each piece works in production. In both, status comes from deterministic rules over events (section 2). AI only feeds those rules or writes text for people.

**1. Reading operator emails (operations).**
*Prototype:* two emails with a fixed extraction, one applied at 0.94, one waiting for review at 0.78 because it has two dates.
*Production:*
1. Match the email to a shipment with a regex on references. No match goes to a manual inbox.
2. LLM with structured output (JSON schema) returns `{code, kind, at, location, evidence}`, choosing from the canonical codes and the shipment's legs.
3. Code validates the schema, the date, that the transition is allowed, and that `evidence` appears verbatim in the email.
4. Confidence is computed in code from those checks plus agreement between two runs, calibrated on labelled real messages.
5. ≥ 0.9 writes the event, below goes to review. Approved recurring phrases ("INCIDENCIA: AUSENTE") move to a deterministic mapping table.

**2. Arrival range (both roles).**
*Prototype:* a fixed range per shipment.
*Production:* machine learning, not an LLM. LightGBM with quantile loss at p10, p50 and p90 predicts the remaining time to delivery on every new event. Features: lane, operator, mode, current leg and milestone, time in it, the carrier's past estimate error and customs history at the destination. Confidence comes from the range width and the number of similar shipments, the reasons from the top SHAP features. Target: about 80 % of arrivals inside the range, per lane. Lanes without enough history use plain p10 to p90 of past transit times.

**3. Exception copilot (operations).**
*Prototype:* a fixed briefing per team and fixed drafts.
*Production:* rules detect and rank exceptions. Code groups them by `{operator, location, type}` and the LLM writes one briefing line per group. Drafts (customer update, chase to the operator) use one template per type, and a check in code discards any draft with a date, reference or number not present in its input. In both versions, sending needs "I reviewed this draft", and no draft is offered while an operator email is pending review.

**4. Customer questions.**
*Prototype:* four fixed questions, answered by code from the table's data.
*Production:* LLM with tool calling. `listShipments()` and `getShipment(ref)` run with the session's account id, so other accounts are unreachable. Dates in answers must come from tool results.

**Running it.** Claude on AWS Bedrock, EU region. Small model for extraction, bigger one for drafts and answers. Versioned prompts, and every change runs against the evaluation set.

## 2. System approach, technology and integrations

**Prototype.** Next.js 16, React 19, TypeScript, Tailwind 4, Vitest and MapLibre on Vercel, all pages prerendered. Demo state lives in `localStorage` through `useSyncExternalStore`, and the `storage` event syncs two windows.

**Domain.** Two TypeScript modules with no React, reusable in a backend as they are. `adapters.ts` turns each format (DCSA JSON, Spanish free text, email plus AI) into a `TrackingEvent` that keeps a reference to its raw message. Unknown codes stay raw. `domain.ts` builds a `ShipmentView`:
- Status precedence: `delivered` > `on_hold` > `stale` > `delayed` > `at_risk` > `on_track`.
- Expected date, first that applies: carrier estimate (latest, plus the planned remaining legs, expired once past), calculated range if that estimate only covers an earlier leg, booking plan while it holds, calculated range, `Unknown`.
- Exceptions with a next action: upload a document, contact the operator or notify the customer.

The UI only renders `ShipmentView`. Tests cover adapters, the status of all 12 shipments, the date rules, the review threshold, the demo script and access.

**Production architecture.** One TypeScript repository: `apps/web` (Next.js on Vercel), `apps/worker` (pollers, inbox and queue on a container host, since serverless can't run long pollers) and `packages/domain` (the two modules above). Postgres holds `raw_events` (append only), `tracking_events`, a `shipments` projection and the queue (pg-boss).

Why a modular monolith: ingestion, rules and notifications share one model, and raw message, event, projection and queued notification are written in one Postgres transaction. Services would turn that into cross-service consistency, plus a pipeline, contracts and tracing each, for a small team. Modules depend in one direction, so extracting one later is moving a folder.

**Integrations.** Sea through a visibility aggregator such as project44, which covers every shipping line with one integration. Road through API, webhook, EDI IFTSTA or email with AI. ERP for shipments, legs and promised dates. One health check per connector, so an operator outage shows up as one incident.

**Freshness and notifications.** Operators update a shipment a few times a day, so the lag is in ingestion, and websockets would need infrastructure outside Vercel to save a minute at most. The UI polls every 60 s while the tab is visible and on focus, sending the last event id: no change means a 304 after one indexed query. 30 operations users and a few hundred customer sessions a day stay under half a million requests a month. Missing updates are caught by stale detection. Notifications fire on state transitions (`delayed`, `at_risk`, `on_hold`, failed delivery), deduplicated per shipment and type, by email or Teams, with a daily digest for operations.

**Scale.** Polling load depends on open tabs. 10,000 active shipments mean about 20,000 events a day, a few per second at peak, each recomputing one shipment in under a millisecond. The limits are external: carrier API quotas (aggregator webhooks for sea, batched polling for road), LLM rate limits (extraction runs from the queue), notification bursts when one incident hits many shipments (dedupe and digest), and the operations table (server side paging and filters).

**Access.** Prototype: persona in the URL and one `visible()` filter everywhere, so another account's shipment is a 404. Production: SSO and Postgres row level security by site, account and role.

## 3. Interface

- **Tables.** Operations compare shipments, which is reading down a column. Right aligned tabular dates and a separate `+Nd` avoid mental subtraction. `<table>` gives screen readers row and column headers.
- **Colour only for state, always with its word.** Red then always means a problem. The word covers colour blindness and WCAG 1.4.1.
- **Every date names its source.** Carrier, plan and calculation deserve different trust. A broken plan stays visible, crossed out, with the reason.
- **AI output looks different.** A dashed box with "Drafted by AI from …", so users know it's machine output before acting. Confidence in words, because "0.78" means nothing to a customer.
- **Mobile.** Customers check from the phone, so the expected date sits in the header above the fold. Columns hide by priority, so the status column always stays on screen.
- **Native and light.** `details`, checkbox and file input give keyboard and screen reader support without JavaScript. System font: 0 KB, no layout shift. Colour tokens per theme, because the same values fail contrast in dark mode, with contrast measured at 4.5:1 or more in both.

## 4. How I built it

- Seven phases, each deployed to Vercel from day one and checked on the live URL before the next.
- Domain and tests before any screen.
- A 20 point definition of done from the brief, each point ticked only after checking the deployment in both roles.
- AI coding tools for implementation, with every change reviewed. Before each commit, a simplicity review and a design checklist (contrast in both themes, targets ≥ 24 px, layout shift, 375 px mobile, Lighthouse).
- A final independent review of the code only, without the brief, found two bugs, both fixed: a carrier estimate for an earlier leg used as the expected date, and drafts shown while an email was pending review.

## 5. Decisions, trade-offs, assumptions and next steps

| Decision | Assumption | Trade-off |
|---|---|---|
| Status and dates as pure functions over events | Rules will change as we learn each operator, and a shipment has tens of events | Rule changes mean recomputing projections, but one function serves UI, tests and backend |
| Raw messages append only, events reference them | Mappings will sometimes be wrong | More storage, but a bad mapping is fixed by reprocessing |
| One adapter per format, operator differences as code tables | Operators mostly use DCSA, IFTSTA or email | A custom format needs a new adapter |
| Leg resolved from the booking reference | The ERP or TMS books per leg | Messages without a reference go to a manual inbox |
| Carrier estimate for an earlier leg is a lower bound, a calculated range beats it | Later legs and customs rarely beat the plan | The expected date can be later than the carrier's |
| AI extraction auto-applied only at ≥ 0.9 | A wrong status shown to a customer costs more than a review. Threshold tuned for about 99 % precision | Review volume depends on calibration |
| `stale` after 12 h on road, 96 h at sea | Road carriers report twice a day, ships at port calls or ETA changes | Long ocean legs can show "No signal" for nothing, until per lane thresholds |
| `delayed` never from the prediction | Only a carrier date, the plan or the promised date passing confirm a delay | A shipment almost surely late still shows `at_risk` |
| Map secondary, loaded on scroll | The timeline already explains the journey | About 230 KB gzip when shown, and free tiles need a paid service in production |

**Assumptions**

- The ERP provides a promised date per shipment. Without it, `delayed` can't be computed.
- Each operator message can be linked to a leg through the booking reference.
- Customs only applies outside the EU (UK and Mexico in the data).
- All timestamps are UTC.

**Next steps, in order**

1. Real ingestion: sea aggregator, one road carrier and the brokers' inbox into `raw_events`, with adapter tests per format.
2. SSO and row level security.
3. LLM extraction with an evaluation set and a review queue.
4. Notifications by email and Teams, with digests.
5. Arrival ranges from per lane percentiles, then a trained model.
6. Operations at scale: paging, filters, bulk actions, grouping by root cause.
7. More languages in the customer portal.
