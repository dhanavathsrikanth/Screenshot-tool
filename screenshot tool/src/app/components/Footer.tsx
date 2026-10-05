export default function Footer() {
  return (
    <footer className="border-t border-neutral-800 bg-black">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-neutral-500 text-sm">
            Dodo Payments x Next.js Boilerplate.
          </div>
          
          <div className="flex items-center gap-8 text-sm text-neutral-500">
            <a href="#" className="hover:text-white transition-colors">Privacy</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
