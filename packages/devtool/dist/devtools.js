const tabId = chrome.devtools.inspectedWindow.tabId;

chrome.runtime.onConnect.addListener(port => {
    if (+port.name !== tabId) return;

    let portTab = chrome.tabs.connect(tabId, { name: 'dev' });
    port.onMessage.addListener(msg => {
        portTab.postMessage(msg);
    });

    portTab.onMessage.addListener(msg => {
        port.postMessage(msg);
    });

    portTab.onDisconnect.addListener(() => {
        port.disconnect();
    });
});

chrome.devtools.panels.create(
    "Deepkit RPC",
    "",
    "app/browser/index.html",
    function(panel) {
    }
);
