// Synthetic data. Every shipment is one demo scenario; all dates sit around DEMO_NOW (Thu 12 Nov 2026, 10:00 UTC).
import type { Dcsa, Extraction, RawEvent } from "./adapters";
import type { Account, Leg, Operator, Persona, Prediction, Shipment, Site } from "./domain";

export const sites: Site[] = [
  { id: "zaragoza-plant", name: "Zaragoza plant" },
  { id: "bilbao-plant", name: "Bilbao plant" },
  { id: "valencia-warehouse", name: "Valencia warehouse" },
];

export const accounts: Account[] = [
  { id: "lyon-subsidiary", name: "Iberforge France" },
  { id: "uk-distributor", name: "Northbridge Distribution" },
  { id: "mexico-subsidiary", name: "Iberforge México" },
  { id: "meseta", name: "Construcciones Meseta" },
  { id: "lombarda", name: "Ferramenta Lombarda" },
];

export const operators: Operator[] = [
  { id: "atlas", name: "Atlas Ocean Lines" },
  { id: "trans-iberia", name: "Trans Iberia" },
  { id: "golfo", name: "Transportes del Golfo" },
  { id: "aduanas-levante", name: "Aduanas Levante" },
];

export const personas: Persona[] = [
  { id: "lyon-subsidiary", name: "Iberforge France, Lyon", role: "customer", accountIds: ["lyon-subsidiary"] },
  { id: "uk-distributor", name: "Northbridge Distribution, UK", role: "customer", accountIds: ["uk-distributor"] },
  { id: "valencia-site", name: "Valencia warehouse team", role: "operations", siteIds: ["valencia-warehouse"] },
  { id: "key-accounts", name: "Key accounts desk, UK and Mexico", role: "operations", accountIds: ["uk-distributor", "mexico-subsidiary"] },
];

const road = (operatorId: string, from: string, to: string, plannedDeparture: string, plannedArrival: string): Leg => ({
  mode: "road", operatorId, from, to, plannedDeparture, plannedArrival,
});
const sea = (from: string, to: string, plannedDeparture: string, plannedArrival: string): Leg => ({
  mode: "sea", operatorId: "atlas", from, to, plannedDeparture, plannedArrival,
});
const docs = (available: string[], missing: string[] = []) => [
  ...available.map((name) => ({ name, status: "available" as const })),
  ...missing.map((name) => ({ name, status: "missing" as const })),
];

export const shipments: Shipment[] = [
  // Lyon: on track / delivered / stale
  {
    ref: "SHP-1041", accountId: "lyon-subsidiary", originSiteId: "zaragoza-plant", destination: "Lyon, FR", customs: false,
    promisedDate: "2026-11-13T18:00:00Z",
    legs: [road("trans-iberia", "Zaragoza plant", "Lyon, FR", "2026-11-11T07:00:00Z", "2026-11-13T12:00:00Z")],
    documents: docs(["CMR consignment note", "Commercial invoice"]),
  },
  {
    ref: "SHP-1042", accountId: "lyon-subsidiary", originSiteId: "valencia-warehouse", destination: "Lyon, FR", customs: false,
    promisedDate: "2026-11-10T18:00:00Z",
    legs: [road("trans-iberia", "Valencia warehouse", "Lyon, FR", "2026-11-08T08:00:00Z", "2026-11-10T12:00:00Z")],
    documents: docs(["CMR consignment note", "Commercial invoice", "Proof of delivery"]),
  },
  {
    ref: "SHP-1043", accountId: "lyon-subsidiary", originSiteId: "bilbao-plant", destination: "Lyon, FR", customs: false,
    promisedDate: "2026-11-13T18:00:00Z",
    legs: [road("trans-iberia", "Bilbao plant", "Lyon, FR", "2026-11-10T06:00:00Z", "2026-11-12T16:00:00Z")],
    documents: docs(["CMR consignment note", "Commercial invoice"]),
  },
  // UK: road → ferry → road, customs on arrival
  {
    ref: "SHP-2001", accountId: "uk-distributor", originSiteId: "zaragoza-plant", destination: "Birmingham, UK", customs: true,
    promisedDate: "2026-11-14T18:00:00Z",
    legs: [
      road("trans-iberia", "Zaragoza plant", "Bilbao port", "2026-11-07T08:00:00Z", "2026-11-07T15:00:00Z"),
      sea("Bilbao port", "Portsmouth port", "2026-11-08T20:00:00Z", "2026-11-10T08:00:00Z"),
      road("trans-iberia", "Portsmouth port", "Birmingham, UK", "2026-11-12T08:00:00Z", "2026-11-12T14:00:00Z"),
    ],
    documents: docs(["Commercial invoice", "Packing list", "Bill of lading"], ["Certificate of origin"]),
  },
  {
    ref: "SHP-2002", accountId: "uk-distributor", originSiteId: "bilbao-plant", destination: "Birmingham, UK", customs: true,
    promisedDate: "2026-11-16T18:00:00Z",
    legs: [
      road("trans-iberia", "Bilbao plant", "Bilbao port", "2026-11-11T06:00:00Z", "2026-11-11T08:00:00Z"),
      sea("Bilbao port", "Portsmouth port", "2026-11-11T20:00:00Z", "2026-11-13T08:00:00Z"),
      road("trans-iberia", "Portsmouth port", "Birmingham, UK", "2026-11-14T08:00:00Z", "2026-11-14T14:00:00Z"),
    ],
    documents: docs(["Commercial invoice", "Packing list", "Bill of lading", "Certificate of origin"]),
  },
  {
    ref: "SHP-2003", accountId: "uk-distributor", originSiteId: "zaragoza-plant", destination: "Manchester, UK", customs: true,
    promisedDate: "2026-11-16T18:00:00Z",
    legs: [
      road("trans-iberia", "Zaragoza plant", "Bilbao port", "2026-11-10T07:00:00Z", "2026-11-10T14:00:00Z"),
      sea("Bilbao port", "Portsmouth port", "2026-11-10T20:00:00Z", "2026-11-12T08:00:00Z"),
      road("trans-iberia", "Portsmouth port", "Manchester, UK", "2026-11-13T08:00:00Z", "2026-11-13T16:00:00Z"),
    ],
    documents: docs(["Commercial invoice", "Packing list", "Bill of lading", "Certificate of origin"]),
  },
  // Mexico: road → ocean → inland road, customs on arrival
  {
    ref: "SHP-3001", accountId: "mexico-subsidiary", originSiteId: "valencia-warehouse", destination: "Monterrey, MX", customs: true,
    promisedDate: "2026-11-26T18:00:00Z",
    legs: [
      road("trans-iberia", "Valencia warehouse", "Valencia port", "2026-11-02T08:00:00Z", "2026-11-02T10:00:00Z"),
      sea("Valencia port", "Veracruz port", "2026-11-03T18:00:00Z", "2026-11-20T08:00:00Z"),
      road("golfo", "Veracruz port", "Monterrey, MX", "2026-11-22T08:00:00Z", "2026-11-24T08:00:00Z"),
    ],
    documents: docs(["Commercial invoice", "Packing list", "Bill of lading", "Certificate of origin"]),
  },
  {
    ref: "SHP-3002", accountId: "mexico-subsidiary", originSiteId: "zaragoza-plant", destination: "Monterrey, MX", customs: true,
    promisedDate: "2026-12-04T18:00:00Z",
    legs: [
      road("trans-iberia", "Zaragoza plant", "Valencia port", "2026-11-08T07:00:00Z", "2026-11-08T12:00:00Z"),
      sea("Valencia port", "Veracruz port", "2026-11-10T18:00:00Z", "2026-11-27T08:00:00Z"),
      road("golfo", "Veracruz port", "Monterrey, MX", "2026-11-29T08:00:00Z", "2026-12-01T08:00:00Z"),
    ],
    documents: docs(["Commercial invoice", "Packing list", "Bill of lading", "Certificate of origin"]),
  },
  // Domestic Spain
  {
    ref: "SHP-4001", accountId: "meseta", originSiteId: "zaragoza-plant", destination: "Madrid, ES", customs: false,
    promisedDate: "2026-11-12T18:00:00Z",
    legs: [road("trans-iberia", "Zaragoza plant", "Madrid, ES", "2026-11-12T05:00:00Z", "2026-11-12T11:00:00Z")],
    documents: docs(["Delivery note"]),
  },
  {
    ref: "SHP-4002", accountId: "meseta", originSiteId: "valencia-warehouse", destination: "Madrid, ES", customs: false,
    promisedDate: "2026-11-11T18:00:00Z",
    legs: [road("trans-iberia", "Valencia warehouse", "Madrid, ES", "2026-11-11T06:00:00Z", "2026-11-11T11:00:00Z")],
    documents: docs(["Delivery note"]),
  },
  // Italy (EU, no customs)
  {
    ref: "SHP-5001", accountId: "lombarda", originSiteId: "valencia-warehouse", destination: "Milan, IT", customs: false,
    promisedDate: "2026-11-17T18:00:00Z",
    legs: [road("trans-iberia", "Valencia warehouse", "Milan, IT", "2026-11-13T07:00:00Z", "2026-11-16T12:00:00Z")],
    documents: docs(["CMR consignment note", "Commercial invoice"]),
  },
  {
    ref: "SHP-5002", accountId: "lombarda", originSiteId: "valencia-warehouse", destination: "Milan, IT", customs: false,
    promisedDate: "2026-11-14T18:00:00Z",
    legs: [road("trans-iberia", "Valencia warehouse", "Milan, IT", "2026-11-11T08:00:00Z", "2026-11-13T16:00:00Z")],
    documents: docs(["CMR consignment note", "Commercial invoice"]),
  },
];

const es = (id: string, shipmentRef: string, leg: number, estado: string, fecha: string, ubicacion: string, receivedAt: string): RawEvent => ({
  id, operatorId: "trans-iberia", shipmentRef, leg, receivedAt, format: "text-es", payload: { estado, fecha, ubicacion },
});
const dcsa = (id: string, shipmentRef: string, leg: number, receivedAt: string, payload: Dcsa): RawEvent => ({
  id, operatorId: "atlas", shipmentRef, leg, receivedAt, format: "dcsa", payload,
});

export const rawEvents: RawEvent[] = [
  es("r1041-1", "SHP-1041", 0, "RECOGIDO", "11/11/2026 07:20", "Zaragoza, ES", "2026-11-11T07:25:00Z"),
  es("r1041-2", "SHP-1041", 0, "EN TRÁNSITO", "12/11/2026 06:40", "Narbonne, FR", "2026-11-12T06:45:00Z"),

  es("r1042-1", "SHP-1042", 0, "RECOGIDO", "08/11/2026 08:10", "Valencia, ES", "2026-11-08T08:15:00Z"),
  es("r1042-2", "SHP-1042", 0, "EN TRANSITO", "09/11/2026 10:00", "Montpellier, FR", "2026-11-09T10:05:00Z"),
  es("r1042-3", "SHP-1042", 0, "EN REPARTO", "10/11/2026 07:30", "Lyon, FR", "2026-11-10T07:35:00Z"),
  es("r1042-4", "SHP-1042", 0, "ENTREGADO", "10/11/2026 10:05", "Lyon, FR", "2026-11-10T10:10:00Z"),

  es("r1043-1", "SHP-1043", 0, "RECOGIDO", "10/11/2026 06:30", "Bilbao, ES", "2026-11-10T06:35:00Z"),
  es("r1043-2", "SHP-1043", 0, "En tránsito", "11/11/2026 14:50", "Toulouse, FR", "2026-11-11T15:00:00Z"),

  es("r2001-1", "SHP-2001", 0, "RECOGIDO", "07/11/2026 08:05", "Zaragoza, ES", "2026-11-07T08:10:00Z"),
  dcsa("r2001-2", "SHP-2001", 1, "2026-11-07T15:25:00Z", { eventClassifierCode: "ACT", equipmentEventTypeCode: "GTIN", eventDateTime: "2026-11-07T15:20:00Z", UNLocationCode: "ESBIO" }),
  dcsa("r2001-3", "SHP-2001", 1, "2026-11-08T20:35:00Z", { eventClassifierCode: "ACT", transportEventTypeCode: "DEPA", eventDateTime: "2026-11-08T20:30:00Z", UNLocationCode: "ESBIO" }),
  dcsa("r2001-4", "SHP-2001", 1, "2026-11-10T07:55:00Z", { eventClassifierCode: "ACT", transportEventTypeCode: "ARRI", eventDateTime: "2026-11-10T07:50:00Z", UNLocationCode: "GBPME" }),
  {
    id: "r2001-5", operatorId: "aduanas-levante", shipmentRef: "SHP-2001", receivedAt: "2026-11-12T08:40:00Z", format: "email",
    payload: {
      from: "customs@aduanaslevante.example",
      subject: "SHP-2001 / Retención en aduana Portsmouth",
      body: "Buenos días, os informamos de que la mercancía del envío SHP-2001 ha quedado retenida por HMRC en Portsmouth a las 08:15 por falta del certificado de origen. Enviadnos el documento lo antes posible para presentar la declaración. Un saludo, Aduanas Levante",
    },
  },

  es("r2002-1", "SHP-2002", 0, "RECOGIDO", "11/11/2026 06:10", "Bilbao, ES", "2026-11-11T06:15:00Z"),
  dcsa("r2002-2", "SHP-2002", 1, "2026-11-11T08:35:00Z", { eventClassifierCode: "ACT", equipmentEventTypeCode: "GTIN", eventDateTime: "2026-11-11T08:30:00Z", UNLocationCode: "ESBIO" }),
  dcsa("r2002-3", "SHP-2002", 1, "2026-11-11T20:20:00Z", { eventClassifierCode: "ACT", transportEventTypeCode: "DEPA", eventDateTime: "2026-11-11T20:15:00Z", UNLocationCode: "ESBIO" }),
  dcsa("r2002-4", "SHP-2002", 1, "2026-11-11T20:25:00Z", { eventClassifierCode: "EST", transportEventTypeCode: "ARRI", eventDateTime: "2026-11-13T07:00:00Z", UNLocationCode: "GBPME" }),

  es("r2003-1", "SHP-2003", 0, "RECOGIDO", "10/11/2026 07:15", "Zaragoza, ES", "2026-11-10T07:20:00Z"),
  dcsa("r2003-2", "SHP-2003", 1, "2026-11-10T14:15:00Z", { eventClassifierCode: "ACT", equipmentEventTypeCode: "GTIN", eventDateTime: "2026-11-10T14:10:00Z", UNLocationCode: "ESBIO" }),
  dcsa("r2003-3", "SHP-2003", 1, "2026-11-11T10:35:00Z", { eventClassifierCode: "ACT", transportEventTypeCode: "DEPA", eventDateTime: "2026-11-11T10:30:00Z", UNLocationCode: "ESBIO" }),
  dcsa("r2003-4", "SHP-2003", 1, "2026-11-11T10:40:00Z", { eventClassifierCode: "EST", transportEventTypeCode: "ARRI", eventDateTime: "2026-11-12T22:00:00Z", UNLocationCode: "GBPME" }),

  es("r3001-1", "SHP-3001", 0, "RECOGIDO", "02/11/2026 08:05", "Valencia, ES", "2026-11-02T08:10:00Z"),
  dcsa("r3001-2", "SHP-3001", 1, "2026-11-02T10:35:00Z", { eventClassifierCode: "ACT", equipmentEventTypeCode: "GTIN", eventDateTime: "2026-11-02T10:30:00Z", UNLocationCode: "ESVLC" }),
  dcsa("r3001-3", "SHP-3001", 1, "2026-11-03T19:05:00Z", { eventClassifierCode: "ACT", transportEventTypeCode: "DEPA", eventDateTime: "2026-11-03T19:00:00Z", UNLocationCode: "ESVLC" }),
  dcsa("r3001-4", "SHP-3001", 1, "2026-11-03T19:10:00Z", { eventClassifierCode: "EST", transportEventTypeCode: "ARRI", eventDateTime: "2026-11-20T08:00:00Z", UNLocationCode: "MXVER" }),
  dcsa("r3001-5", "SHP-3001", 1, "2026-11-11T16:00:00Z", { eventClassifierCode: "EST", transportEventTypeCode: "ARRI", eventDateTime: "2026-11-27T06:00:00Z", UNLocationCode: "MXVER" }),

  es("r3002-1", "SHP-3002", 0, "RECOGIDO", "08/11/2026 07:10", "Zaragoza, ES", "2026-11-08T07:15:00Z"),
  dcsa("r3002-2", "SHP-3002", 1, "2026-11-08T12:35:00Z", { eventClassifierCode: "ACT", equipmentEventTypeCode: "GTIN", eventDateTime: "2026-11-08T12:30:00Z", UNLocationCode: "ESVLC" }),
  dcsa("r3002-3", "SHP-3002", 1, "2026-11-10T18:25:00Z", { eventClassifierCode: "ACT", transportEventTypeCode: "DEPA", eventDateTime: "2026-11-10T18:20:00Z", UNLocationCode: "ESVLC" }),
  dcsa("r3002-4", "SHP-3002", 1, "2026-11-10T18:30:00Z", { eventClassifierCode: "EST", transportEventTypeCode: "ARRI", eventDateTime: "2026-11-27T08:00:00Z", UNLocationCode: "MXVER" }),

  es("r4001-1", "SHP-4001", 0, "RECOGIDO", "12/11/2026 05:10", "Zaragoza, ES", "2026-11-12T05:15:00Z"),
  es("r4001-2", "SHP-4001", 0, "EN REPARTO", "12/11/2026 09:20", "Madrid, ES", "2026-11-12T09:25:00Z"),

  es("r4002-1", "SHP-4002", 0, "RECOGIDO", "11/11/2026 06:15", "Valencia, ES", "2026-11-11T06:20:00Z"),
  es("r4002-2", "SHP-4002", 0, "EN REPARTO", "11/11/2026 10:40", "Madrid, ES", "2026-11-11T10:45:00Z"),
  es("r4002-3", "SHP-4002", 0, "INCIDENCIA: AUSENTE", "11/11/2026 12:05", "Madrid, ES", "2026-11-11T12:10:00Z"),

  {
    id: "r5002-1", operatorId: "trans-iberia", shipmentRef: "SHP-5002", leg: 0, receivedAt: "2026-11-12T09:30:00Z", format: "email",
    payload: {
      from: "traffic@transiberia.example",
      subject: "Recogida SHP-5002",
      body: "Hola, la recogida del SHP-5002 en Valencia no se pudo hacer el miércoles por falta de conductor. La pasamos a mañana viernes 13 y la entrega en Milán quedaría para el lunes 16 a mediodía. Disculpad. Tráfico Trans Iberia",
    },
  },
];

// Mock AI: free-text extractions (ingest) and predicted ETAs.
export const extractions: Record<string, Extraction> = {
  "r2001-5": {
    code: "CUSTOMS_HOLD", kind: "actual", at: "2026-11-12T08:15:00Z", location: "Portsmouth port, UK", confidence: 0.94,
    evidence: "retenida por HMRC en Portsmouth a las 08:15 por falta del certificado de origen",
  },
  // Below AUTO_APPLY: two dates in the message, pickup vs delivery → needs a human.
  "r5002-1": {
    code: "DELIVERED", kind: "estimate", at: "2026-11-16T12:00:00Z", location: "Milan, IT", confidence: 0.78,
    evidence: "la entrega en Milán quedaría para el lunes 16 a mediodía",
  },
};

export const predictions: Record<string, Prediction> = {
  "SHP-1041": { from: "2026-11-13T09:00:00Z", to: "2026-11-13T14:00:00Z", confidence: "high", reasons: ["Road leg on schedule", "Lane history: usually on plan"] },
  "SHP-1043": { from: "2026-11-12T15:00:00Z", to: "2026-11-13T12:00:00Z", confidence: "low", reasons: ["No operator update since the Toulouse checkpoint", "Range based on plan only"] },
  "SHP-2001": { from: "2026-11-14T10:00:00Z", to: "2026-11-15T16:00:00Z", confidence: "medium", reasons: ["Customs hold: release usually 1 to 2 days after documents are filed", "Last-mile slot must be rebooked"] },
  "SHP-2002": { from: "2026-11-14T12:00:00Z", to: "2026-11-15T10:00:00Z", confidence: "high", reasons: ["Vessel on schedule", "Portsmouth clearance usually takes 1 day"] },
  "SHP-2003": { from: "2026-11-16T10:00:00Z", to: "2026-11-17T12:00:00Z", confidence: "medium", reasons: ["Vessel left Bilbao 14 h behind schedule", "Late Thursday arrival at Portsmouth: clearance likely slips past the weekend"] },
  "SHP-3001": { from: "2026-11-29T06:00:00Z", to: "2026-12-01T18:00:00Z", confidence: "medium", reasons: ["Carrier pushed Veracruz arrival by 7 days", "Inland leg to Monterrey: 2 days"] },
  "SHP-3002": { from: "2026-11-30T08:00:00Z", to: "2026-12-02T18:00:00Z", confidence: "high", reasons: ["Vessel on schedule", "Veracruz clearance usually takes 2 to 3 days"] },
  "SHP-4001": { from: "2026-11-12T11:00:00Z", to: "2026-11-12T13:00:00Z", confidence: "high", reasons: ["Out for delivery in Madrid"] },
};
