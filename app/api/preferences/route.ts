import { handleSubscriptionAction } from "@/lib/server/subscriptions/actions";
export async function POST(request: Request) {
  return handleSubscriptionAction(request, "preferences");
}
