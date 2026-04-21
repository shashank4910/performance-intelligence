import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportLockWrapper } from "@/components/ReportLockWrapper";

describe("ReportLockWrapper", () => {
  it("when isLocked is false, renders only children with no overlay", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReportLockWrapper,
        { isLocked: false },
        React.createElement("div", null, "Child content")
      )
    );
    expect(html).toContain("Child content");
    expect(html).not.toContain("Create an account to unlock");
    expect(html).not.toContain("/auth/login");
    expect(html).not.toContain("/auth/signup");
  });

  it("when isLocked is true, applies blur and disables pointer on content", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ReportLockWrapper,
        { isLocked: true },
        React.createElement("div", null, "Report body")
      )
    );
    expect(html).toContain("blur(8px)");
    expect(html).toContain("pointer-events:none");
    expect(html).toContain("user-select:none");
  });

  it("when isLocked is true, shows overlay with correct CTA heading", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReportLockWrapper, { isLocked: true }, React.createElement("div", null, "x"))
    );
    expect(html).toContain("Create an account to unlock your full Performance Intelligence Report");
  });

  it("when isLocked is true, CTA links point to /auth/login and /auth/signup with redirect", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReportLockWrapper, { isLocked: true }, React.createElement("div", null, "x"))
    );
    expect(html).toContain('href="/auth/login?redirect=/dashboard"');
    expect(html).toContain('href="/auth/signup?redirect=/dashboard"');
  });

  it("when isLocked is true, overlay has Sign Up and Login button text", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReportLockWrapper, { isLocked: true }, React.createElement("div", null, "x"))
    );
    expect(html).toContain("Sign Up");
    expect(html).toContain("Login");
  });

  it("when isLocked is true, overlay has pointer-events auto so it is clickable", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReportLockWrapper, { isLocked: true }, React.createElement("div", null, "x"))
    );
    expect(html).toContain("pointer-events:auto");
  });
});
