import { handleIntegrity } from "@/server/integrity/handlers";
export async function POST(request: Request) {
  return handleIntegrity(request, "token-exchange");
}
