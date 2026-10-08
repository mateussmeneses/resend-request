// Cria o painel "Resend Request" dentro do DevTools.
chrome.devtools.panels.create(
  "Resend Request",
  "icons/icon48.png",
  "panel.html",
  function (panel) {
    // Painel criado. A logica fica em panel.js, carregado por panel.html.
  }
);
