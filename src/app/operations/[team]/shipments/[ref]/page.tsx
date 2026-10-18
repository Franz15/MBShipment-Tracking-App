import Link from "next/link";
import { notFound } from "next/navigation";
import { shipments } from "@/data";
import { visible } from "@/domain";
import { Header, OpsShipment } from "@/live";
import { opsPersona, opsTeams } from "@/ui";

export function generateStaticParams() {
  return opsTeams.flatMap((p) => visible(p, shipments).map((s) => ({ team: p.id, ref: s.ref })));
}

export default async function Page({ params }: PageProps<"/operations/[team]/shipments/[ref]">) {
  const { team, ref } = await params;
  const persona = opsPersona(team);
  const shipment = persona && visible(persona, shipments).find((s) => s.ref === ref);
  if (!persona || !shipment) notFound();

  return (
    <>
      <Header who={persona.name} role="Operations" />
      <main className="mx-auto max-w-5xl px-4 py-6 md:px-6">
        <Link href={`/operations/${team}/exceptions`} className="text-accent hover:underline">Exceptions</Link>
        <OpsShipment shipment={shipment} />
      </main>
    </>
  );
}
