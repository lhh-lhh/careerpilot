declare global { interface Window { __CAREERPILOT_ONLINE__?: boolean } }
export const isOnline = typeof window !== "undefined" && window.__CAREERPILOT_ONLINE__ === true;
export const businessNow = () => isOnline ? new Date().toISOString() : "2026-11-12T02:00:00.000Z";
