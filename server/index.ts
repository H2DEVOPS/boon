/**
 * Minimal HTTP server — Node native http.
 * No business logic.
 */

import { createApp } from "./app.js";

const { server } = createApp();
const PORT = Number(process.env.PORT) || 3_000;
server.listen(PORT, () => {
  console.info(`Server listening on http://localhost:${PORT}`);
});

export { server, createApp };
