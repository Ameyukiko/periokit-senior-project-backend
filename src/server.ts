import "dotenv/config";
import { env } from "./lib/env";
import app from "./app";
import { attachApolloServer } from "./graphql/apollo";
import { closeSharedRendererBrowser } from "./modules/exports/exports.shared-renderer";

const PORT = env.PORT;

const start = async () => {
  await attachApolloServer(app);

  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
  });

  const shutdown = () => {
    server.close(() => {
      void closeSharedRendererBrowser().finally(() => process.exit(0));
    });
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
};

start().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});
