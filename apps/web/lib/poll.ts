export function onVisibleInterval(callback: () => void, ms: number) {
  if (typeof window === "undefined") return () => undefined;
  const tick = () => {
    if (document.visibilityState !== "visible") return;
    callback();
  };
  const id = window.setInterval(tick, ms);
  return () => window.clearInterval(id);
}
