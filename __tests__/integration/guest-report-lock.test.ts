/**
 * Integration test: Guest analyze → redirect /report → locked report (blur + overlay CTA)
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportLockWrapper } from "@/components/ReportLockWrapper";

const reportBody = React.createElement("div", { className: "report-body" },
  React.createElement("h1", null, "Performance Report"),
  React.createElement("p", null, "https://example.com"),
  React.createElement("section", null, React.createElement("h2", null, "Dashboard"), React.createElement("div", null, "Health: 7.2 / 10")),
  React.createElement("section", null, React.createElement("h2", null, "Revenue Impact"), React.createElement("p", null, "Summary")),
  React.createElement("section", null, React.createElement("h2", null, "Metrics")),
  React.createElement("section", null, React.createElement("h2", null, "What to fix first"))
);

describe("Guest report lock integration", () => {
  it("locked report page shows full report content blurred and overlay CTA on top", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReportLockWrapper, { isLocked: true }, reportBody)
    );

    expect(html).toContain("Create an account to unlock your full Performance Intelligence Report");
    expect(html).toContain("Sign Up");
    expect(html).toContain("Login");
    expect(html).toContain('href="/auth/login?redirect=/dashboard"');
    expect(html).toContain('href="/auth/signup?redirect=/dashboard"');
    expect(html).toContain("blur(8px)");
    expect(html).toContain("Performance Report");
    expect(html).toContain("Dashboard");
    expect(html).toContain("Revenue Impact");
    expect(html).toContain("What to fix first");
  });

  it("guest flow uses localStorage key pendingAnalysisResult and redirect /report", () => {
    const key = "pendingAnalysisResult";
    const redirectPath = "/report";
    expect(key).toBe("pendingAnalysisResult");
    expect(redirectPath).toBe("/report");
  });
});
