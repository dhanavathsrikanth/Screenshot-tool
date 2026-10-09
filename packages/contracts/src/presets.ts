export interface DevicePreset {
  name: string;
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
    hasTouch?: boolean;
  };
  userAgent?: string;
}

export const DEVICE_PRESETS: Record<string, DevicePreset> = {
  desktop_standard: {
    name: "Desktop Standard (1280x720)",
    viewport: { width: 1280, height: 720, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  },
  desktop_hd: {
    name: "Desktop Full HD (1920x1080)",
    viewport: { width: 1920, height: 1080, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  },
  desktop_2k: {
    name: "Desktop 2K (2560x1440)",
    viewport: { width: 2560, height: 1440, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  },
  desktop_4k: {
    name: "Desktop 4K (3840x2160)",
    viewport: { width: 3840, height: 2160, deviceScaleFactor: 2, isMobile: false, hasTouch: false },
  },
  iphone_15_pro: {
    name: "iPhone 15 Pro",
    viewport: { width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
  iphone_15_pro_max: {
    name: "iPhone 15 Pro Max",
    viewport: { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
  iphone_17_pro_max: {
    name: "iPhone 17 Pro Max",
    viewport: { width: 440, height: 956, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6 Mobile/15E148 Safari/604.1",
  },
  pixel_8: {
    name: "Google Pixel 8",
    viewport: { width: 412, height: 915, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  },
  ipad_pro_11: {
    name: "iPad Pro 11-inch",
    viewport: { width: 834, height: 1194, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
} as const;

export type DevicePresetName = keyof typeof DEVICE_PRESETS;
