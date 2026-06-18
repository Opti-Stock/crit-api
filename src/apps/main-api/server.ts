import { app } from "./app.js";

const DEFAULT_MAIN_API_PORT = 3000;
const port = Number(process.env.MAIN_API_PORT ?? DEFAULT_MAIN_API_PORT);

app.listen(port, () => {
  console.log(`main-api listening on port ${port}`);
});
