import test from "node:test";
import assert from "node:assert/strict";
import { captureOptionsSchema } from "@snapforge/contracts";
import { CaptureStore } from "./store.js";
import { CaptureCache, MemoryCacheBackend } from "./cache.js";
import {
  R2Storage,
  StorageConfigError,
  createR2Storage,
  resolveStorageConfig,
  type ObjectStoreClient,
  type Presigner,
  type StorageConfig,
} from "./r2.js";

const DATA = {
  url: "https://example.com/a",
  final_url: "https://example.com/a",
  format: "png",
  width: 1280,
  height: 720,
  duration_ms: 120,
  bytes: 3,
  blocked_requests: 0,
  cached: false,
};

/** Records commands instead of talking to R2, so the assertions are on intent. */
function fakeClient() {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  const objects = new Map<string, Buffer>();
  const metadata = new Map<string, Record<string, string>>();
  const client: ObjectStoreClient = {
    async send(command) {
      const name = command.constructor.name;
      const input = (command as unknown as { input: Record<string, unknown> }).input;
      sent.push({ name, input });
      const key = String(input.Key);
      if (name === "PutObjectCommand") {
        objects.set(key, Buffer.from(input.Body as Buffer));
        const meta = input.Metadata as Record<string, string> | undefined;
        if (meta) metadata.set(key, meta);
        return { ETag: '"etag-1"' };
      }
      if (name === "GetObjectCommand") {
        const body = objects.get(key);
        if (!body) throw Object.assign(new Error("missing"), { name: "NoSuchKey" });
        return { Body: { transformToByteArray: async () => new Uint8Array(body) } };
      }
      if (name === "HeadObjectCommand") {
        if (!objects.has(key)) {
          throw Object.assign(new Error("missing"), {
            name: "NotFound",
            $metadata: { httpStatusCode: 404 },
          });
        }
        const meta = metadata.get(key);
        return {
          ContentLength: objects.get(key)?.byteLength ?? 0,
          ContentType: (input.Type as string | undefined) ?? "image/png",
          ...(meta ? { Metadata: meta } : {}),
        };
      }
      if (name === "DeleteObjectCommand") {
        objects.delete(key);
        metadata.delete(key);
      }
      return {};
    },
  };
  return { client, sent, objects, metadata };
}

/** Mirrors the SDK's output shape without needing a resolved client config. */
const fakePresigner: Presigner = {
  async sign(_client, command, { expiresIn }) {
    const input = (command as unknown as { input: Record<string, unknown> }).input;
    const disposition = input.ResponseContentDisposition as string | undefined;
    const params = new URLSearchParams({
      "X-Amz-Expires": String(expiresIn),
      "X-Amz-Signature": "test-signature",
      ...(disposition ? { "response-content-disposition": disposition } : {}),
    });
    return `https://signed.example.com/${String(input.Key)}?${params.toString()}`;
  },
};

const CONFIG: StorageConfig = {
  bucket: "shots",
  region: "auto",
  accessKeyId: "key",
  secretAccessKey: "secret",
  cdnBaseUrl: "https://cdn.example.com/",
};

function harness(config: Partial<StorageConfig> = {}) {
  const { client, sent, objects, metadata } = fakeClient();
  const storage = new R2Storage(client, { ...CONFIG, ...config }, fakePresigner);
  const cache = new CaptureCache(new MemoryCacheBackend());
  const store = new CaptureStore({ cache, storage });
  return { store, storage, cache, sent, objects, metadata };
}

const options = captureOptionsSchema.parse({ url: "https://example.com/a", cache_ttl: 300 });

test("config validation rejects a partial configuration", () => {
  const client = fakeClient().client;
  const config = (patch: Partial<StorageConfig> = {}): StorageConfig => ({
    bucket: "b",
    region: "auto",
    accessKeyId: "k",
    secretAccessKey: "s",
    ...patch,
  });

  assert.throws(() => new R2Storage(client, config({ bucket: "" })), StorageConfigError);
  assert.throws(() => new R2Storage(client, config({ accessKeyId: "" })), StorageConfigError);
  assert.throws(
    () => new R2Storage(client, config({ secretAccessKey: "" })),
    (err: unknown) => {
      assert.equal((err as { code?: string }).code, "config_invalid");
      return true;
    },
  );
});

test("resolveStorageConfig returns null when credentials are absent", () => {
  assert.equal(resolveStorageConfig({} as NodeJS.ProcessEnv), null);
  assert.equal(resolveStorageConfig({ STORAGE_BUCKET: "shots" } as NodeJS.ProcessEnv), null);
});

test("resolveStorageConfig derives the R2 endpoint from the account id", () => {
  const config = resolveStorageConfig({
    STORAGE_BUCKET: "shots",
    STORAGE_ACCESS_KEY_ID: "key",
    STORAGE_SECRET_ACCESS_KEY: "secret",
    STORAGE_ACCOUNT_ID: "acct123",
  } as NodeJS.ProcessEnv);
  assert.equal(config?.endpoint, "https://acct123.r2.cloudflarestorage.com");
  assert.equal(config?.region, "auto");
});

test("resolveStorageConfig keeps an explicit endpoint and cdn origin", () => {
  const config = resolveStorageConfig({
    STORAGE_BUCKET: "shots",
    STORAGE_ACCESS_KEY_ID: "key",
    STORAGE_SECRET_ACCESS_KEY: "secret",
    STORAGE_ENDPOINT: "https://s3.example.com",
    STORAGE_CDN_BASE_URL: "https://cdn.example.com",
    STORAGE_FORCE_PATH_STYLE: "true",
  } as NodeJS.ProcessEnv);
  assert.equal(config?.endpoint, "https://s3.example.com");
  assert.equal(config?.cdnBaseUrl, "https://cdn.example.com");
  assert.equal(config?.forcePathStyle, true);
});

test("put sends revalidating cache headers and the right content type", async () => {
  const { store, sent } = harness();
  const stored = await store.save(options, DATA, Buffer.from("abc"));
  assert.equal(stored.bytes, 3);
  const put = sent.find((c) => c.name === "PutObjectCommand");
  assert.equal(put?.input.ContentType, "image/png");
  assert.equal(put?.input.CacheControl, "public, max-age=0, must-revalidate");
  assert.equal(put?.input.Bucket, "shots");
});

test("the content type follows the capture format", async () => {
  const { storage, sent } = harness();
  await storage.put("k.pdf", Buffer.from("x"), "application/pdf");
  await storage.put("k.webp", Buffer.from("x"), "image/webp");
  const types = sent.filter((c) => c.name === "PutObjectCommand").map((c) => c.input.ContentType);
  assert.deepEqual(types, ["application/pdf", "image/webp"]);
});

test("a missing object reads as null rather than throwing", async () => {
  const { storage } = harness();
  assert.equal(await storage.get("nope.png"), null);
});

test("a stored object round-trips through get", async () => {
  const { storage } = harness();
  await storage.put("k.png", Buffer.from("hello"), "image/png");
  assert.equal((await storage.get("k.png"))?.toString(), "hello");
});

test("exists reflects object presence", async () => {
  const { storage } = harness();
  assert.equal(await storage.exists("k.png"), false);
  await storage.put("k.png", Buffer.from("x"), "image/png");
  assert.equal(await storage.exists("k.png"), true);
});

test("a cdn origin is preferred over signing, without a trailing-slash join", async () => {
  const { storage } = harness();
  assert.equal(await storage.urlFor("captures/ab/cd/digest.png"), "https://cdn.example.com/captures/ab/cd/digest.png");
});

test("without a cdn origin a presigned url is produced with the default ttl", async () => {
  const { storage } = harness({ cdnBaseUrl: undefined });
  const url = await storage.urlFor("captures/ab/cd/digest.png");
  assert.match(url, /^https:\/\/signed\.example\.com\/captures\/ab\/cd\/digest\.png\?/);
  assert.ok(url.includes("X-Amz-Expires=3600"));
  assert.ok(url.includes("X-Amz-Signature="));
});

test("a presign ttl and download name are honoured", async () => {
  const { storage } = harness({ cdnBaseUrl: undefined });
  const url = await storage.urlFor("k.png", { expiresIn: 90, downloadFileName: "shot.png" });
  const params = new URL(url).searchParams;
  assert.equal(params.get("X-Amz-Expires"), "90");
  assert.equal(params.get("response-content-disposition"), 'attachment; filename="shot.png"');
});

test("createR2Storage builds a client from a complete config", () => {
  const storage = createR2Storage({ ...CONFIG, endpoint: "https://acct.r2.cloudflarestorage.com" });
  assert.equal(storage.bucket, "shots");
});

test("a save is followed by a cache hit that serves the bytes", async () => {
  const { store, cache, sent } = harness();
  await store.save(options, DATA, Buffer.from("abc"));
  const putsBefore = sent.filter((c) => c.name === "PutObjectCommand").length;

  const hit = await store.lookup(options);
  assert.equal(hit.hit, true);
  assert.equal(hit.data?.cached, true);
  assert.equal(hit.buffer?.toString(), "abc");
  assert.equal(
    hit.data?.cdn_url,
    `https://cdn.example.com/${CaptureCache.locationFor(options).objectKey}`,
  );
  assert.equal(cache.stats.hits, 1);
  assert.equal(
    sent.filter((c) => c.name === "PutObjectCommand").length,
    putsBefore,
    "a hit must not re-upload",
  );
});

test("a lookup miss reports hit false", async () => {
  const { store } = harness();
  const miss = await store.lookup(options);
  assert.equal(miss.hit, false);
  assert.equal(miss.data, undefined);
});

test("a metadata entry whose object was deleted reports a miss", async () => {
  const { store, storage, objects } = harness();
  await store.save(options, DATA, Buffer.from("abc"));
  // Simulate object-storage eviction while metadata is still live.
  for (const key of [...objects.keys()]) await storage.delete(key);

  const hit = await store.lookup(options);
  assert.equal(hit.hit, false, "a hit without bytes is not a usable hit");
});

test("a metadata entry rehydrates bytes from object storage", async () => {
  const { store, cache, sent, objects } = harness();
  await store.save(options, DATA, Buffer.from("abc"));
  await cache.clear();
  assert.equal(objects.size, 1, "the object outlives the metadata cache");

  const hit = await store.lookup(options);
  assert.equal(hit.hit, true);
  assert.equal(hit.buffer?.toString(), "abc");
  assert.equal(hit.data?.cdn_url, `https://cdn.example.com/${CaptureCache.locationFor(options).objectKey}`);
  assert.equal(sent.filter((c) => c.name === "PutObjectCommand").length, 1, "no re-upload");
});

test("zero TTL bypasses stored bytes even if a warm bucket object exists", async () => {
  const { store, sent } = harness();
  await store.save(options, DATA, Buffer.from("abc"));
  const before = sent.length;
  assert.equal((await store.lookup({ ...options, cache_ttl: 0 })).hit, false);
  assert.equal(sent.length, before);
});

test("expired bucket objects cannot revive an expired metadata cache", async () => {
  const { store, cache, metadata } = harness();
  await store.save(options, DATA, Buffer.from("abc"));
  await cache.clear();
  const key = CaptureCache.locationFor(options).objectKey;
  const original = metadata.get(key)!;
  metadata.set(key, { ...original, stored_at: String(Date.now() - 120_000), expires_at: String(Date.now() - 60_000) });
  assert.equal((await store.lookup(options)).hit, false);
});

test("a shortened TTL also applies to cold bucket rehydration", async () => {
  const { store, cache, metadata } = harness();
  await store.save(options, DATA, Buffer.from("abc"));
  await cache.clear();
  const key = CaptureCache.locationFor(options).objectKey;
  const original = metadata.get(key)!;
  metadata.set(key, { ...original, stored_at: String(Date.now() - 10_000), expires_at: String(Date.now() + 60_000) });
  assert.equal((await store.lookup({ ...options, cache_ttl: 1 })).hit, false);
});

test("a storage failure does not poison the cache with a dead link", async () => {
  const { client, sent } = fakeClient();
  const storage = new R2Storage(client, CONFIG);
  const failing: ObjectStoreClient = {
    async send(command) {
      if (command.constructor.name === "PutObjectCommand") throw new Error("network down");
      return client.send(command);
    },
  };
  const broken = new R2Storage(failing, CONFIG);
  const cache = new CaptureCache(new MemoryCacheBackend());
  const store = new CaptureStore({ cache, storage: broken });

  const saved = await store.save(options, DATA, Buffer.from("abc"));
  assert.equal(saved.cdn_url, undefined, "the caller still gets its bytes");
  assert.equal((await store.lookup(options)).hit, false, "nothing points at a missing object");
  assert.equal(
    sent.filter((c) => c.name === "PutObjectCommand").length,
    0,
    "no upload was attempted against the dead link",
  );
});

test("forget removes both the entry and the object", async () => {
  const { store, storage, objects } = harness();
  await store.save(options, DATA, Buffer.from("abc"));
  assert.equal(objects.size, 1);
  await store.forget(options);
  assert.equal(objects.size, 0);
  assert.equal((await store.lookup(options)).hit, false);
  assert.equal(await storage.get(CaptureCache.locationFor(options).objectKey), null);
});
