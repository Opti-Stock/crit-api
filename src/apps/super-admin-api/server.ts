import { env } from "../../config/env.js";
import { app } from "./app.js";

const port = env.SUPER_ADMIN_API_PORT;

app.listen(port, () => {
  console.log(`super-admin-api listening on port ${port}`);
});
