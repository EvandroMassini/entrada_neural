/*
 * Estrada Neural — motor matemático, sem bibliotecas externas.
 * Código criado integralmente pelo assistente de IA da OpenAI (Codex).
 * Leia README.md para uma explicação desde os conceitos mais básicos.
 *
 * Este arquivo funciona no navegador (window.Lab) e no Node (module.exports).
 * Os nomes curtos x, y, w e b representam entrada, alvo, peso e viés.
 */
(function (root) {
  'use strict';

  // Limita um número a um intervalo. Por padrão: de -1 a +1.
  const clamp = (x, a = -1, b = 1) => Math.max(a, Math.min(b, x));

  // Gerador pseudoaleatório determinístico: a mesma semente repete a sequência.
  // Ele torna os experimentos reproduzíveis; não é usado para segurança.
  function rng(seed) {
    return () => {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // Devolve uma função: ao informar a distância s, ela dá o centro da pista.
  function road(seed) {
    const r = rng(seed);
    const p = r() * 6;
    const q = r() * 6;
    return s => 180 + 72 * Math.sin(s / 210 + p) + 35 * Math.sin(s / 95 + q);
  }

  const config = {
    inputs: [
      'desvio / 60',
      'velocidade lateral / 3',
      'curva +30 / 60',
      'curva +70 / 60',
      'curva +120 / 60'
    ],
    architecture: [5, 12, 8, 1],
    halfWidth: 60,
    speed: 2.5
  };

  // A largura altera a tarefa, mas não a ordem ou a escala das observações.
  const profiles = {
    school: { name: 'Escola · largura 120', halfWidth: 60 },
    precision: { name: 'Precisão · largura 80', halfWidth: 40 }
  };

  // Converte a situação do carro em cinco números de escala comparável.
  // As observações vêm da geometria do simulador, não de uma câmera.
  function observe(c, track) {
    const center = track(c.s);
    return [
      (c.x - center) / 60,
      c.v / 3,
      ...[30, 70, 120].map(d => (track(c.s + d) - center) / 60)
    ].map(x => clamp(x, -2, 2));
  }

  // Professor programado: corrige o desvio, freia o movimento lateral e
  // antecipa a curva próxima. Ele cria alvos; não dirige durante a inferência.
  function teacher(x) {
    return clamp(-1.5 * x[0] - 1.5 * x[1] + 1.8 * x[2]);
  }

  function start(track) {
    return {
      s: 0, x: track(0), v: 0, alive: true, done: false,
      metrics: { steps: 0, deviationSum: 0, maxDeviation: 0, steeringSum: 0, previous: null }
    };
  }

  // Física simplificada: avanço fixo, inércia lateral e comando do volante.
  function step(c, u, track, profile = profiles.school) {
    if (!c.alive || c.done) return;
    c.v = clamp(0.88 * c.v + 0.38 * clamp(u), -3, 3);
    c.x += c.v;
    c.s += 2.5;
    const deviation = Math.abs(c.x - track(c.s));
    c.alive = deviation < profile.halfWidth - 9;
    c.done = c.alive && c.s >= 2400;
    c.metrics.steps++;
    c.metrics.deviationSum += deviation;
    c.metrics.maxDeviation = Math.max(c.metrics.maxDeviation, deviation);
    if (c.metrics.previous !== null) c.metrics.steeringSum += Math.abs(u - c.metrics.previous);
    c.metrics.previous = u;
  }

  function drivingMetrics(c) {
    const m = c.metrics;
    return {
      meanDeviation: m.deviationSum / Math.max(1, m.steps),
      maxDeviation: m.maxDeviation,
      steeringVariation: m.steeringSum / Math.max(1, m.steps - 1)
    };
  }

  // Mesma ordem para treinamento rápido, visual e retomado após uma pausa.
  function shuffledOrder(size, seed) {
    const r = rng(seed);
    const order = Array.from({ length: size }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }

  class Network {
    constructor(seed = 42) {
      const r = rng(seed);
      this.sizes = [5, 12, 8, 1];

      // weights[camada][neurônio de destino][entrada desse neurônio].
      // Pesos começam aleatórios; vieses começam em zero.
      this.weights = this.sizes.slice(1).map((n, l) =>
        Array.from({ length: n }, () =>
          Array.from({ length: this.sizes[l] }, () =>
            (r() * 2 - 1) * Math.sqrt(6 / (this.sizes[l] + n))
          )
        )
      );
      this.biases = this.sizes.slice(1).map(n => Array(n).fill(0));
      this.epochs = 0;
      this.rounds = 0;
      this.updates = 0;
    }

    // Passagem para a frente. Guarda todas as ativações para a retropropagação.
    forward(x) {
      const a = [x.slice()];
      for (let l = 0; l < this.weights.length; l++) {
        a.push(this.weights[l].map((row, j) =>
          Math.tanh(row.reduce(
            (v, w, k) => v + w * a[l][k],
            this.biases[l][j]
          ))
        ));
      }
      return a;
    }

    // Inferência: retorna só o comando final. Nenhum peso é alterado aqui.
    predict(x) {
      return this.forward(x).at(-1)[0];
    }

    // Derivadas da perda L = 0.5 * (previsão - alvo)².
    // A derivada de tanh(z) é 1 - tanh(z)².
    gradients(x, y) {
      const a = this.forward(x);
      const d = Array(3);

      // Primeiro calculamos a sensibilidade do neurônio de saída.
      d[2] = [(a[3][0] - y) * (1 - a[3][0] ** 2)];

      // Depois voltamos da saída para as camadas ocultas: regra da cadeia.
      for (let l = 1; l >= 0; l--) {
        d[l] = a[l + 1].map((v, j) =>
          this.weights[l + 1].reduce(
            (s, row, k) => s + row[j] * d[l + 1][k],
            0
          ) * (1 - v * v)
        );
      }

      // Gradiente do peso = delta do destino × ativação da origem.
      // Gradiente do viés = delta do destino.
      return {
        w: d.map((v, l) => v.map(dj => a[l].map(ak => dj * ak))),
        b: d
      };
    }

    // Uma atualização real, com os valores antes/depois para a explicação visual.
    learn(x, y, rate = 0.025) {
      const before = this.predict(x);
      const g = this.gradients(x, y);
      for (let l = 0; l < 3; l++) {
        for (let j = 0; j < this.weights[l].length; j++) {
          this.biases[l][j] -= rate * g.b[l][j];
          for (let k = 0; k < this.weights[l][j].length; k++) {
            this.weights[l][j][k] -= rate * g.w[l][j][k];
          }
        }
      }
      if (this.updates !== null) this.updates++;
      return { x: x.slice(), target: y, before, after: this.predict(x) };
    }

    createEpoch(data, rate = 0.025, seed = 1) {
      if (!data.length) throw Error('Gere exemplos antes de treinar.');
      const order = shuffledOrder(data.length, seed);
      const net = this;
      return {
        kind: 'dataset', processed: 0, total: data.length, done: false, last: null,
        advance(limit = 25) {
          if (!Number.isInteger(limit) || limit < 1) throw Error('Bloco inválido.');
          for (let i = 0; i < limit && !this.done; i++) {
            const row = data[order[this.processed]];
            this.last = net.learn(row.x, row.y, rate);
            this.processed++;
            if (this.processed === this.total) {
              this.done = true;
              net.epochs++;
            }
          }
        }
      };
    }

    // Atalho síncrono para testes. Usa exatamente as mesmas atualizações da UI.
    trainEpoch(data, rate = 0.025, seed = 1) {
      const epoch = this.createEpoch(data, rate, seed);
      epoch.advance(data.length);
    }

    // Métrica do gráfico: média dos erros ao quadrado (sem o fator 0.5).
    loss(data) {
      return data.reduce((s, { x, y }) => s + (this.predict(x) - y) ** 2, 0)
        / data.length;
    }

    // Cria o objeto que a interface transforma em arquivo JSON.
    export() {
      return {
        format: 'estrada-neural-v1',
        architecture: this.sizes,
        activation: 'tanh',
        normalization: config.inputs,
        physics: { speed: 2.5, drag: 0.88, force: 0.38 },
        epochs: this.epochs,
        rounds: this.rounds,
        updates: this.updates,
        weights: this.weights,
        biases: this.biases
      };
    }

    // Verifica a compatibilidade antes de restaurar os parâmetros do arquivo.
    static from(o) {
      const n = new Network();
      if (
        o.format !== 'estrada-neural-v1' ||
        JSON.stringify(o.architecture) !== JSON.stringify(n.sizes) ||
        o.activation !== 'tanh' ||
        JSON.stringify(o.normalization) !== JSON.stringify(config.inputs) ||
        JSON.stringify(o.physics) !== JSON.stringify({ speed: 2.5, drag: 0.88, force: 0.38 })
      ) {
        throw Error('Formato ou configuração incompatível.');
      }

      for (let l = 0; l < 3; l++) {
        if (
          !Array.isArray(o.weights?.[l]) || o.weights[l].length !== n.sizes[l + 1] ||
          !Array.isArray(o.biases?.[l]) || o.biases[l].length !== n.sizes[l + 1]
        ) {
          throw Error('Dimensões inválidas.');
        }
        for (const row of o.weights[l]) {
          if (
            !Array.isArray(row) || row.length !== n.sizes[l] ||
            !row.every(v => Number.isFinite(v) && Math.abs(v) < 100)
          ) {
            throw Error('Pesos inválidos.');
          }
        }
        if (!o.biases[l].every(v => Number.isFinite(v) && Math.abs(v) < 100)) {
          throw Error('Vieses inválidos.');
        }
      }
      if (!Number.isInteger(o.epochs) || o.epochs < 0) {
        throw Error('Épocas inválidas.');
      }

      // Copiamos os valores, evitando compartilhar os arrays com o objeto lido.
      n.weights = o.weights.map(layer => layer.map(row => row.slice()));
      n.biases = o.biases.map(row => row.slice());
      n.epochs = o.epochs;
      if (o.rounds !== undefined && (!Number.isSafeInteger(o.rounds) || o.rounds < 0)) {
        throw Error('Rodadas inválidas.');
      }
      if (o.updates !== undefined && o.updates !== null &&
          (!Number.isSafeInteger(o.updates) || o.updates < 0)) {
        throw Error('Contagem de ajustes inválida.');
      }
      n.rounds = o.rounds ?? 0;
      // Modelos antigos não guardavam a contagem; não inventamos esse número.
      n.updates = o.updates ?? null;
      return n;
    }
  }

  // Sorteia estados, mesmo os que não surgiriam em uma direção perfeita.
  // Cada estado recebe um alvo do professor. A semente de estados e a base
  // das pistas são separadas para preservar a separação treino/validação.
  function generate(seed = 7, count = 2400, roadBase = 7) {
    const r = rng(seed);
    const data = [];
    for (let i = 0; i < count; i++) {
      const track = road(roadBase + Math.floor(i / 80));
      const c = { s: r() * 2400, v: (r() * 2 - 1) * 2.5 };
      c.x = track(c.s) + (r() * 2 - 1) * 48;
      const x = observe(c, track);
      data.push({ x, y: teacher(x) });
    }
    return data;
  }

  // Avaliação fechada: a rede toma todas as decisões até sair ou chegar.
  function evaluate(net, seeds = Array.from({ length: 20 }, (_, i) => 900 + i), profile = profiles.school) {
    return seeds.map(seed => {
      const t = road(seed);
      const c = start(t);
      while (c.alive && !c.done) {
        step(c, net.predict(observe(c, t)), t, profile);
      }
      return { seed, success: c.done, distance: c.s, ...drivingMetrics(c) };
    });
  }

  // Retroalimentação: o professor rotula os estados que a rede visita.
  // Esta função coleta dados. Só trainEpoch() modifica pesos e vieses.
  function feedback(net, profile = profiles.school) {
    const data = [];
    for (let seed = 400; seed < 412; seed++) {
      const t = road(seed);
      const c = start(t);
      for (let i = 0; i < 960; i++) {
        const x = observe(c, t);
        data.push({ x, y: teacher(x) });
        step(c, net.predict(x), t, profile);
        if (!c.alive || c.done) break;
      }
    }
    return data;
  }

  // Uma rodada de aprendizado online contém 12 tentativas. A rede age com a
  // previsão ANTERIOR ao ajuste; o professor só fornece o alvo de treinamento.
  // A animação e o modo rápido chamam esta mesma máquina de estados.
  function createRound(net, rate = 0.025, profile = profiles.school) {
    const roundIndex = net.rounds;
    return {
      kind: 'trajectory', processed: 0, episode: 0, completed: 0,
      arrivals: 0, done: false, car: null, track: null, seed: null, last: null,
      advance(limit = 1) {
        if (!Number.isInteger(limit) || limit < 1) throw Error('Bloco inválido.');
        for (let i = 0; i < limit && !this.done; i++) {
          if (!this.car || !this.car.alive || this.car.done) {
            this.seed = 7 + (roundIndex * 12 + this.episode) % 30;
            this.track = road(this.seed);
            this.car = start(this.track);
            this.episode++;
          }
          const x = observe(this.car, this.track);
          this.last = net.learn(x, teacher(x), rate);
          step(this.car, this.last.before, this.track, profile);
          this.processed++;
          if (!this.car.alive || this.car.done) {
            this.completed++;
            if (this.car.done) this.arrivals++;
            if (this.completed === 12) {
              this.done = true;
              net.rounds++;
            }
            // Expõe o estado terminal antes de iniciar a próxima tentativa.
            break;
          }
        }
      }
    };
  }

  const api = {
    Network, generate, evaluate, feedback, road, start,
    step, observe, teacher, config, rng, profiles, drivingMetrics, createRound
  };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Lab = api;
})(globalThis);
