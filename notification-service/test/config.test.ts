import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("service configuration", () => {
  it("reads TRUST_PROXY as a hop count and never as trust-everything", () => {
    vi.stubEnv("TRUST_PROXY", "1");
    expect(loadConfig().trustProxy).toBe(1);
    vi.stubEnv("TRUST_PROXY", "true");
    expect(() => loadConfig()).toThrow("TRUST_PROXY must be an integer >= 0");
  });

  it("rejects more than the current and prior FDA annual XML sources", () => {
    vi.stubEnv(
      "FDA_ANNUAL_XML_URLS",
      [
        "https://www.fda.gov/media/current/download?attachment=",
        "https://www.fda.gov/media/prior/download?attachment=",
        "https://www.fda.gov/media/extra/download?attachment=",
      ].join(","),
    );

    expect(() => loadConfig()).toThrow("FDA_ANNUAL_XML_URLS must include at most 2 official XML URLs");
  });

  it("loads FCM project and service-account path without reading secret contents", () => {
    vi.stubEnv("FCM_PROJECT_ID", "beanstalk-prod");
    vi.stubEnv("FCM_SERVICE_ACCOUNT_PATH", "/run/secrets/firebase-service-account.json");
    vi.stubEnv("FCM_ANDROID_PACKAGE_NAME", "org.jacobrakaifoundation.beanstalk");

    expect(loadConfig().fcm).toEqual({
      projectId: "beanstalk-prod",
      serviceAccountPath: "/run/secrets/firebase-service-account.json",
      androidPackageName: "org.jacobrakaifoundation.beanstalk",
    });
  });

  it("rejects an invalid FCM Android application ID", () => {
    vi.stubEnv("FCM_ANDROID_PACKAGE_NAME", "https://not-a-package.example");
    expect(() => loadConfig()).toThrow("FCM_ANDROID_PACKAGE_NAME must be a valid Android application ID");
  });
});
