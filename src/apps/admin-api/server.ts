import { app } from "./app.js";
import { env } from "../../config/env.js";

const port = env.ADMIN_API_PORT;

app.listen(port, () => {
  console.log(`admin-api listening on port ${port}`);
});
