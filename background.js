// Reset any previously cached sidePanel behavior so default_popup works.
// This fixes Arc where setPanelBehavior persists but sidePanel doesn't render.
if (chrome.sidePanel?.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: false })
    .catch(() => {});
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("Colour Contrast Checker Pro installed.");
});
