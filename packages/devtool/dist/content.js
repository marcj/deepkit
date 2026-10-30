const script = document.createElement('script');
script.src = chrome.runtime.getURL('inject.js');
script.onload = () => script.remove();
(document.head || document.documentElement).appendChild(script);

const messages = [];
const ports = [];

window.addEventListener('@deepkit', (event) => {
    messages.push(event.detail);

    for (const port of ports) {
        port.port.postMessage(event.detail);
    }

    if (messages.length > 2000) {
        messages.splice(0, 1000);
    }
});

chrome.runtime.onConnect.addListener((port) => {
    function onMessage(message) {
        if (message.type === 'start') {
            messages.forEach((message) => {
                port.postMessage(message);
            });
        } else if (message.type === 'ping') {
            port.postMessage({ type: 'pong' });
        }
    }

    port.onMessage.addListener(onMessage);
    const entry = {
        port,
        onMessage,
    };
    ports.push(entry);

    port.onDisconnect.addListener(() => {
        window.removeEventListener('@deepkit', receive);
        port.onMessage.removeListener(onMessage);
        ports.splice(ports.indexOf(entry), 1);
    });
});
