import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { BrowserContext, Page } from "playwright";
import { SnapforgeError } from "@snapforge/contracts";

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19)));
  }
  if (family !== 6 || address.includes("%")) return false;
  let normalized = address.toLowerCase();
  if (normalized.includes(".")) {
    const lastColon = normalized.lastIndexOf(":");
    const bytes = normalized.slice(lastColon + 1).split(".").map(Number);
    normalized = `${normalized.slice(0, lastColon)}:${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
  }
  const parts = normalized.split("::");
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts[1] ? parts[1].split(":") : [];
  const groups = [...left, ...Array(parts.length === 2 ? 8 - left.length - right.length : 0).fill("0"), ...right].map((value) => parseInt(value, 16));
  if (groups.slice(0, 5).every((value) => value === 0) && groups[5] === 0xffff) {
    return isPublicAddress(`${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`);
  }
  return groups[0] >= 0x2000 && groups[0] <= 0x3fff && groups[0] !== 0x2002 &&
    !(groups[0] === 0x2001 && (groups[1] === 0 || groups[1] === 0xdb8));
}

export type AddressLookup = (hostname: string) => Promise<Array<{ address: string }>>;

export async function assertPublicProxyUrl(server: string, requestId: string, resolve?: AddressLookup): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(server.includes("://") ? server : `http://${server}`);
  } catch {
    throw new SnapforgeError({ code: "invalid_request", message: "Proxy server must be a valid public endpoint", requestId });
  }
  if (!["http:", "https:", "socks4:", "socks5:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new SnapforgeError({ code: "invalid_request", message: "Proxy server must use HTTP, HTTPS, SOCKS4, or SOCKS5 with separate authentication fields", requestId });
  }
  await assertPublicUrl(`http://${parsed.host}/`, requestId, resolve);
}

export async function assertPublicUrl(url: string, requestId: string, resolve: AddressLookup = (host) => lookup(host, { all: true, verbatim: true })): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SnapforgeError({ code: "invalid_request", message: "Capture destination must be a valid public URL", requestId });
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const fail = () => { throw new SnapforgeError({ code: "invalid_request", message: "Capture requests cannot access private or reserved networks", requestId }); };
  if (!["http:", "https:", "ws:", "wss:"].includes(parsed.protocol) || parsed.username || parsed.password ||
    hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".internal") || hostname.endsWith(".local")) fail();
  const addresses = isIP(hostname) ? [{ address: hostname }] : await resolve(hostname);
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) fail();
}

export async function installNetworkGuard(context: BrowserContext, page: Page, requestId: string, addressLookup: AddressLookup = (host) => lookup(host, { all: true, verbatim: true })): Promise<void> {
  const resolutions = new Map<string, { expires: number; addresses: Promise<Array<{ address: string }>> }>();
  const resolve: AddressLookup = (host) => {
    const previous = resolutions.get(host);
    if (previous && previous.expires > Date.now()) return previous.addresses;
    if (resolutions.size >= 1000) resolutions.clear();
    const addresses = addressLookup(host);
    resolutions.set(host, { expires: Date.now() + 5000, addresses });
    return addresses;
  };
  await context.route("**/*", async (route) => {
    try {
      await assertPublicUrl(route.request().url(), requestId, resolve);
    } catch {
      await route.abort("accessdenied");
      return;
    }
    await route.fallback();
  });
  await context.routeWebSocket("**/*", async (socket) => {
    try {
      await assertPublicUrl(socket.url(), requestId, resolve);
      socket.connectToServer();
    } catch {
      socket.close({ code: 1008, reason: "Network access denied" });
    }
  });
  const protectRedirects = async (target: Page) => {
    const session = await context.newCDPSession(target);
    session.on("Fetch.requestPaused", (event: {
      requestId: string;
      request: { url: string };
      responseStatusCode?: number;
      responseHeaders?: Array<{ name: string; value: string }>;
    }) => {
      void (async () => {
        try {
          const location = event.responseHeaders?.find((header) => header.name.toLowerCase() === "location")?.value;
          if (event.responseStatusCode && event.responseStatusCode >= 300 && event.responseStatusCode < 400 && location) {
            await assertPublicUrl(new URL(location, event.request.url).href, requestId, resolve);
          }
          await session.send("Fetch.continueRequest", { requestId: event.requestId });
        } catch {
          await session.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "AccessDenied" }).catch(() => {});
        }
      })();
    });
    await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Response" }] });
  };
  await protectRedirects(page);
  context.on("page", (target) => { void protectRedirects(target).catch(() => { void target.close(); }); });
}
