/*
 * Execute: node test.js (ou npm test).
 * Usa apenas módulos nativos do Node, sem instalar bibliotecas.
 * Recria modelo-exemplo.json e resultados-testes.json.
 * Código criado pelo Codex, assistente de IA da OpenAI.
 */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

// Carrega o mesmo motor utilizado pela interface em um contexto isolado.
const context = { module: { exports: {} } };
vm.runInNewContext(fs.readFileSync(__dirname + '/engine.js', 'utf8'), context);
const L = context.module.exports;

const net = new L.Network();
const train = L.generate();
const valid = L.generate(6000, 600, 6000);

// 1. Conferência numérica da retropropagação, parâmetro por parâmetro.
// f'(p) ≈ [f(p + epsilon) - f(p - epsilon)] / (2 * epsilon).
let maxError = 0;
const x = train[0].x;
const y = train[0].y;
const g = net.gradients(x, y);
const epsilon = 1e-5;

for (let l = 0; l < 3; l++) {
  for (let j = 0; j < net.weights[l].length; j++) {
    // k = -1 representa o viés; os demais índices representam os pesos.
    for (let k = -1; k < net.weights[l][j].length; k++) {
      const array = k < 0 ? net.biases[l] : net.weights[l][j];
      const index = k < 0 ? j : k;
      const old = array[index];

      array[index] = old + epsilon;
      const plus = 0.5 * (net.predict(x) - y) ** 2;
      array[index] = old - epsilon;
      const minus = 0.5 * (net.predict(x) - y) ** 2;
      array[index] = old;

      const numerical = (plus - minus) / (2 * epsilon);
      const analytical = k < 0 ? g.b[l][j] : g.w[l][j][k];
      maxError = Math.max(maxError, Math.abs(numerical - analytical));
    }
  }
}
assert(maxError < 1e-7, 'Gradientes incorretos');

// 2. Aprendizado e conclusão das pistas em uma configuração reproduzível.
const before = net.loss(valid);
const initial = L.evaluate(net).filter(r => r.success).length;
const learningCurve = [];
function measure(model, label) {
  const snapshot = JSON.stringify(model.export());
  const row = { label, updates: model.updates, validationMSE: model.loss(valid) };
  for (const name of ['school', 'precision']) {
    const tracks = L.evaluate(model, undefined, L.profiles[name]);
    row[name] = {
      arrivals: tracks.filter(r => r.success).length,
      meanDistance: tracks.reduce((s, r) => s + r.distance, 0) / 20,
      meanDeviation: tracks.reduce((s, r) => s + r.meanDeviation, 0) / 20,
      maxDeviation: Math.max(...tracks.map(r => r.maxDeviation)),
      steeringVariation: tracks.reduce((s, r) => s + r.steeringVariation, 0) / 20
    };
  }
  assert.strictEqual(JSON.stringify(model.export()), snapshot, 'Avaliação alterou o modelo');
  return row;
}
learningCurve.push(measure(net, 'Inicial'));
const firstEpoch = net.createEpoch(train, 0.025, 10);
for (const checkpoint of [25, 50, 100, 200, 400, 800, 1600, 2400]) {
  firstEpoch.advance(checkpoint - firstEpoch.processed);
  learningCurve.push(measure(net, checkpoint === 2400 ? '1 época' : `${checkpoint} ajustes`));
}
for (let i = 1; i < 30; i++) {
  net.trainEpoch(train, 0.025, i + 10);
  if ([2, 3, 30].includes(net.epochs)) learningCurve.push(measure(net, `${net.epochs} épocas`));
}
const after = net.loss(valid);
const success = L.evaluate(net).filter(r => r.success).length;
assert(after < before * 0.1, 'O erro de validação não caiu o suficiente');
assert(success >= 18, 'O piloto concluiu menos de 18 pistas');

// 3. Persistência: o arquivo deve reproduzir exatamente as mesmas previsões.
fs.writeFileSync(__dirname + '/modelo-exemplo.json', JSON.stringify(net.export(), null, 2));
const restored = L.Network.from(JSON.parse(
  fs.readFileSync(__dirname + '/modelo-exemplo.json', 'utf8')
));
for (const row of valid) {
  assert.strictEqual(restored.predict(row.x), net.predict(row.x));
}

// 4. Uma entrada de parâmetro inválida deve ser recusada.
const bad = JSON.parse(JSON.stringify(net.export()));
bad.weights[0][0][0] = null;
assert.throws(() => L.Network.from(bad));

// 5. Feedback fornece alvos corretos e pode ser usado em novo treinamento.
const correction = L.feedback(net);
assert(correction.length > 0 && correction.every(r => r.y === L.teacher(r.x)));
net.trainEpoch(train.concat(correction), 0.025, 50);
assert(Number.isFinite(net.loss(valid)));

// 6. Dividir a época em blocos/pausar não muda nenhuma atualização.
const whole = new L.Network(), chunked = new L.Network();
whole.trainEpoch(train, .025, 10);
const partial = chunked.createEpoch(train, .025, 10);
partial.advance(25);
assert.strictEqual(chunked.epochs, 0);
assert.strictEqual(chunked.updates, 25);
const paused = JSON.stringify(chunked.export());
L.evaluate(chunked);
assert.strictEqual(JSON.stringify(chunked.export()), paused);
while (!partial.done) partial.advance(37);
assert.strictEqual(JSON.stringify(chunked.export()), JSON.stringify(whole.export()));
partial.advance(20);
assert.strictEqual(chunked.epochs, 1, 'Época contada duas vezes');
assert.strictEqual(chunked.updates, 2400);

// 7. Uma rodada é idêntica com decisões individuais ou blocos rápidos.
const live = new L.Network(), fast = new L.Network();
const liveRound = L.createRound(live, .025, L.profiles.precision);
const fastRound = L.createRound(fast, .025, L.profiles.precision);
liveRound.advance(1);
const observed = L.observe(L.start(liveRound.track), liveRound.track);
assert.strictEqual(liveRound.last.before, new L.Network().predict(observed));
assert.strictEqual(liveRound.car.v, .38 * liveRound.last.before, 'Professor dirigiu no lugar da rede');
while (!liveRound.done) liveRound.advance(1);
while (!fastRound.done) fastRound.advance(37);
assert.strictEqual(JSON.stringify(live.export()), JSON.stringify(fast.export()));
assert.strictEqual(live.rounds, 1);
assert.strictEqual(live.epochs, 0);
assert.strictEqual(liveRound.completed, 12);
const onlineResult = measure(live, '1 rodada online');

// 8. A pista estreita continua solucionável pelo professor.
const teacherResult = L.evaluate({ predict: L.teacher }, undefined, L.profiles.precision);
assert.strictEqual(teacherResult.filter(r => r.success).length, 20);

// 9. Compatibilidade com modelos antigos, que não guardavam contadores novos.
const legacy = whole.export(); delete legacy.updates; delete legacy.rounds;
const legacyNetwork = L.Network.from(legacy);
assert.strictEqual(legacyNetwork.updates, null);
assert.strictEqual(legacyNetwork.predict(x), whole.predict(x));
const malformed = whole.export(); malformed.updates = -1;
assert.throws(() => L.Network.from(malformed));

// 10. Métricas verificadas em um pequeno exemplo calculável à mão.
const straight = () => 0, car = L.start(straight);
L.step(car, 1, straight); L.step(car, 0, straight);
const metrics = L.drivingMetrics(car);
assert(Math.abs(metrics.meanDeviation - (.38 + .7144) / 2) < 1e-12);
assert(Math.abs(metrics.maxDeviation - .7144) < 1e-12);
assert.strictEqual(metrics.steeringVariation, 1);

const report = {
  gradientMaxAbsoluteError: maxError,
  validationBefore: before,
  validationAfter: after,
  initialArrivals: initial,
  trainedArrivals: success,
  testTracks: 20,
  feedbackSamples: correction.length,
  modelRoundTrip: 'identical predictions on 600 samples',
  invalidModel: 'rejected',
  datasetChunkEquivalence: 'exact',
  trajectoryChunkEquivalence: 'exact',
  legacyModels: 'supported',
  teacherPrecisionArrivals: 20,
  learningCurve,
  onlineResult
};
fs.writeFileSync(__dirname + '/resultados-testes.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
