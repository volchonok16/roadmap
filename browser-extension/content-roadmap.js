chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'tfs-bridge' && message.sessionId) {
    window.postMessage({ type: 'tfs-bridge', sessionId: message.sessionId }, window.location.origin)
  }
})
