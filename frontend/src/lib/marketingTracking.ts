type TrackingPayload = Record<string, unknown>;

type TrackingWindow = Window & {
  dataLayer?: Array<Record<string, unknown>>;
  ttq?: { track?: (event: string, payload?: TrackingPayload) => void };
  fbq?: (...args: unknown[]) => void;
  snaptr?: (...args: unknown[]) => void;
  gtag?: (...args: unknown[]) => void;
  __akareTrackEvent?: (event: string, payload?: TrackingPayload) => void;
};

const pushSafe = (fn: () => void) => {
  try {
    fn();
  } catch {
    // Tracking is optional; never block UI flows.
  }
};

export const trackMarketingEvent = (event: string, payload: TrackingPayload = {}) => {
  if (typeof window === 'undefined') return;
  const w = window as TrackingWindow;

  pushSafe(() => {
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event, ...payload });
  });
  pushSafe(() => w.gtag?.('event', event, payload));
  pushSafe(() => w.fbq?.('trackCustom', event, payload));
  pushSafe(() => w.ttq?.track?.(event, payload));
  pushSafe(() => w.snaptr?.('track', event, payload));
};

export const initMarketingTrackingBridge = () => {
  if (typeof window === 'undefined') return;
  const w = window as TrackingWindow;
  w.__akareTrackEvent = (event: string, payload?: TrackingPayload) => {
    trackMarketingEvent(event, payload || {});
  };
};
