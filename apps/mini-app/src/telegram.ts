interface TelegramBackButton {
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

interface TelegramWebApp {
  initData: string;
  colorScheme: "light" | "dark";
  ready(): void;
  expand(): void;
  enableClosingConfirmation(): void;
  disableVerticalSwipes?(): void;
  enableVerticalSwipes?(): void;
  close(): void;
  openTelegramLink(url: string): void;
  openLink?(url: string): void;
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy"): void;
    notificationOccurred(type: "error" | "success" | "warning"): void;
  };
  BackButton: TelegramBackButton;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const webApp = window.Telegram?.WebApp;

export const telegram = {
  initialize() {
    webApp?.ready();
    webApp?.expand();
  },
  initData: webApp?.initData ?? "",
  impact(style: "light" | "medium" | "heavy" = "light") {
    webApp?.HapticFeedback?.impactOccurred(style);
  },
  success() {
    webApp?.HapticFeedback?.notificationOccurred("success");
  },
  close() {
    if (!webApp) return false;
    webApp.close();
    return true;
  },
  openLink(url: string) {
    if (webApp && url.startsWith("https://t.me/")) webApp.openTelegramLink(url);
    else if (webApp?.openLink) webApp.openLink(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  },
  setBackAction(callback: (() => void) | null) {
    if (!webApp) return () => undefined;
    if (callback) {
      webApp.BackButton.onClick(callback);
      webApp.BackButton.show();
      return () => {
        webApp.BackButton.offClick(callback);
        webApp.BackButton.hide();
      };
    }
    webApp.BackButton.hide();
    return () => undefined;
  },
  setReaderMode(active: boolean) {
    if (active) webApp?.disableVerticalSwipes?.();
    else webApp?.enableVerticalSwipes?.();
  },
};
