import { describe, expect, it } from "vitest";
import {
  isMarketingHost,
  isOfficeAppPath,
  marketingHref,
  resolveMarketingRequest,
} from "./marketingHost";
import { getTenantFromHostname } from "@/services/tenant/tenantResolver";

describe("isMarketingHost", () => {
  it("treats the apex and www as the marketing site", () => {
    expect(isMarketingHost("staveto.com")).toBe(true);
    expect(isMarketingHost("www.staveto.com")).toBe(true);
    expect(isMarketingHost("WWW.staveto.com:443")).toBe(true);
  });

  it("leaves the office app, company tenants, and localhost alone", () => {
    expect(isMarketingHost("app.staveto.com")).toBe(false);
    expect(isMarketingHost("elc.staveto.com")).toBe(false);
    expect(isMarketingHost("localhost:3000")).toBe(false);
    expect(isMarketingHost("127.0.0.1")).toBe(false);
  });
});

describe("resolveMarketingRequest", () => {
  it("does not rewrite localhost, so / still enters the office app", () => {
    expect(resolveMarketingRequest("localhost:3000", "/")).toEqual({ type: "next" });
    expect(resolveMarketingRequest("localhost:3000", "/app")).toEqual({ type: "next" });
    expect(resolveMarketingRequest("localhost:3000", "/login")).toEqual({ type: "next" });
    expect(resolveMarketingRequest("app.staveto.com", "/")).toEqual({ type: "next" });
  });

  it("rewrites public marketing URLs onto /site", () => {
    expect(resolveMarketingRequest("www.staveto.com", "/")).toEqual({
      type: "rewrite",
      pathname: "/site",
    });
    expect(resolveMarketingRequest("staveto.com", "/pricing")).toEqual({
      type: "rewrite",
      pathname: "/site/pricing",
    });
    expect(resolveMarketingRequest("www.staveto.com", "/privacy")).toEqual({
      type: "rewrite",
      pathname: "/site/privacy",
    });
  });

  it("sends login and office paths to app.staveto.com", () => {
    expect(resolveMarketingRequest("www.staveto.com", "/login")).toEqual({
      type: "redirect-app",
      pathname: "/login",
    });
    expect(resolveMarketingRequest("staveto.com", "/register")).toEqual({
      type: "redirect-app",
      pathname: "/register",
    });
    expect(resolveMarketingRequest("www.staveto.com", "/app/projects")).toEqual({
      type: "redirect-app",
      pathname: "/app/projects",
    });
    expect(isOfficeAppPath("/api/gmail")).toBe(true);
  });

  it("canonicalizes /site links back to public paths on the marketing host", () => {
    expect(resolveMarketingRequest("www.staveto.com", "/site")).toEqual({
      type: "redirect-public",
      pathname: "/",
    });
    expect(resolveMarketingRequest("www.staveto.com", "/site/contact")).toEqual({
      type: "redirect-public",
      pathname: "/contact",
    });
  });
});

describe("getTenantFromHostname", () => {
  it("does not treat the marketing host as the office app workspace", () => {
    expect(getTenantFromHostname("staveto.com").mode).toBe("marketing");
    expect(getTenantFromHostname("www.staveto.com").mode).toBe("marketing");
    expect(getTenantFromHostname("app.staveto.com").mode).toBe("app");
    expect(getTenantFromHostname("localhost").mode).toBe("app");
    expect(getTenantFromHostname("elc.staveto.com")).toEqual({
      mode: "tenant",
      slug: "elc",
      hostname: "elc.staveto.com",
    });
  });
});

describe("marketingHref", () => {
  it("uses clean URLs on the marketing host and /site on localhost", () => {
    expect(marketingHref("www.staveto.com", "/product")).toBe("/product");
    expect(marketingHref("localhost:3000", "/product")).toBe("/site/product");
    expect(marketingHref("localhost:3000", "/")).toBe("/site");
  });
});
