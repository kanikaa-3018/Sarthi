import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bedrockSmokeImage, smokeCapabilities } from "../scripts/aiSmokeFixture.js";

describe("live AI smoke fixture", () => {
  it("uses a deterministic valid 64px PNG without an external network dependency", () => {
    const image = bedrockSmokeImage();
    const bytes = Buffer.from(image.bytes);

    assert.equal(image.format, "png");
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), 64);
    assert.equal(bytes.readUInt32BE(20), 64);
  });

  it("can rerun only one capability to avoid repeat inference cost", () => {
    assert.deepEqual(smokeCapabilities(["--live"]), ["text", "vision", "embedding"]);
    assert.deepEqual(smokeCapabilities(["--live", "--capability=vision"]), ["vision"]);
  });
});
