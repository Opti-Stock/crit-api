import { app } from "./app.js";
import { env } from "../../config/env.js";

const port = env.CHECKIN_API_PORT;

app.listen(port, () => {
  console.log(`checkin-api listening on port ${port}`);
});
