/**
 * Page-bridge script — standalone IIFE injected into the page context.
 *
 * Built by Vite as a separate file (dist/page-bridge.js) and loaded via
 * script.src to bypass Content Security Policy restrictions on inline scripts.
 *
 * Runs in the host page's JS context so it has direct access to
 * window.phantom / window.solana wallet adapters.
 */

(function () {
  var BRIDGE_PREFIX = 'walletwhisper-bridge';

  function getWallet() {
    if (window.phantom && window.phantom.solana) return window.phantom.solana;
    if (window.solana) return window.solana;
    return null;
  }

  window.addEventListener('message', function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.direction !== 'from-content') return;
    if (!event.data.type || !event.data.type.startsWith(BRIDGE_PREFIX)) return;

    var id = event.data.id;
    var action = event.data.action;

    function respond(result, error) {
      window.postMessage(
        {
          direction: 'from-page',
          type: BRIDGE_PREFIX + '-response',
          id: id,
          result: result,
          error: error || null,
        },
        '*',
      );
    }

    if (action === 'detectWallet') {
      var w = getWallet();
      respond({ available: !!w, isConnected: w ? w.isConnected : false });
      return;
    }

    if (action === 'connectWallet') {
      var wallet = getWallet();
      if (!wallet) {
        respond(null, 'No Solana wallet detected. Please install Phantom or Solflare.');
        return;
      }

      // Skip popup if wallet is already connected
      if (wallet.isConnected && wallet.publicKey) {
        respond({ publicKey: wallet.publicKey.toBase58() });
        return;
      }

      wallet
        .connect()
        .then(function (resp) {
          respond({ publicKey: resp.publicKey.toBase58() });
        })
        .catch(function (err) {
          respond(null, err.message || 'Wallet connection rejected');
        });
      return;
    }

    if (action === 'signMessage') {
      var wallet2 = getWallet();
      if (!wallet2) {
        respond(null, 'No Solana wallet detected.');
        return;
      }
      if (!wallet2.isConnected) {
        respond(null, 'Wallet not connected. Please connect first.');
        return;
      }
      var msgBytes = Uint8Array.from(atob(event.data.messageBase64), function (c) {
        return c.charCodeAt(0);
      });
      wallet2
        .signMessage(msgBytes)
        .then(function (resp) {
          var binary = '';
          var sig = resp.signature;
          for (var i = 0; i < sig.length; i++) {
            binary += String.fromCharCode(sig[i]);
          }
          respond({ signatureBase64: btoa(binary) });
        })
        .catch(function (err) {
          respond(null, err.message || 'Message signing rejected');
        });
      return;
    }

    if (action === 'disconnectWallet') {
      var wallet3 = getWallet();
      if (wallet3 && wallet3.disconnect) {
        wallet3
          .disconnect()
          .then(function () {
            respond({ success: true });
          })
          .catch(function (err) {
            respond(null, err.message);
          });
      } else {
        respond({ success: true });
      }
      return;
    }

    if (action === 'readTerminalWallets') {
      try {
        var sessionRaw = localStorage.getItem('padreV2-session');
        var session = sessionRaw ? JSON.parse(sessionRaw) : null;
        var walletsRaw = localStorage.getItem('padreV2-walletsCache');
        var walletsCache = walletsRaw ? JSON.parse(walletsRaw) : {};
        var wallets = [];

        if (session && session.uid && walletsCache[session.uid]) {
          wallets = walletsCache[session.uid];
        }

        respond({ wallets: wallets, session: session });
      } catch (err) {
        respond({ wallets: [], session: null });
      }
      return;
    }

    if (action === 'readFirebaseToken') {
      try {
        var dbRequest = indexedDB.open('firebaseLocalStorageDb');
        dbRequest.onerror = function () {
          respond(null);
        };
        dbRequest.onsuccess = function () {
          var db = dbRequest.result;
          try {
            var tx = db.transaction('firebaseLocalStorage', 'readonly');
            var store = tx.objectStore('firebaseLocalStorage');
            var getRequest = store.get(
              'firebase:authUser:AIzaSyDytD3neNMfkCmjm7Ll24bJuAzZIaERw8Q:[DEFAULT]',
            );
            getRequest.onsuccess = function () {
              var result = getRequest.result;
              if (result && result.value) {
                respond({ user: result.value });
              } else if (result) {
                respond({ user: result });
              } else {
                respond(null);
              }
            };
            getRequest.onerror = function () {
              respond(null);
            };
          } catch (e) {
            respond(null);
          }
        };
      } catch (err) {
        respond(null);
      }
      return;
    }

    respond(null, 'Unknown action: ' + action);
  });
})();
