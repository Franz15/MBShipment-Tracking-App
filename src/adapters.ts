// Operator payloads → canonical events. One branch per format, not per operator.
import type { Code, TrackingEvent } from "./domain";

type Envelope = {
  id: string;
  operatorId: string;
  shipmentRef: string;
  leg?: number; // resolved from the operator's booking reference
  receivedAt: string;
};

export type Dcsa = {
  eventClassifierCode: "ACT" | "EST";
  transportEventTypeCode?: "DEPA" | "ARRI";
  equipmentEventTypeCode?: "GTIN";
  eventDateTime: string;
  UNLocationCode: string;
};

export type RawEvent =
  | (Envelope & { format: "dcsa"; payload: Dcsa })
  | (Envelope & { format: "text-es"; payload: { estado: string; fecha: string; ubicacion: string } })
  | (Envelope & { format: "email"; payload: { from: string; subject: string; body: string } });

// Mock AI output for free-text messages. Production: LLM structured output.
export type Extraction = {
  code: Code;
  kind: TrackingEvent["kind"];
  at: string;
  location: string;
  confidence: number;
  evidence: string;
};

const AUTO_APPLY = 0.9;

const DCSA: Record<string, Code> = { DEPA: "VESSEL_DEPARTED", ARRI: "VESSEL_ARRIVED", GTIN: "ARRIVED_PORT" };
const LOCODE: Record<string, string> = {
  ESBIO: "Bilbao port, ES",
  ESVLC: "Valencia port, ES",
  GBPME: "Portsmouth port, UK",
  MXVER: "Veracruz port, MX",
};
const ES: Record<string, Code> = {
  RECOGIDO: "PICKED_UP",
  "EN TRANSITO": "IN_TRANSIT",
  "EN REPARTO": "OUT_FOR_DELIVERY",
  ENTREGADO: "DELIVERED",
};

const plain = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toUpperCase();

// "12/11/2026 07:30" → ISO, read as UTC.
function esDate(fecha: string) {
  const [d, m, y, hh, mm] = fecha.split(/[/ :]/).map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm)).toISOString();
}

// null = not understood: stays raw, never guessed.
export function normalize(raw: RawEvent, extraction?: Extraction): TrackingEvent | null {
  const base = { shipmentRef: raw.shipmentRef, leg: raw.leg };
  const source = { operatorId: raw.operatorId, rawId: raw.id, receivedAt: raw.receivedAt };

  if (raw.format === "dcsa") {
    const p = raw.payload;
    const rawCode = p.transportEventTypeCode ?? p.equipmentEventTypeCode ?? "";
    const code = DCSA[rawCode];
    if (!code) return null;
    return {
      ...base,
      code,
      kind: p.eventClassifierCode === "EST" ? "estimate" : "actual",
      at: new Date(p.eventDateTime).toISOString(),
      location: LOCODE[p.UNLocationCode] ?? p.UNLocationCode,
      source: { ...source, rawCode: `${p.eventClassifierCode}/${rawCode}` },
    };
  }

  if (raw.format === "text-es") {
    const p = raw.payload;
    const code = plain(p.estado).startsWith("INCIDENCIA") ? "DELIVERY_FAILED" : ES[plain(p.estado)];
    if (!code) return null;
    return { ...base, code, kind: "actual", at: esDate(p.fecha), location: p.ubicacion, source: { ...source, rawCode: p.estado } };
  }

  if (!extraction) return null;
  return {
    ...base,
    code: extraction.code,
    kind: extraction.kind,
    at: extraction.at,
    location: extraction.location,
    source: { ...source, rawCode: raw.payload.subject, confidence: extraction.confidence },
  };
}

// Low-confidence AI extractions only count once a human approves them.
export const toEvents = (raws: RawEvent[], extractions: Record<string, Extraction>, approved: string[] = []) =>
  raws.flatMap((r) => {
    const e = normalize(r, extractions[r.id]);
    if (!e) return [];
    const conf = e.source.confidence;
    return conf !== undefined && conf < AUTO_APPLY && !approved.includes(r.id) ? [] : [e];
  });
