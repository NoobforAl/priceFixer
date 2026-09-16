/**
 * Background script for Price Fixer extension
 * Handles extension lifecycle and communication
 */

interface TabState {
  enabled: boolean;
  processedCount: number;
}

interface BackgroundMessage {
  action: string;
  enabled?: boolean;
  processedCount?: number;
}

type MessageResponse = TabState | { success: true } | { error: string };

class PriceFixerBackground {
  private tabStates: Map<number, TabState> = new Map();

  constructor() {
    this.init();
  }

  private init(): void {
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Handle extension installation
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onInstalled.addListener(details => {
        if (details.reason === 'install') {
          this.showWelcomeNotification();
        }
        this.injectIntoOpenTabs();
      });

      // Handle tab updates
      chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        if (changeInfo.status === 'complete' && tab.url) {
          this.initializeTabState(tabId);
        }
      });

      // Clean up tab state when tab is removed
      chrome.tabs.onRemoved.addListener(tabId => {
        this.tabStates.delete(tabId);
      });

      // Handle messages from content script
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        this.handleMessage(message, sender, sendResponse);
        return true;
      });

      // Handle keyboard shortcut
      if (chrome.commands) {
        chrome.commands.onCommand.addListener(command => {
          if (command === 'toggle-extension') {
            this.toggleActiveTab();
          }
        });
      }
    }

    // Firefox compatibility
    if (typeof browser !== 'undefined' && browser.runtime) {
      browser.runtime.onInstalled.addListener((details: chrome.runtime.InstalledDetails) => {
        if (details.reason === 'install') {
          this.showWelcomeNotification();
        }
        this.injectIntoOpenTabs();
      });

      browser.tabs.onUpdated.addListener(
        (tabId: number, changeInfo: { status?: string }, tab: { url?: string }) => {
          if (changeInfo.status === 'complete' && tab.url) {
            this.initializeTabState(tabId);
          }
        }
      );

      browser.tabs.onRemoved.addListener((tabId: number) => {
        this.tabStates.delete(tabId);
      });

      browser.runtime.onMessage.addListener(
        (message: BackgroundMessage, sender: chrome.runtime.MessageSender) => {
          return new Promise<MessageResponse>(resolve => {
            this.handleMessage(message, sender, resolve);
          });
        }
      );
    }
  }

  private showWelcomeNotification(): void {
    const notification: chrome.notifications.NotificationCreateOptions = {
      type: 'basic',
      iconUrl: 'icons/icon-128.png',
      title: 'Price Fixer Installed!',
      message: 'Automatically rounds up prices on web pages.',
    };

    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.create('welcome', notification);
    } else if (typeof browser !== 'undefined' && browser.notifications) {
      browser.notifications.create('welcome', notification);
    }
  }

  /**
   * Content scripts are only injected into pages loaded after the extension
   * was installed/updated. Inject into tabs that are already open so the
   * popup works immediately instead of silently failing until a reload.
   */
  private async injectIntoOpenTabs(): Promise<void> {
    const api =
      typeof chrome !== 'undefined' && chrome.scripting
        ? chrome
        : typeof browser !== 'undefined' && browser.scripting
          ? browser
          : null;
    if (!api) {
      return;
    }
    try {
      const tabs = await api.tabs.query({ url: ['http://*/*', 'https://*/*'] });
      for (const tab of tabs) {
        if (!tab.id || tab.discarded) {
          continue;
        }
        api.scripting
          .executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
          .catch(() => {
            // Tab cannot be scripted (store pages, missing host permission, etc.)
          });
      }
    } catch {
      // tabs API unavailable
    }
  }

  private initializeTabState(tabId: number): void {
    if (!this.tabStates.has(tabId)) {
      this.tabStates.set(tabId, {
        enabled: true,
        processedCount: 0,
      });
    }
  }

  private handleMessage(
    message: BackgroundMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: MessageResponse) => void
  ): void {
    const tabId = sender.tab?.id;

    if (!tabId) {
      sendResponse({ error: 'No tab ID' });
      return;
    }

    switch (message.action) {
      case 'getTabState':
        sendResponse(this.getTabState(tabId));
        break;

      case 'updateTabState':
        this.tabStates.set(tabId, {
          enabled: message.enabled ?? true,
          processedCount: message.processedCount || 0,
        });
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  }

  private toggleActiveTab(): void {
    const api =
      typeof chrome !== 'undefined' && chrome.tabs
        ? chrome
        : typeof browser !== 'undefined'
          ? browser
          : null;
    if (!api?.tabs) {
      return;
    }

    api.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (tabs[0]?.id) {
        this.sendToContentScript(tabs[0].id, { action: 'toggle' });
      }
    });
  }

  private sendToContentScript(tabId: number, message: { action: string }): void {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.sendMessage(tabId, message).catch(() => {
        // Tab might not have content script injected
      });
    } else if (typeof browser !== 'undefined' && browser.tabs) {
      browser.tabs.sendMessage(tabId, message).catch(() => {
        // Tab might not have content script injected
      });
    }
  }

  public getTabState(tabId: number): TabState {
    return this.tabStates.get(tabId) || { enabled: true, processedCount: 0 };
  }

  public setTabState(tabId: number, state: TabState): void {
    this.tabStates.set(tabId, state);
  }
}

// Initialize background script
new PriceFixerBackground();

// Export for testing (only in test environment)
declare const module: { exports?: Record<string, unknown> } | undefined;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { PriceFixerBackground };
}
