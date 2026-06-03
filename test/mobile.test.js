import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MOBILE_BREAKPOINT_PX,
  isMobile,
  syncMobileBodyState,
  clearCardAbsolutePositions
} from "../src/js/mobile.js";

describe("mobile.isMobile", () => {
  let originalMM;
  beforeEach(() => {
    originalMM = globalThis.matchMedia;
  });
  afterEach(() => {
    globalThis.matchMedia = originalMM;
  });

  it("reports true when matchMedia matches the breakpoint", () => {
    globalThis.matchMedia = vi.fn((q) => ({
      matches: q.includes(String(MOBILE_BREAKPOINT_PX)),
      media: q,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {},
      dispatchEvent() { return false; }
    }));
    expect(isMobile()).toBe(true);
  });

  it("reports false when matchMedia does not match", () => {
    globalThis.matchMedia = vi.fn(() => ({
      matches: false, media: "",
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {},
      dispatchEvent() { return false; }
    }));
    expect(isMobile()).toBe(false);
  });

  it("falls back to innerWidth when matchMedia is unavailable", () => {
    delete globalThis.matchMedia;
    const originalInner = globalThis.innerWidth;
    Object.defineProperty(globalThis, "innerWidth", { value: 400, configurable: true });
    expect(isMobile()).toBe(true);
    Object.defineProperty(globalThis, "innerWidth", { value: 1200, configurable: true });
    expect(isMobile()).toBe(false);
    Object.defineProperty(globalThis, "innerWidth", { value: originalInner, configurable: true });
  });
});

describe("mobile.syncMobileBodyState", () => {
  let originalMM;
  beforeEach(() => {
    originalMM = globalThis.matchMedia;
    document.body.className = "";
    document.documentElement.style.removeProperty("--topbar-h");
    document.body.innerHTML = "<div class=\"topbar\" style=\"height: 64px\"></div>";
    // jsdom returns 0 from getBoundingClientRect; stub it to a non-zero so
    // we can assert the var is written.
    const topbar = document.querySelector(".topbar");
    topbar.getBoundingClientRect = () => ({ height: 64 });
  });
  afterEach(() => {
    globalThis.matchMedia = originalMM;
    document.body.className = "";
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--topbar-h");
  });

  it("adds the is-mobile class and sets --topbar-h when mobile", () => {
    globalThis.matchMedia = vi.fn(() => ({
      matches: true, media: "",
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {},
      dispatchEvent() { return false; }
    }));
    syncMobileBodyState(document);
    expect(document.body.classList.contains("is-mobile")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--topbar-h")).toBe("64px");
  });

  it("removes the is-mobile class and unsets --topbar-h when desktop", () => {
    document.body.classList.add("is-mobile");
    document.documentElement.style.setProperty("--topbar-h", "64px");
    globalThis.matchMedia = vi.fn(() => ({
      matches: false, media: "",
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {},
      dispatchEvent() { return false; }
    }));
    syncMobileBodyState(document);
    expect(document.body.classList.contains("is-mobile")).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--topbar-h")).toBe("");
  });
});

describe("mobile.clearCardAbsolutePositions", () => {
  it("strips inline left/top from each card", () => {
    const a = document.createElement("div");
    a.style.left = "120px"; a.style.top = "80px";
    const b = document.createElement("div");
    b.style.left = "50px"; b.style.top = "30px";
    clearCardAbsolutePositions([a, b, null]);
    expect(a.style.left).toBe("");
    expect(a.style.top).toBe("");
    expect(b.style.left).toBe("");
    expect(b.style.top).toBe("");
  });
});
