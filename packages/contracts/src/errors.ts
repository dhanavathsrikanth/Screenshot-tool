import { z } from "zod";

export const ERROR_CODES = [
  "invalid_request",
  "idempotency_conflict",
  "unauthorized",
  "forbidden",
  "quota_exceeded",
  "rate_limited",
  "render_timeout",
  "render_incomplete",
  "navigation_failed",
  "blocked_by_target",
  "target_error",
  "render_crashed",
  "internal_error",
  "unsupported_option",
  "egress_unavailable",
  "egress_mismatch",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  idempotency_conflict: 409,
  unauthorized: 401,
  forbidden: 403,
  quota_exceeded: 429,
  rate_limited: 429,
  render_timeout: 504,
  render_incomplete: 502,
  navigation_failed: 502,
  blocked_by_target: 451,
  target_error: 502,
  render_crashed: 500,
  internal_error: 500,
  unsupported_option: 400,
  egress_unavailable: 503,
  egress_mismatch: 502,
};

export const ERROR_RETRIABILITY: Record<ErrorCode, boolean> = {
  invalid_request: false,
  idempotency_conflict: false,
  unauthorized: false,
  forbidden: false,
  quota_exceeded: false,
  rate_limited: true,
  render_timeout: true,
  render_incomplete: true,
  navigation_failed: true,
  blocked_by_target: false,
  target_error: false,
  render_crashed: true,
  internal_error: true,
  unsupported_option: false,
  egress_unavailable: true,
  egress_mismatch: true,
};

/**
 * Standardized error envelope returned by the API, workers, and MCP server.
 */
export const errorEnvelopeSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  retriable: z.boolean(),
  request_id: z.string(),
  docs_url: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export class SnapforgeError extends Error {
  readonly code: ErrorCode;
  readonly retriable: boolean;
  readonly statusCode: number;
  readonly requestId: string;
  readonly details?: Record<string, unknown>;

  constructor(options: {
    code: ErrorCode;
    message: string;
    requestId: string;
    retriable?: boolean;
    details?: Record<string, unknown>;
  }) {
    super(options.message);
    this.name = "SnapforgeError";
    this.code = options.code;
    this.requestId = options.requestId;
    this.retriable = options.retriable ?? ERROR_RETRIABILITY[options.code];
    this.statusCode = ERROR_HTTP_STATUS[options.code];
    this.details = options.details;
  }

  toEnvelope(): ErrorEnvelope {
    return {
      code: this.code,
      message: this.message,
      retriable: this.retriable,
      request_id: this.requestId,
      docs_url: `https://snapforge.dev/docs/errors#${this.code}`,
      details: this.details,
    };
  }
}
