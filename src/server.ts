import { networkInterfaces } from "node:os";
import { initializeConfigEnvironment } from "../runtime/config.mjs";
initializeConfigEnvironment({
  appRoot: process.cwd(),
  dev: process.env.NODE_ENV !== "production",
});
const { createApp } = await import("./app");
const { logger } = await import("./shared/server/common/logger");
const port = Number(process.env.PORT || 3002);
const server = createApp().listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Showcase listening");
  if (process.env.NODE_ENV !== "production") {
    logger.info(
      { url: `http://localhost:${port}/auth/login` },
      "Open Showcase locally",
    );
    for (const entry of Object.values(networkInterfaces()).flatMap(
      (entries) => entries || [],
    ))
      if (entry.family === "IPv4" && !entry.internal)
        logger.info(
          { url: `http://${entry.address}:${port}/auth/login` },
          "Open Showcase from another device on the same network",
        );
    logger.info(
      "For phone QR authentication, use a Network URL reachable from the phone; localhost points to the phone itself.",
    );
  }
});
async function close() {
  server.close();
  server.closeAllConnections();
}
process.once("SIGTERM", close);
process.once("SIGINT", close);
