import "server-only";
import { z } from "zod";
import type { Prisma } from "../../../generated/prisma/client";
import { getDb } from "../database/client";

export async function nextEditionNumber(
  client: Pick<Prisma.TransactionClient, "issue"> = getDb(),
): Promise<number> {
  const result = await client.issue.aggregate({
    _max: { editionNumber: true },
  });
  return z
    .number()
    .int()
    .positive()
    .max(2_147_483_647)
    .parse((result._max.editionNumber ?? 0) + 1);
}
