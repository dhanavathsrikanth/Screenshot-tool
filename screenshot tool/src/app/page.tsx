import ProductCard from "./components/ProductCard";
import { products } from "@/lib/products";

export default function Home() {
  return (
    <div className="flex-1 flex flex-col">
      {/* Main Content */}
      <div className="flex-1 w-full pt-20 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          {/* Hero Section */}
          <div className="text-center max-w-2xl mx-auto mb-20">
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6 tracking-tight">
              Simple pricing.
            </h1>

            <p className="text-lg text-neutral-400 mb-8 leading-relaxed">
              Two plans. No hidden fees. Cancel anytime.
            </p>
          </div>

          {/* Products Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {products.map((product) => (
              <ProductCard key={product.product_id} product={product} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
