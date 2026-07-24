import assert from "node:assert/strict";
import { test } from "node:test";

import { chunkClinicalText, serializeMedicalContent } from "./chunking.js";

test("short notes remain a single chunk", () => {
  assert.deepEqual(chunkClinicalText("Short demo note"), [
    { index: 0, text: "Short demo note" }
  ]);
});

test("long notes are chunked with stable indexes and bounded size", () => {
  const chunks = chunkClinicalText("Demo sentence. ".repeat(500));
  assert.ok(chunks.length > 1);
  assert.deepEqual(chunks.map((chunk) => chunk.index), chunks.map((_, index) => index));
  assert.ok(chunks.every((chunk) => chunk.text.length <= 1400));
});

test("structured medical fields retain their labels", () => {
  assert.equal(
    serializeMedicalContent({ summary: "Stable", pain: 2 }),
    "summary: Stable\npain: 2"
  );
});
