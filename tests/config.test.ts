import { describe, expect, it } from "vitest";

import {
  AUTH_CONFIGURATION_MESSAGE,
  loadConfig,
  loadServerConfig,
  redactSecret,
} from "../src/config.js";

describe("loadConfig", () => {
  it("rejects API keys that cannot be safely sent as one header value", () => {
    expect(() =>
      loadConfig({
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
        HYPERSTAR_API_KEY: "hstar_test_public.secret\nsecond-line",
      }),
    ).toThrow("HYPERSTAR_API_KEY contains unsupported characters");
    expect(() =>
      loadConfig({
        HYPERSTAR_API_BASE_URL: "https://api.example.test",
        HYPERSTAR_API_KEY: "hstar_test_public.secret\twith-tab",
      }),
    ).toThrow("HYPERSTAR_API_KEY contains unsupported characters");
  });

  it("rejects non-HTTPS non-localhost API base URLs", () => {
    expect(() =>
      loadConfig({
        HYPERSTAR_API_BASE_URL: "http://api.example.test",
        HYPERSTAR_API_KEY: "hstar_test_public.secret",
      }),
    ).toThrow(
      "HYPERSTAR_API_BASE_URL must use HTTPS, except localhost development URLs",
    );
  });

  it("requires an API key, while server startup degrades to discovery-only", () => {
    expect(() => loadConfig({})).toThrow(AUTH_CONFIGURATION_MESSAGE);
    expect(loadServerConfig({})).toEqual({
      authMode: "unauthenticated",
      apiBaseUrl: "https://autopilot.hyper-star.org",
    });
  });
});

describe("redactSecret", () => {
  it("never echoes the full API key", () => {
    expect(redactSecret("hstar_test_public.secret")).toBe(
      "hstar_test_public.[redacted]",
    );
  });
});
