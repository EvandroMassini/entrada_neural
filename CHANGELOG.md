# Histórico de mudanças

## 2.0.0

- Opção para acompanhar o aprendizado na pista ou executar o mesmo treinamento sem animação.
- Prévias com pesos congelados nos primeiros 25, 50, 100, 200, 400, 800 e 1.600 ajustes da primeira época de cada execução, além dos finais de época.
- Método de treinamento durante trajetórias: o professor fornece alvos e a rede executa suas próprias decisões.
- Separação explícita entre épocas, rodadas e número de ajustes.
- Desafio Precisão, com largura 80, além do cenário Escola original, com largura 120.
- Indicadores de desvio médio, maior desvio e variação média do volante.
- Exibição da previsão antes do ajuste, alvo e previsão depois do ajuste para a mesma entrada.
- Interrupção e retomada de épocas/rodadas parciais na memória da página.
- JSON com metadados opcionais de rodadas e ajustes; modelos antigos continuam compatíveis.
- Testes de equivalência entre execução visual/rápida, retomada, controle online, métricas e compatibilidade.
- README revisado com cada controle, experimentos guiados, resultados reais e limitações.

As dificuldades adicionais não forçam colisões nem atrasam o aprendizado artificialmente. A animação só controla a exibição; o método de treinamento e a largura da pista podem alterar os resultados.

## 1.0.0

Implementação inicial: rede 5 → 12 → 8 → 1, dados sintéticos, retropropagação manual, coleta de feedback, avaliação e exportação/importação JSON, sem bibliotecas externas.
