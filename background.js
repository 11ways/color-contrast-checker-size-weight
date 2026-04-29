// Detect Google Chrome via userAgentData.brands — Arc and other Chromium
// browsers don't include "Google Chrome" in their brands list.
const isGoogleChrome = navigator.userAgentData?.brands?.some(b => b.brand === 'Google Chrome');

if (isGoogleChrome && chrome.sidePanel) {
  // Chrome: open as side panel on icon click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
}
// Other browsers: default_popup from manifest.json handles it
