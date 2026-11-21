import { networkInterfaces } from "node:os";
import { initializeConfigEnvironment } from "../runtime/config.mjs";
initializeConfigEnvironment({
  appRoot: process.cwd(),
  dev: process.env.NODE_ENV !== "production",
});
const { createApp } = await import("./app");
const port = Number(process.env.PORT || 3002);
const server = createApp().listen(port, "0.0.0.0", () => {
  console.log(`Showcase listening on ${port}`);
  if (process.env.NODE_ENV !== "production") {
    console.log(`  Local: http://localhost:${port}/auth/login`);
    for (const entry of Object.values(networkInterfaces()).flatMap(
      (entries) => entries || [],
    ))
      if (entry.family === "IPv4" && !entry.internal)
        console.log(`  Network: http://${entry.address}:${port}/auth/login`);
    console.log(
      "  For QR authentication from your phone, open a Network URL on your computer and connect your phone to the same network. localhost on the phone points to the phone itself.",
    );
  }
});
async function close() {
  server.close();
  server.closeAllConnections();
}
process.once("SIGTERM", close);
process.once("SIGINT", close);
