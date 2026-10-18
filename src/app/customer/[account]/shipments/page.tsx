import { notFound } from "next/navigation";
import { shipments } from "@/data";
import { visible } from "@/domain";
import { CustomerList, Header } from "@/live";
import { customerPersona, customers } from "@/ui";

export const metadata = { title: "Your shipments" };

export function generateStaticParams() {
  return customers.map((p) => ({ account: p.accountIds![0] }));
}

export default async function Page({ params }: PageProps<"/customer/[account]/shipments">) {
  const { account } = await params;
  const persona = customerPersona(account);
  if (!persona) notFound();

  return (
    <>
      <Header who={persona.name} role="Customer portal" />
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        <h1 className="text-xl font-semibold">Your shipments</h1>
        <CustomerList account={account} list={visible(persona, shipments)} />
      </main>
    </>
  );
}
