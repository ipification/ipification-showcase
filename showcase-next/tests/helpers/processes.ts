import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
export async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((r) => server.close(() => r()));
  return port;
}
export async function startApp(env: Record<string, string> = {}) {
  const port = env.PORT ? Number(env.PORT) : await freePort();
  let output = "";
  const child = spawn(process.execPath, ["server.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "development",
      PORT: String(port),
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => (output += d));
  child.stderr?.on("data", (d) => (output += d));
  const url = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; i < 300; i++) {
      if (child.exitCode !== null) throw new Error(output);
      try {
        const response = await fetch(url + "/auth/login");
        if (response.status < 500)
          return { child, url, stop: () => stop(child), output: () => output };
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Server did not become ready: " + output);
  } catch (error) {
    await stop(child);
    throw error;
  }
}
export async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((r) => child.once("exit", () => r()));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 8000);
  await exited;
  clearTimeout(timer);
}
