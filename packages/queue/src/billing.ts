import type { Redis } from "ioredis";
import type { CaptureBilling } from "./service.js";

const RESERVE = "redis.call('ZREMRANGEBYSCORE', KEYS[2], 0, ARGV[1]); local balance=tonumber(redis.call('GET', KEYS[1]) or '0'); local held=redis.call('ZCARD', KEYS[2]); if balance-held<1 then return 0 end; redis.call('ZADD', KEYS[2], ARGV[1]+ARGV[2], ARGV[3]); return 1";
const SETTLE = "local removed=redis.call('ZREM', KEYS[2], ARGV[1]); if removed==1 and ARGV[2]=='1' then redis.call('DECR', KEYS[1]); end; return removed";

export function createRedisCaptureBilling(redis: Pick<Redis, "eval" | "set" | "get" | "del">): CaptureBilling {
  return {
    async reserveCapture(accountId, id) {
      await redis.set(`snapforge:reservation-account:${id}`, accountId, "EX", 86_400);
      return Number(await redis.eval(RESERVE, 2, `snapforge:credits:${accountId}`, `snapforge:reservations:${accountId}`, Date.now(), 86_400_000, id)) === 1;
    },
    async linkReservationToJob(accountId, id, jobId) {
      await redis.set(`snapforge:job-reservation:${accountId}:${jobId}`, id, "EX", 86_400);
    },
    async reservationForJob(accountId, jobId) {
      return redis.get(`snapforge:job-reservation:${accountId}:${jobId}`);
    },
    async settleCapture(id, succeeded) {
      const accountId = await redis.get(`snapforge:reservation-account:${id}`);
      if (accountId) {
        await redis.eval(SETTLE, 2, `snapforge:credits:${accountId}`, `snapforge:reservations:${accountId}`, id, Number(succeeded));
        await redis.del(`snapforge:reservation-account:${id}`, `snapforge:job-reservation:${accountId}:${id}`);
      }
    },
    async recordCapture() {},
  };
}
