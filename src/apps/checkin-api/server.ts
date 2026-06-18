import { app } from "./app.js";

const DEFAULT_CHECKIN_API_PORT = 3002;
const port = Number(process.env.CHECKIN_API_PORT ?? DEFAULT_CHECKIN_API_PORT);

app.listen(port, () => {
  console.log(`checkin-api listening on port ${port}`);
});
