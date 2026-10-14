import { randomBytes } from "node:crypto";
import { hashAdminPassword } from "../lib/server/admin/credentials";

async function main() {
  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) {
    input += String(chunk);
    if (Buffer.byteLength(input, "utf8") > 4096)
      throw new Error("Password input too large");
  }
  const password = input.replace(/\r?\n$/, "");
  const hash = await hashAdminPassword(password);
  console.log(`ADMIN_PASSWORD_HASH=${hash}`);
  console.log(`SESSION_SECRET=${randomBytes(32).toString("base64url")}`);
}

main().catch(() => {
  console.error(
    "Provide a password of 20 to 256 characters through standard input.",
  );
  process.exitCode = 1;
});
