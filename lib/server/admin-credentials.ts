import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import "server-only";
import { z } from "zod";
import { adminEnvSchema } from "./admin-env";
const passwordSchema = z.string().min(20).max(256);

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      32,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

export async function hashAdminPassword(password: string): Promise<string> {
  passwordSchema.parse(password);

  const salt = randomBytes(16);
  const key = await derive(password, salt);

  return `scrypt:32768:8:3:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyAdminPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (!passwordSchema.safeParse(password).success) return false;

  const parsed = adminEnvSchema.shape.ADMIN_PASSWORD_HASH.safeParse(hash);
  if (!parsed.success) return false;

  const parts = parsed.data.split(":");
  const actual = await derive(password, Buffer.from(parts[4], "hex"));
  const expected = Buffer.from(parts[5], "hex");

  return timingSafeEqual(actual, expected);
}
