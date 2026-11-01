/**
 * Content script for Price Fixer extension
 * Runs on web pages to find and modify prices
 */

import { PriceFixerContent } from './priceFixerContent';

let priceFixerInstance: PriceFixerContent | null = null;

function start(): void {
  if (!priceFixerInstance) {
    priceFixerInstance = new PriceFixerContent();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

window.addEventListener('pagehide', () => {
  if (priceFixerInstance) {
    priceFixerInstance.destroy();
    priceFixerInstance = null;
  }
});
