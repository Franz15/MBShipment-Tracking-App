import Link from "next/link";
import { ThemeToggle } from "@/live";
import { button } from "@/ui";

export const metadata = { title: "Not found" };

// Centred empty state: one message, one way back.
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 py-6 md:px-6">
      <div className="flex justify-end">
        <ThemeToggle />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
        <p className="text-5xl font-semibold text-ink-2" aria-hidden>404</p>
        <h1 className="mt-4 text-xl font-semibold">Page not found</h1>
        <p className="mt-1 text-ink-2">No persona or shipment at this address.</p>
        <Link href="/" className={`${button} mt-6 inline-block`}>Choose a persona</Link>
      </div>
    </main>
  );
}
