import { handleSubscriptionAction } from "@/lib/server/subscription-actions";
export async function POST(request: Request) {
  return handleSubscriptionAction(request, "confirm");
}
