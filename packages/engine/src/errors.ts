import { z } from "zod";
import { SnapforgeError, type ErrorCode } from "@snapforge/contracts";

const CRASH_PATTERNS: RegExp[] = [
  /target (page|browser).*closed/i,
  /browser has been closed/i,
  /browser.*closed/i,
  /page crashed/i,
  /target crashed/i,
  /renderer process crashed/i,
  /crashed/i,
  /protocol error.*(closed|terminated|crashed|session)/i,
  /the browser is closed/i,
  /browserclosed/i,
];

const NAVIGATION_PATTERNS: RegExp[] = [
  /net::ERR_[A-Z_]+/i,
  /getaddrinfo (ENOTFOUND|EAI_AGAIN)/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /\bENOTFOUND\b/i,
  /\bEAI_AGAIN\b/i,
  /CERT_[A-Z_]+/i,
  /SSL (error|protocol)/i,
  /NS_ERROR_[A-Z_]+/i,
  /ERR_NAME_NOT_RESOLVED/i,
  /unable to (connect|access)/i,
  /name resolution/i,
  /Navigation failed/i,
];

const TIMEOUT_PATTERNS: RegExp[] = [
  /timeout .*exceeded/i,
  /TimeoutError/i,
  /timed? ?out/i,
  /waiting for (selector|locator|event|function|load state|url|frame|response)/i,
  /Navigation timeout/i,
];

const CHALLENGE_TITLE_PATTERNS: RegExp[] = [
  /just a moment/i,
  /checking (your )?browser/i,
  /attention required/i,
  /verify you are/i,
  /security (check|verification|challenge)/i,
  /performing security/i,
  /access denied/i,
  /one moment/i,
  /please wait/i,
  /ddos protection/i,
  /are you a robot/i,
  /(captcha (required|verification|challenge|check))|(solve (the )?captcha)|(human verification)/i,
  /making sure you.re not a bot/i,
  /blocked/i,
  /restricted/i,
  /waiting for (you|site)/i,
];

const CHALLENGE_BODY_ANY_STATUS_PATTERNS: RegExp[] = [
  /prove your humanity/i,
  /confirm you are human/i,
  /complete the challenge below/i,
];

const CHALLENGE_BODY_PATTERNS: RegExp[] = [
  /cloudflare/i,
  /ray id/i,
  /datadome/i,
  /perimeter ?x/i,
  /enable javascript and cookies/i,
  /h-captcha/i,
  /g-recaptcha/i,
  /cf-browser-verification/i,
  /captcha-delivery/i,
  /please turn javascript on/i,
  /ddos protection by/i,
  /running electrified/i,
  /why have i been blocked/i,
];

export function classifyErrorMessage(message: string): ErrorCode {
  if (CRASH_PATTERNS.some((pattern) => pattern.test(message))) return "render_crashed";
  if (NAVIGATION_PATTERNS.some((pattern) => pattern.test(message))) return "navigation_failed";
  if (TIMEOUT_PATTERNS.some((pattern) => pattern.test(message))) return "render_timeout";
  return "internal_error";
}

export function looksLikeChallenge(
  status: number,
  title: string,
  bodySample: string,
): boolean {
  if (status === 403 || status === 429 || status === 451) return true;

  if (CHALLENGE_TITLE_PATTERNS.some((pattern) => pattern.test(title))) return true;

  const sample = bodySample.slice(0, 4000);
  if (CHALLENGE_BODY_ANY_STATUS_PATTERNS.some((pattern) => pattern.test(sample))) {
    return true;
  }

  if (status >= 400 && status < 600) {
    if (CHALLENGE_BODY_PATTERNS.some((pattern) => pattern.test(sample))) return true;
  }

  return false;
}

export function toSnapforgeError(
  err: unknown,
  requestId: string,
  extraDetails?: Record<string, unknown>,
): SnapforgeError {
  if (err instanceof SnapforgeError) {
    if (!extraDetails) return err;
    return new SnapforgeError({
      code: err.code,
      message: err.message,
      requestId: err.requestId,
      retriable: err.retriable,
      details: { ...(err.details ?? {}), ...extraDetails },
    });
  }

  if (err instanceof z.ZodError) {
    const issues = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return new SnapforgeError({
      code: "invalid_request",
      message: `Validation failed: ${issues.map((i) => `${i.path || "(root)"}: ${i.message}`).join("; ")}`,
      requestId,
      details: { issues },
    });
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const code = classifyErrorMessage(message);

  return new SnapforgeError({
    code,
    message,
    requestId,
    details: {
      ...(extraDetails ?? {}),
      ...(stack ? { stack } : {}),
    },
  });
}
