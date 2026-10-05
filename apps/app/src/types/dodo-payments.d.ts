declare module "@dodopayments/nextjs" {
  export function Checkout(config: {
    bearerToken: string;
    returnUrl?: string;
    environment: "test_mode" | "live_mode";
    type?: "dynamic" | "static" | "session";
  }): (request: Request) => Promise<Response>;

  export function CustomerPortal(config: {
    bearerToken: string;
    environment: "test_mode" | "live_mode";
  }): (request: Request) => Promise<Response>;

  export function Webhooks(config: {
    webhookKey: string;
    onPaymentSucceeded?: (payload: unknown) => Promise<void>;
    onSubscriptionActive?: (payload: unknown) => Promise<void>;
    onSubscriptionRenewed?: (payload: unknown) => Promise<void>;
    onSubscriptionUpdated?: (payload: unknown) => Promise<void>;
    onSubscriptionExpired?: (payload: unknown) => Promise<void>;
    onSubscriptionOnHold?: (payload: unknown) => Promise<void>;
    onSubscriptionCancelled?: (payload: unknown) => Promise<void>;
  }): (request: Request) => Promise<Response>;
}
