import { describe, expect, test } from "vitest";
import { splitImageRef } from "./runner.js";

describe("splitImageRef", () => {
  test("splits a simple repo:tag reference", () => {
    expect(splitImageRef("ghcr.io/ulsklyc/yuvomi:v1.4.2")).toEqual({
      image: "ghcr.io/ulsklyc/yuvomi",
      imageTag: "v1.4.2",
    });
  });

  test("defaults to latest when no tag is present", () => {
    expect(splitImageRef("ghcr.io/ulsklyc/yuvomi")).toEqual({
      image: "ghcr.io/ulsklyc/yuvomi",
      imageTag: "latest",
    });
  });

  test("does not mistake a registry port for a tag", () => {
    expect(splitImageRef("localhost:5000/yuvomi")).toEqual({
      image: "localhost:5000/yuvomi",
      imageTag: "latest",
    });
  });

  test("splits tag correctly when registry has a port", () => {
    expect(splitImageRef("localhost:5000/yuvomi:v2")).toEqual({
      image: "localhost:5000/yuvomi",
      imageTag: "v2",
    });
  });
});
