import Link from "next/link";

export default function Header() {
  const CUSTOMER_ID = "cus_001"; // Replace with actual customer ID. In production environment, this should be fetched from the backend.

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-neutral-800 bg-black/50 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
            <span className="font-bold text-black text-lg">D</span>
          </div>
          <span className="font-bold text-white text-lg tracking-tight hidden sm:block">
            Dodo Payments Boilerplate
          </span>
        </Link>

        <Link 
          href={`/api/customer-portal?customer_id=${CUSTOMER_ID}`}
          className="text-sm font-medium text-neutral-400 hover:text-white transition-colors"
        >
          Customer Portal
        </Link>
      </div>
    </header>
  );
}
