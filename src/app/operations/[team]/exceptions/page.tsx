import { notFound } from "next/navigation";
import { shipments } from "@/data";
import { visible } from "@/domain";
import { Header, OpsExceptions } from "@/live";
import { opsPersona, opsTeams } from "@/ui";

export const metadata = { title: "Exceptions" };

export function generateStaticParams() {
  return opsTeams.map((p) => ({ team: p.id }));
}

export default async function Page({ params }: PageProps<"/operations/[team]/exceptions">) {
  const { team } = await params;
  const persona = opsPersona(team);
  if (!persona) notFound();

  return (
    <>
      <Header who={persona.name} role="Operations" />
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <h1 className="text-xl font-semibold">Exceptions</h1>
        <OpsExceptions team={team} list={visible(persona, shipments)} />
      </main>
    </>
  );
}
