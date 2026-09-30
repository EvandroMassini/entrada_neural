/* Testes da coordenação da interface, sem navegador ou bibliotecas externas.
 * O DOM e o relógio são simulados; não substitui a inspeção visual no navegador.
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

function app() {
  const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], {
    textContent: '', innerHTML: '', value: '', disabled: false, hidden: false,
    getContext: () => new Proxy({}, { get: () => () => {} })
  }]));
  Object.assign(elements.seed, { value: '7' });
  Object.assign(elements.epochs, { value: '1' });
  Object.assign(elements.rate, { value: '.025' });
  Object.assign(elements.speed, { value: '8' });
  Object.assign(elements.method, { value: 'dataset' });
  Object.assign(elements.profile, { value: 'precision' });
  Object.assign(elements.watch, { checked: false });
  let now = 0, frames = [], timers = [], downloaded = null;
  const sandbox = {
    console,
    document: {
      getElementById: id => { assert(elements[id], `ID ausente no HTML: ${id}`); return elements[id]; },
      createElement: () => ({ click() {} })
    },
    // Un callback RAF pode ter timestamp anterior à leitura de performance.now
    // feita na mesma composição de quadro. A UI deve ignorar esse delta negativo.
    performance: { now: () => now + 30 },
    requestAnimationFrame: callback => frames.push(callback),
    setTimeout: callback => timers.push(callback),
    Blob: class { constructor(parts) { this.text = parts.join(''); } },
    URL: { createObjectURL: blob => { downloaded = JSON.parse(blob.text); return 'blob:test'; }, revokeObjectURL() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/engine.js', 'utf8'), sandbox);
  vm.runInContext(fs.readFileSync(__dirname + '/app.js', 'utf8'), sandbox);
  return {
    elements,
    model() { elements.export.onclick(); return downloaded; },
    async execute(promise, hook = () => {}) {
      let done = false, failure;
      promise.then(() => { done = true; }, error => { done = true; failure = error; });
      let ticks = 0;
      while (!done && ticks < 50000) {
        hook(elements, ticks);
        const batch = [...timers, ...frames]; timers = []; frames = []; now += 16;
        for (const callback of batch) callback(now);
        await Promise.resolve(); await Promise.resolve();
        ticks++;
      }
      assert(done, 'A interface não concluiu a operação');
      if (failure) throw failure;
      assert(!elements.status.textContent.includes('não concluído'), elements.status.textContent);
    }
  };
}

async function main() {
  const fast = app(), visible = app();
  fast.elements.generate.onclick(); visible.elements.generate.onclick();
  visible.elements.watch.checked = true;
  let sawPreview = false;
  await fast.execute(fast.elements.train.onclick());
  await visible.execute(visible.elements.train.onclick(), e => {
    if (e.sceneMode.textContent.includes('CONGELADOS')) sawPreview = true;
  });
  assert(sawPreview, 'O modo visual não exibiu prévias');
  assert.deepStrictEqual(visible.model(), fast.model(), 'Animação alterou treinamento por exemplos');
  assert.strictEqual(fast.model().updates, 2400);
  fast.elements.benchmark.onclick();
  assert.strictEqual(fast.elements.score.textContent, '14 / 20');

  const paused = app(); paused.elements.generate.onclick();
  let requested = false;
  await paused.execute(paused.elements.train.onclick(), e => {
    if (!requested && Number(e.updateMetric.textContent.replace(/\D/g, '')) >= 50) {
      e.stop.onclick(); requested = true;
    }
  });
  assert(requested && paused.model().updates < 2400);
  assert(paused.elements.train.textContent.includes('Retomar'));
  await paused.execute(paused.elements.train.onclick());
  assert.deepStrictEqual(paused.model(), fast.model(), 'Retomada pulou ou duplicou exemplos');

  const switched = app(); switched.elements.generate.onclick(); switched.elements.watch.checked = true;
  let toggled = false;
  await switched.execute(switched.elements.train.onclick(), e => {
    if (!toggled && Number(e.updateMetric.textContent.replace(/\D/g, '')) >= 25) {
      e.watch.checked = false; toggled = true;
    }
  });
  assert(toggled); assert.deepStrictEqual(switched.model(), fast.model());

  const onlineFast = app(), onlineVisual = app();
  for (const instance of [onlineFast, onlineVisual]) {
    instance.elements.method.value = 'trajectory'; instance.elements.method.onchange();
    assert.strictEqual(instance.elements.train.disabled, false);
  }
  onlineVisual.elements.watch.checked = true;
  let sawOnline = false;
  await onlineFast.execute(onlineFast.elements.train.onclick());
  await onlineVisual.execute(onlineVisual.elements.train.onclick(), e => {
    if (e.sceneMode.textContent.includes('SENDO AJUSTADOS')) sawOnline = true;
  });
  assert(sawOnline);
  assert.deepStrictEqual(onlineFast.model(), onlineVisual.model(), 'Animação alterou trajetórias');
  assert.strictEqual(onlineFast.model().rounds, 1);
  assert.strictEqual(onlineFast.model().epochs, 0);

  const restored = app();
  await restored.execute(restored.elements.import.onchange({ target: {
    files: [{ size: 5000, text: async () => JSON.stringify(fast.model()) }], value: 'model.json'
  } }));
  assert.deepStrictEqual(restored.model(), fast.model());
  assert(restored.elements.status.textContent.includes('carregado'));
  const saved = restored.model();
  await restored.execute(restored.elements.import.onchange({ target: {
    files: [{ size: 1, text: async () => '{}' }], value: 'invalid.json'
  } }));
  assert.deepStrictEqual(restored.model(), saved, 'Arquivo inválido substituiu o modelo');
  assert(restored.elements.status.textContent.includes('Não foi possível'));
  console.log('Interface: prévias, modo rápido, trajetórias, interrupção/retomada, troca visual e importação verificados.');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
