import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  DeleteObjectCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Minimal S3 surface this package needs. Narrowing it to three commands keeps the
 * storage layer unit-testable without credentials or a live endpoint.
 */
export interface ObjectStoreClient {
  send(command: PutObjectCommand | GetObjectCommand | HeadObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

export interface StorageConfig {
  bucket: string;
  region: string;
  /** Custom endpoint for S3-compatible providers. R2 uses the per-account host. */
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Public delivery origin (a Cloudflare custom domain on the bucket). */
  cdnBaseUrl?: string;
  forcePathStyle?: boolean;
}

export interface PresignOptions {
  /** Seconds until the signed URL expires. */
  expiresIn?: number;
  downloadFileName?: string;
}

export interface StoredObject {
  objectKey: string;
  bytes: number;
  contentType: string;
  etag?: string;
}

/**
 * Sidecar data attached to an object via S3 user-defined `Metadata`. Stored as key-value
 * pairs so the lookup path can rebuild a `CaptureSuccessData` from a stored artefact when
 * the metadata cache has been evicted but the bucket copy survives.
 *
 * Values are stringly-typed by the S3 API; numeric fields are round-tripped through
 * `Number(...)` on read. The alias keeps the type compatible with the SDK's
 * `Record<string, string>` constraint on `PutObjectCommandInput.Metadata`.
 */
export type StoredObjectMetadata = Record<string, string>;

export interface ObjectMetadata {
  bytes: number;
  contentType: string;
  custom: StoredObjectMetadata;
}

export interface StorageClient {
  readonly bucket: string;
  put(
    objectKey: string,
    body: Buffer,
    contentType: string,
    cacheControlSeconds?: number,
    metadata?: StoredObjectMetadata,
  ): Promise<StoredObject>;
  get(objectKey: string): Promise<Buffer | null>;
  head(objectKey: string): Promise<ObjectMetadata | null>;
  exists(objectKey: string): Promise<boolean>;
  delete(objectKey: string): Promise<void>;
  /** Delivery URL for a stored object. */
  urlFor(objectKey: string, options?: PresignOptions): Promise<string>;
}

/**
 * Signing is injected rather than reached through a cast, because the real signer reads
 * the resolved SDK client config and cannot work against a narrowed fake.
 */
export interface Presigner {
  sign(
    client: unknown,
    command: GetObjectCommand,
    options: { expiresIn: number },
  ): Promise<string>;
}

const sdkPresigner: Presigner = {
  sign: (client, command, options) =>
    getSignedUrl(client as S3Client, command, options),
};

export class StorageConfigError extends Error {
  readonly code = "config_invalid";
}

/** Presigned links default to an hour, matching the default capture cache TTL. */
export const DEFAULT_PRESIGN_TTL_SECONDS = 3600;

/**
 * R2 / S3-compatible object storage.
 *
 * Delivery prefers a configured CDN origin: a public bucket behind a Cloudflare custom
 * domain serves bytes off R2 with no signing at all, which is both faster and impossible
 * to leak a signature from. Presigning is the fallback for private buckets.
 */
export class R2Storage implements StorageClient {
  readonly bucket: string;
  private readonly client: ObjectStoreClient;
  private readonly config: StorageConfig;
  private readonly presigner: Presigner;

  constructor(client: ObjectStoreClient, config: StorageConfig, presigner: Presigner = sdkPresigner) {
    if (!config.bucket) throw new StorageConfigError("storage bucket is required");
    if (!config.accessKeyId) throw new StorageConfigError("storage access key is required");
    if (!config.secretAccessKey) throw new StorageConfigError("storage secret key is required");
    this.client = client;
    this.config = config;
    this.presigner = presigner;
    this.bucket = config.bucket;
  }

  async put(
    objectKey: string,
    body: Buffer,
    contentType: string,
    cacheControlSeconds?: number,
    metadata?: StoredObjectMetadata,
  ): Promise<StoredObject> {
    const ttl = cacheControlSeconds ?? DEFAULT_PRESIGN_TTL_SECONDS;
    const result = (await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body,
        ContentType: contentType,
        CacheControl: `public, max-age=${ttl}, must-revalidate`,
        ...(metadata && Object.keys(metadata).length > 0 ? { Metadata: metadata } : {}),
      }),
    )) as { ETag?: string } | undefined;

    return {
      objectKey,
      bytes: body.byteLength,
      contentType,
      ...(result?.ETag ? { etag: result.ETag } : {}),
    };
  }

  async get(objectKey: string): Promise<Buffer | null> {
    try {
      const result = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      )) as { Body?: { transformToByteArray?: () => Promise<Uint8Array> } } | undefined;
      const body = result?.Body;
      if (!body) return null;
      if (typeof body.transformToByteArray !== "function") return null;
      return Buffer.from(await body.transformToByteArray());
    } catch (error) {
      // A missing object is an expected outcome for a cache miss, not a failure.
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async exists(objectKey: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return true;
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }
  }

  async head(objectKey: string): Promise<ObjectMetadata | null> {
    try {
      const result = (await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      )) as
        | {
            ContentLength?: number;
            ContentType?: string;
            Metadata?: StoredObjectMetadata;
          }
        | undefined;
      const contentLength = result?.ContentLength;
      if (contentLength === undefined) return null;
      return {
        bytes: contentLength,
        contentType: result?.ContentType ?? "application/octet-stream",
        custom: result?.Metadata ?? {},
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async delete(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  async urlFor(objectKey: string, options: PresignOptions = {}): Promise<string> {
    const cdnBase = this.config.cdnBaseUrl?.replace(/\/+$/, "");
    if (cdnBase) {
      return `${cdnBase}/${objectKey}`;
    }
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ...(options.downloadFileName
        ? { ResponseContentDisposition: `attachment; filename="${options.downloadFileName}"` }
        : {}),
    });
    return this.presigner.sign(this.client, command, {
      expiresIn: options.expiresIn ?? DEFAULT_PRESIGN_TTL_SECONDS,
    });
  }
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return name === "NoSuchKey" || name === "NotFound" || status === 404;
}

export function resolveStorageConfig(env: NodeJS.ProcessEnv = process.env): StorageConfig | null {
  const bucket = env.STORAGE_BUCKET;
  const accessKeyId = env.STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = env.STORAGE_SECRET_ACCESS_KEY;
  // Absent credentials mean the host is not using object storage at all, which is the
  // normal case for local development. Returning null keeps that a config state rather
  // than a thrown error.
  if (!bucket || !accessKeyId || !secretAccessKey) return null;

  const accountId = env.STORAGE_ACCOUNT_ID;
  return {
    bucket,
    region: env.STORAGE_REGION ?? "auto",
    accessKeyId,
    secretAccessKey,
    ...(accountId
      ? { endpoint: env.STORAGE_ENDPOINT ?? `https://${accountId}.r2.cloudflarestorage.com` }
      : env.STORAGE_ENDPOINT
        ? { endpoint: env.STORAGE_ENDPOINT }
        : {}),
    ...(env.STORAGE_CDN_BASE_URL ? { cdnBaseUrl: env.STORAGE_CDN_BASE_URL } : {}),
    ...(env.STORAGE_FORCE_PATH_STYLE === "true" ? { forcePathStyle: true } : {}),
  };
}

export function createR2Storage(config: StorageConfig): R2Storage {
  const clientConfig: S3ClientConfig = {
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: config.forcePathStyle ?? true } : {}),
  };
  return new R2Storage(new S3Client(clientConfig), config);
}
