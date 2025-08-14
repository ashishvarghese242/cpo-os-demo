// lib/theme.js
export function themeVars(){
  const s = getComputedStyle(document.documentElement);
  const read = (v) => (s.getPropertyValue(v) || "").trim();
  return {
    actualFill:    read("--chart-actual-fill"),
    actualLine:    read("--chart-actual-line"),
    targetFill:    read("--chart-target-fill"),
    targetLine:    read("--chart-target-line"),
    influenceFill: read("--chart-influence-fill"),
    influenceLine: read("--chart-influence-line"),
  };
}
