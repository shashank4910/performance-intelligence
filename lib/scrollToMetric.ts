/**
 * Smoothly scrolls to a metric section and applies a brief highlight.
 */
export function scrollToMetric(metricId: string): void {
  const element = document.getElementById(metricId);
  if (!element) return;

  element.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  element.classList.add("metric-highlight");

  setTimeout(() => {
    element.classList.remove("metric-highlight");
  }, 2000);
}
