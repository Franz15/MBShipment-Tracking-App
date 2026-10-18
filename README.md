# Shipment Tracking App

Prototype for the MarsBased technical test. One view of every shipment, for customers and for the operations team, built from operator messages in different formats.

Live: https://mb-shipment-tracking-app.vercel.app/

The home page has a suggested walkthrough through both roles. Data is synthetic and the AI is simulated: every AI output is precomputed in `src/data.ts` and labelled in the UI. The prototype never shows a status or a date that the data does not support.

## Run it

```bash
npm install
npm run dev
npm test
```

Tested with Node 24. `npm run build` prerenders every page as static HTML.

## Code

- `src/domain.ts`: shipment model and pure rules (status, expected date, exceptions). No React.
- `src/adapters.ts`: turns each operator's raw message format into tracking events. AI readings below 0.9 confidence wait for human review.
- `src/data.ts`: synthetic sites, accounts, operators, shipments, raw messages and the mocked AI outputs.
- `src/ui.tsx`, `src/live.tsx`: shared components and the client side demo state (kept in localStorage, so two windows stay in sync).
- `src/map.tsx`: route map (MapLibre, OpenFreeMap vector tiles, OpenStreetMap data).
- `src/app/`: routes for the landing page, the customer portal and the operations portal.
- `src/domain.test.ts`: Vitest suite for the domain rules.

Design notes, scope and the path to production are in the write-up.
