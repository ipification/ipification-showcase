import type { Server } from "node:http";
export function startSocketServer(
  server: Server,
  options: { redisUrl: string; adapterKey: string },
): Promise<{ ready(): boolean; close(): Promise<void> }>;
