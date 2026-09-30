# Guia de publicação no GitHub

Este pacote já contém o aplicativo, o modelo de exemplo, testes e documentação. A raiz da pasta deve ser a raiz do repositório: `index.html` e `README.md` precisam ficar diretamente nela.

## Texto sugerido para o repositório

**Nome:** `estrada-neural`

**Descrição curta para o campo About:**

> Rede neural do zero em JavaScript puro, com treinamento visual opcional, aprendizado durante trajetórias, retropropagação e modelo JSON. Guia completo para iniciantes. Código criado pelo Codex/OpenAI.

**Tópicos sugeridos:**

```text
javascript
neural-network
machine-learning
backpropagation
educational
vanilla-js
canvas
supervised-learning
imitation-learning
portuguese
```

O README serve como descrição longa. A autoria está em destaque nele e em `AUTHORS.md`.

## Antes de enviar

1. Extraia o pacote para uma pasta.
2. Abra `index.html` e confira a demonstração.
3. Se tiver Node disponível, execute `npm test` nessa pasta; não precisa instalar dependências.
4. Se quiser identificar o idealizador pelo nome ou perfil, edite a seção de orientação humana em `AUTHORS.md`.
5. Escolha uma licença caso queira incluir uma; este pacote não contém `LICENSE` nem escolhe uma em seu nome.

Não é necessário instalar pacotes ou gerar uma pasta de build. Não há credenciais para configurar.

## Envio com Git

Crie um repositório vazio na sua conta com o nome escolhido. Como este pacote já tem README e `.gitignore`, evite iniciar o repositório remoto com outros arquivos se for seguir estes comandos para o primeiro envio.

Abra um terminal **dentro da pasta que contém `index.html` e `README.md`**:

```bash
git init
git add .
git commit -m "Adiciona Estrada Neural: rede neural educativa em JavaScript puro"
git branch -M main
git remote add origin https://github.com/SEU_USUARIO/estrada-neural.git
git push -u origin main
```

Troque `SEU_USUARIO` pelo seu usuário e ajuste o nome do repositório no endereço, se necessário. O Git pode pedir sua autenticação ou configuração de identidade. Esses comandos são um roteiro para um repositório novo; não são necessários se você já colocou os arquivos em um repositório existente.

## Envio pelo navegador

Também é possível enviar os arquivos pela interface de upload do repositório. Envie o conteúdo da pasta extraída, incluindo `docs/`, e não somente o ZIP. Preserve os arquivos ocultos `.gitignore`, `.gitattributes` e `.nojekyll`; dependendo do sistema, eles podem não aparecer na seleção comum de arquivos.

Depois de enviar, verifique se o GitHub apresenta o README e a imagem corretamente e se `index.html` está na raiz.

## Disponibilizar a aplicação com GitHub Pages

O aplicativo é estático. Para publicar a partir da raiz da branch:

1. Abra **Settings → Pages** no repositório.
2. Em **Build and deployment → Source**, selecione **Deploy from a branch**.
3. Selecione a branch **main** e a pasta **/(root)**; salve.
4. Aguarde a publicação e use o endereço exibido pelo GitHub.

Essas opções seguem o [guia oficial do GitHub Pages](https://docs.github.com/en/pages/quickstart). A disponibilidade depende da visibilidade do repositório e do plano da conta.

O arquivo `.nojekyll` está incluído para servir os arquivos estáticos diretamente. Nenhum fluxo de build personalizado é necessário.

Quando o endereço estiver disponível, adicione-o ao campo **Website** do repositório e, se quiser, ao topo do README. Não há um link de demonstração inventado no pacote: ele depende do seu usuário e do nome final do repositório.

## Conferência após publicar

- O README aparece e a imagem carrega.
- A página da demonstração abre com estilo, estrada e botões.
- “Gerar dados” habilita o treinamento.
- O treinamento com exemplos atualiza o gráfico e as épocas.
- A opção “Ver aprendizado na pista” alterna entre prévias visuais e processamento rápido.
- O método “Enquanto dirige” mostra ajustes reais e conta rodadas separadamente.
- Interromper e retomar preserva uma execução parcial na página.
- As métricas e o placar distinguem as larguras Escola e Precisão.
- O piloto usa o modelo treinado.
- Salvar e carregar um modelo preserva seu comportamento.
- A seção de autoria continua visível.

## O que não precisa ser publicado

Não envie o ZIP dentro do próprio repositório, arquivos de configuração pessoais ou modelos baixados durante experimentos, a menos que queira publicá-los deliberadamente como resultados adicionais. O `.gitignore` ignora os nomes padrão de downloads para manter a árvore organizada; o `modelo-exemplo.json` continua incluído.

## Manutenção

Se modificar as observações, a arquitetura, a ativação ou a física, revise a compatibilidade do formato do modelo, gere um novo modelo de exemplo e atualize as explicações. Se mudar treinamento ou avaliação, rode os testes e não mantenha no README resultados antigos como se fossem da nova implementação.

Se alterar apenas textos, preserve a correspondência entre os rótulos dos botões na interface e as instruções do guia.

## Atualização de um repositório existente

Substitua os arquivos da versão anterior pelo conteúdo deste pacote na raiz do repositório. Inclua os novos `test-interface.js` e `CHANGELOG.md` e a documentação atualizada. O HTML, o motor e a interface devem ser enviados juntos. Rode `npm test` e faça um commit da atualização. Os modelos antigos continuam aceitos, embora não contenham o total histórico de ajustes.
