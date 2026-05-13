import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { EXECUTION_TIMEOUT_MS, runPython } from "../src/executor.js";

describe("runPython", () => {
  test("returns stdout for a successful program", async () => {
    const result = await runPython('print("Hello Empower")');

    assert.equal(result.success, true);
    assert.equal(result.timeout, false);
    assert.equal(result.exitCode, 0);
    assert.equal(result.error, "");
    assert.match(result.output, /Hello Empower/);
  });

  test("flags a timeout and kills an infinite loop within the configured limit", async () => {
    const start = Date.now();
    const result = await runPython("while True: pass");
    const elapsed = Date.now() - start;

    assert.equal(result.success, false);
    assert.equal(result.timeout, true);
    assert.equal(result.output, "");
    // SIGKILL fires at EXECUTION_TIMEOUT_MS. Allow a small grace for process
    // teardown, but anything well over should be treated as a regression.
    assert.ok(
      elapsed >= EXECUTION_TIMEOUT_MS - 50,
      `expected at least ${EXECUTION_TIMEOUT_MS} ms, got ${elapsed} ms`,
    );
    assert.ok(
      elapsed < EXECUTION_TIMEOUT_MS + 1500,
      `expected timeout cleanup under ${EXECUTION_TIMEOUT_MS + 1500} ms, got ${elapsed} ms`,
    );
  });
});
