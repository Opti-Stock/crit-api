import assert from "node:assert/strict";
import test from "node:test";

import { BadRequestError } from "../../shared/errors/app-error.js";
import { assertNoOverlaps } from "./scheduling-config.service.js";

test("accepts adjacent scheduling ranges", () => {
  assert.doesNotThrow(() => assertNoOverlaps([
    { weekday: 1, startTime: "08:00", endTime: "10:00" },
    { weekday: 1, startTime: "10:00", endTime: "12:00" }
  ]));
});

test("rejects overlapping scheduling ranges", () => {
  assert.throws(
    () => assertNoOverlaps([
      { weekday: 2, startTime: "08:00", endTime: "10:30" },
      { weekday: 2, startTime: "10:00", endTime: "11:00" }
    ]),
    (error) => error instanceof BadRequestError
      && error.code === "SCHEDULING_TIME_RANGE_OVERLAP"
  );
});

test("rejects inverted scheduling ranges", () => {
  assert.throws(
    () => assertNoOverlaps([
      { weekday: 3, startTime: "12:00", endTime: "09:00" }
    ]),
    (error) => error instanceof BadRequestError
      && error.code === "SCHEDULING_TIME_RANGE_INVALID"
  );
});
