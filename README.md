# Resend Request

Extensão de DevTools (Chrome / Edge, Manifest V3) inspirada no recurso
**Edit and Resend** do Firefox Developer Edition.

Captura as requisições que passam pela aba Network, deixa você editar
**método, URL, headers e body** e reenvia a versão modificada, mostrando a
resposta.

## Instalação (modo desenvolvedor)

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e selecione a pasta deste projeto
   (`resend-request`).
4. Abra o **DevTools** (F12) em qualquer aba e vá até o painel **Resend Request**.

## Como usar

1. Navegue na página normalmente. As requisições aparecem na lista à esquerda.
2. Clique em uma requisição para carregá-la no editor.
3. Edite o que quiser:
   - **Método** e **URL** na barra superior.
   - **Headers**: edite valores, adicione (`+ Header`) ou remova (`×`).
   - **Body**: na aba *Body* (JSON é formatado automaticamente na resposta).
4. Clique em **Reenviar** (ou `Ctrl` / `Cmd` + `Enter`).
5. Veja status, tempo, tamanho e corpo na aba **Resposta**.

Use o campo de filtro para localizar requisições por URL ou método, e
**Limpar** para esvaziar a lista.

## Limitações conhecidas

Por restrições de segurança do navegador, um `fetch` comum **não pode
sobrescrever headers "proibidos"** — por exemplo `Host`, `Origin`, `Referer`,
`Cookie`, `User-Agent`, `Content-Length` e prefixos `Sec-` / `Proxy-`.

- Esses headers aparecem riscados no editor e são **ignorados no reenvio**.
- Após enviar, a aba *Resposta* lista quais headers foram descartados.
- O reenvio também está sujeito às regras de **CORS** da origem alvo.

Para fidelidade total ao Firefox (incluindo headers restritos), a evolução
natural é reescrever os headers via a API `declarativeNetRequest` — fora do
escopo desta versão simples.

## Estrutura

| Arquivo        | Função                                                        |
| -------------- | ------------------------------------------------------------- |
| `manifest.json`| Manifesto MV3; declara a página de DevTools.                  |
| `devtools.html`/`devtools.js` | Cria o painel "Resend Request".                |
| `panel.html`   | Marcação da interface do painel.                              |
| `panel.css`    | Estilos (tema escuro, estilo DevTools).                       |
| `panel.js`     | Captura, edição e reenvio das requisições.                    |
| `icons/`       | Ícones da extensão (16/48/128 px).                            |
