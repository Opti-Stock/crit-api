import { app } from "./app.js";
import { env } from "../../config/env.js";

const port = env.MAIN_API_PORT;

app.listen(port, () => {
  console.log(`main-api listening on port ${port}`);
});
