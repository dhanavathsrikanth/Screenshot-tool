"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Product } from "@/lib/products";

export default function ProductCard({ product }: { product: Product }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const initiateCheckout = async (productId: string) => {
    try {
      setLoading(true);
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_cart: [
            {
              product_id: productId,
              quantity: 1,
            },
          ],
          // Pass customer details to pre-fill the checkout form
          customer: {
            name: "John Doe",
            email: "john@example.com",
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to initiate checkout");
      }

      const data = await response.json();
      if (data.checkout_url) {
        router.push(data.checkout_url);
      }
    } catch (error) {
      console.error("Checkout error:", error);
      alert("Failed to initiate checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const priceString = (product.price / 100).toFixed(2);

  return (
    <div className="group relative overflow-hidden rounded-xl bg-black border border-neutral-800 hover:border-neutral-700 transition-colors duration-300">
      <div className="p-8 flex flex-col h-full">
        {/* Product Name */}
        <h3 className="text-xl font-bold text-white mb-2">
          {product.name}
        </h3>

        {/* Description */}
        <p className="text-neutral-400 text-sm mb-8 leading-relaxed">
          {product.description}
        </p>

        {/* Price Section */}
        <div className="mb-8">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-white tracking-tight">
              ${priceString}
            </span>
            <span className="text-neutral-500 text-sm font-medium">
              /mo
            </span>
          </div>
        </div>

        {/* Features List */}
        <ul className="mb-8 space-y-3 grow">
          {product.features.map((feature, index) => (
            <li key={index} className="flex items-start gap-3 text-sm text-neutral-300">
              <svg className="w-5 h-5 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{feature}</span>
            </li>
          ))}
        </ul>

        {/* Checkout Button */}
        <button
          onClick={() => initiateCheckout(product.product_id)}
          disabled={loading}
          className="w-full py-3 px-4 rounded-lg font-medium text-black bg-white hover:bg-neutral-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Processing...</span>
            </>
          ) : (
            <span>Get Started</span>
          )}
        </button>
      </div>
    </div>
  );
}
