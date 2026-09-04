import { buildApp } from "./app.js";

const app = await buildApp();

try {
  await app.listen({ host: app.env.HOST, port: app.env.PORT });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
