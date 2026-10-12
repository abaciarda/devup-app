import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import "server-only";
import { adminCookieName, verifyAdminSession } from "./admin-session";

export async function hasAdminSession(): Promise<boolean> {
  await connection();
  const cookie = (await cookies()).get(adminCookieName())?.value;
  return verifyAdminSession(cookie);
}

export async function requireAdmin(): Promise<void> {
  if (!(await hasAdminSession())) redirect("/admin/login");
}
