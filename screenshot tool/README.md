# Dodo Payments Next.js Boilerplate

A minimal Nextjs boilerplate for integrating [Dodo Payments](https://dodopayments.com/) into your [Next.js](https://nextjs.org/) application.

## Features

- **Quick Setup** - Get started in under 5 minutes
- **Payment Integration** - Pre-configured checkout flow using `@dodopayments/nextjs`
- **Modern UI** - Clean, dark-themed pricing page with Tailwind CSS
- **Webhook Handler** - Ready-to-use webhook endpoint for payment events
- **Customer Portal** - One-click subscription management
- **TypeScript** - Fully typed with minimal, focused types
- **Pre-filled Checkout** - Demonstrates passing customer data to improve UX

## Prerequisites

Before you begin, make sure you have:

- **Node.js 20.9+** (required for Next.js 16)
- **Dodo Payments account** (to access API and Webhook Keys from dashboard)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/dodopayments/dodo-nextjs-minimal-boilerplate.git
cd dodo-nextjs-minimal-boilerplate
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Get API Credentials

Sign up at [Dodo Payments](https://dodopayments.com/) and get your credentials from the dashboard:

- **API Key:** [Dashboard → Developer → API Keys](https://app.dodopayments.com/developer/api-keys)
- **Webhook Key:** [Dashboard → Developer → Webhooks](https://app.dodopayments.com/developer/webhooks)

> Make sure you're in **Test Mode** while developing!

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Update the values with your Dodo Payments credentials:

```env
DODO_PAYMENTS_API_KEY=your_api_key_here
DODO_PAYMENTS_WEBHOOK_KEY=your_webhook_signing_key_here
DODO_PAYMENTS_RETURN_URL=http://localhost:3000
DODO_PAYMENTS_ENVIRONMENT=test_mode
```

### 5. Add Your Products

Update `src/lib/products.ts` with your actual product IDs from Dodo Payments:

```typescript
export const products: Product[] = [
  {
    product_id: "pdt_001", // Replace with your product ID
    name: "Basic Plan",
    description: "Get access to basic features and support",
    price: 9999, // in cents
    features: [
      "Access to basic features",
      "Email support",
      "1 Team member",
      "Basic analytics",
    ],
  },
  // ... add more products
];
```

### 6. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see your pricing page!

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── checkout/          # Checkout session handler
│   │   ├── customer-portal/   # Customer portal redirect
│   │   └── webhook/           # Webhook event handler
│   ├── components/
│   │   ├── Footer.tsx         # Reusable footer
│   │   ├── Header.tsx         # Navigation header
│   │   └── ProductCard.tsx    # Product pricing card
│   ├── globals.css            # Global styles
│   ├── layout.tsx             # Root layout
│   └── page.tsx               # Pricing page (home)
└── lib/
    └── products.ts            # Product definitions
```

## Customization

### Update Product Information

Edit `src/lib/products.ts` to modify:
- Product IDs (from your Dodo dashboard)
- Pricing
- Features
- Descriptions

### Pre-fill Customer Data

In `src/app/components/ProductCard.tsx`, replace the hardcoded values with your actual user data:

```typescript
customer: {
  name: "John Doe",
  email: "john@example.com",
},
```

### Update Customer Portal Link

In `src/app/components/Header.tsx`, replace the hardcoded customer ID:

```typescript
const CUSTOMER_ID = "cus_001"; // Replace with actual customer ID
```

## Webhook Events

The boilerplate demonstrates handling two webhook events in `src/app/api/webhook/route.ts`:

- `onSubscriptionActive` - Triggered when a subscription becomes active
- `onPaymentSucceeded` - Triggered when a payment is successful

Add your business logic inside these handlers:

```typescript
onSubscriptionActive: async (payload) => {
  // Grant access to your product
  // Update user database
  // Send welcome email
},
```

Add more webhook events as needed.

For local development, you can use tools like [ngrok](https://ngrok.com/) to create a secure tunnel to your local server and use it as your webhook URL. Remember to update your `.env` file with the correct webhook verification key.

## Deployment

### Build for Production

```bash
npm run build
npm start
```

### Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/dodopayments/dodo-nextjs-minimal-boilerplate)

Don't forget to add your environment variables in the Vercel dashboard!

### Update Webhook URL

After deploying, update your webhook URL in the [Dodo Payments Dashboard](https://app.dodopayments.com/developer/webhooks):

```
https://example.com/api/webhook
```

## Learn More

- [Dodo Payments Documentation](https://docs.dodopayments.com/)
- [Checkout Sessions Documentation](https://docs.dodopayments.com/developer-resources/checkout-sessions)
- [Webhooks Documentation](https://docs.dodopayments.com/developer-resources/webhooks)

## Support

Need help? Reach out:
- [Dodo Payments Discord](https://discord.gg/bYqAp4ayYh)
- [GitHub Issues](https://github.com/dodopayments/dodo-nextjs-minimal-boilerplate/issues)