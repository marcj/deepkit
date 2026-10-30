function inject() {
  let socketIds = 0;

  function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }


  function pushMessage(message) {
    window.dispatchEvent(new CustomEvent('@deepkit', { detail: message }));
  }

  const OriginalWebSocket = window.WebSocket;
  window.WebSocket = class WebSocket extends OriginalWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      const socket = socketIds++;

      this.addEventListener('message', (event) => {
        if (event.data instanceof ArrayBuffer || event.data instanceof Uint8Array) {
            pushMessage({ type: 'received', socket, timestamp: Date.now(), data: arrayBufferToBase64(event.data) });
        }
      });

      this.addEventListener('close', () => {
        pushMessage({ type: 'close', socket, timestamp: Date.now() });
      });

      const originalSend = this.send;
      this.send = function(data) {
        if (data instanceof ArrayBuffer || data instanceof Uint8Array) {
            pushMessage({ type: 'sent', socket, timestamp: Date.now(), data: arrayBufferToBase64(data) });
        }
        return originalSend.apply(this, arguments);
      };

      pushMessage({ type: 'client', socket, url, timestamp: Date.now() });
    }
  };
}
inject();
