# South Park - Proxy & Streaming Dashboard

Este projeto implementa um servidor proxy robusto e uma interface web interativa (dashboard) de alto padrão estético para visualizar todas as temporadas e assistir aos episódios de *South Park*, baseando-se no conteúdo oficial de `https://southpark.cc.com` (antigo portal brasileiro `southparkstudios.com.br`).

## ✨ Recursos

*   **Painel Hub Premium:** Interface moderna no tema escuro com detalhes em dourado (cor de South Park), contendo transições suaves, efeitos de glassmorphism e barra de pesquisa inteligente.
*   **Proxy de Alta Performance:** Servidor Node/Express que faz cache dos metadados e consolida dinamicamente toda a listagem de episódios de uma temporada através da paginação nativa (`loadMore`).
*   **Bypass de Restrições Geográficas (CORS/Bloqueios)**:
    *   **Remoção de Iframe Walls:** Remove cabeçalhos de segurança restritivos como `X-Frame-Options` e `Content-Security-Policy` para permitir que o player seja incorporado localmente sem problemas.
    *   **Omissão de Encaminhamento (Anônimo):** Remove os cabeçalhos `X-Forwarded-For` e `X-Real-IP`, fazendo com que os servidores da Paramount visualizem apenas o IP do servidor proxy (localizado nos EUA), contornando o bloqueio regional para usuários do Brasil.
    *   **Interceptador Dinâmico (Browser Monkey Patching):** Injeta um script que intercepta todas as chamadas AJAX (`fetch` e `XMLHttpRequest`) do reprodutor em tempo de execução, redirecionando requisições aos servidores `topaz.paramount.tech` e `api.neutron.paramount.tech` para as rotas locais do proxy.

## 📁 Estrutura do Código

*   `server.js`: O código principal do servidor backend, responsável pela retransmissão de rotas e reescrita de dados.
*   `test-proxy.js`: O testador automático de integração para verificar e garantir que as APIs e o proxy estão funcionando perfeitamente.
*   `public/`: Arquivos estáticos do Dashboard (`index.html`, `style.css`, `app.js`).
*   `package.json`: Configurações de scripts e dependências (Express).

## 🚀 Como Executar

### 1. Pré-requisitos
Certifique-se de ter o [Node.js](https://nodejs.org/) instalado (versão 18+ recomendada).

### 2. Instalação
Na raiz da pasta do projeto, instale as dependências:
```bash
npm install
```

### 3. Iniciar o Servidor
Execute o seguinte comando para ligar o servidor proxy:
```bash
npm start
```
Após o início do servidor, acesse o painel principal pelo navegador em: **`http://localhost:3000`**.

### 4. Executar Testes Automatizados
Para testar a saúde das APIs de raspagem e o desvio de cabeçalhos de CORS/região:
```bash
npm test
```

---
*Desenvolvido de forma independente para fins de demonstração tecnológica e portabilidade de streaming.*
