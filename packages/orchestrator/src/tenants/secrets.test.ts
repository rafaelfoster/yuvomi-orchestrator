import { describe, expect, test } from "vitest";
import { generateSecret, generateTenantSecrets } from "./secrets.js";

describe("generateSecret", () => {
  test("returns a hex string of the requested byte length", () => {
    const secret = generateSecret(16);
    expect(secret).toMatch(/^[0-9a-f]+$/);
    expect(secret).toHaveLength(32);
  });

  test("returns a different value on each call", () => {
    expect(generateSecret()).not.toBe(generateSecret());
  });
});

describe("generateTenantSecrets", () => {
  test("produces distinct dbEncryptionKey and sessionSecret", () => {
    const secrets = generateTenantSecrets();
    expect(secrets.dbEncryptionKey).not.toBe(secrets.sessionSecret);
    expect(secrets.dbEncryptionKey).toHaveLength(64);
    expect(secrets.sessionSecret).toHaveLength(64);
  });
});
