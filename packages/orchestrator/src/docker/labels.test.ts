import { describe, expect, test } from "vitest";
import { buildManagedLabels } from "./labels.js";

describe("buildManagedLabels", () => {
  test("tags the container with the tenant id for bulk operations", () => {
    const labels = buildManagedLabels({ tenantId: "abc123" });

    expect(labels["yuvomi.orchestrator.managed"]).toBe("true");
    expect(labels["yuvomi.orchestrator.tenant-id"]).toBe("abc123");
  });
});
