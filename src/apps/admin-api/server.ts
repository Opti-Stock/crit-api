import { app } from "./app.js";

const DEFAULT_ADMIN_API_PORT = 3001;
const port = Number(process.env.ADMIN_API_PORT ?? DEFAULT_ADMIN_API_PORT);

app.listen(port, () => {
  console.log(`admin-api listening on port ${port}`);
});
