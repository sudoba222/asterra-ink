import Link from "next/link";

export default function CountryNotFound() {
  return (
    <div className="pointer-events-auto grid h-full place-items-center p-6">
      <div className="glass max-w-sm rounded-2xl p-6 text-center text-white">
        <p className="text-sm font-semibold">We couldn’t find that country</p>
        <p className="mt-1 text-[13px] text-white/60">Use a three-letter ISO code like UZB, KEN or BRA.</p>
        <Link href="/" className="mt-4 inline-flex rounded-full bg-lime px-4 py-2 text-[13px] font-semibold text-deep">
          Back to the globe
        </Link>
      </div>
    </div>
  );
}
