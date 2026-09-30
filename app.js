'use strict';
// Interface escrita em JavaScript puro. O motor não depende da animação.
const $ = id => document.getElementById(id);
const { Network, generate, evaluate, feedback, road, start, step, observe,
  profiles, drivingMetrics, createRound } = Lab;
let net = new Network(), initial = new Network();
let data = [], validation = generate(6000, 600, 6000), history = [];
let training = false, loading = false, running = false, stopRequested = false;
let pending = null, graphUpdates = 0, latest = null;
let profile = profiles.precision, testSeed = 901, pista = testSeed;
let track = road(pista), car = start(track), ghost = start(track);
let lastInput = observe(car, track), command = 0, showGhost = true, sceneKind = 'test';
const status = message => { $('status').textContent = message; };
const yieldBrowser = () => new Promise(resolve => setTimeout(resolve, 0));
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const visual = () => $('watch').checked && !stopRequested;

function save(name, object) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(object, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function refresh() {
  const locked = training || loading;
  for (const id of ['generate', 'feedback', 'reset', 'import', 'method', 'profile',
    'seed', 'epochs', 'rate', 'run', 'newRoad', 'benchmark']) $(id).disabled = locked;
  $('train').disabled = locked || ($('method').value === 'dataset' && !data.length);
  $('train').textContent = pending && !pending.done ? '2. Retomar treinamento' : '2. Treinar a rede';
  $('stop').hidden = !training;
  $('dataExport').disabled = !data.length;
  $('epochMetric').textContent = `${net.epochs} / ${net.rounds}`;
  $('updateMetric').textContent = net.updates === null ? 'Legado' : net.updates.toLocaleString('pt-BR');
  $('countLabel').textContent = $('method').value === 'dataset' ? 'Épocas' : 'Rodadas (12 tentativas)';
  $('methodInfo').textContent = $('method').value === 'dataset'
    ? 'Uma época percorre todos os exemplos. As prévias usam pesos congelados entre grupos de ajustes.'
    : 'A cada decisão, a rede recebe uma correção e ajusta os pesos. Dispensa “Gerar dados”. Uma rodada tem 12 tentativas.';
  $('dataInfo').textContent = data.length
    ? `${data.length.toLocaleString('pt-BR')} exemplos + 600 de validação separada.`
    : 'Crie 2.400 situações para o método com exemplos. Trajetórias dispensam esses dados.';
  $('samples').innerHTML = data.slice(0, 8).map(row => '<tr>' + [...row.x, row.y]
    .map(value => `<td>${value.toFixed(3)}</td>`).join('') + '</tr>').join('');
}

function invalidateEvaluation() {
  $('score').textContent = '—';
  $('assessment').textContent = 'Avalie 20 pistas para medir este modelo no desafio selecionado.';
}

function clearHistory() {
  history = []; graphUpdates = 0; latest = null;
  $('before').textContent = $('target').textContent = $('after').textContent = '—';
  $('sampleInfo').textContent = 'O alvo orienta o ajuste, mas não é aplicado diretamente ao volante.';
  $('progress').value = 0;
  $('progressInfo').textContent = 'Uma época contém milhares de ajustes; uma rodada contém 12 tentativas.';
  drawChart();
}

function resetScene() {
  pista = testSeed; track = road(pista); car = start(track); ghost = start(track);
  showGhost = true; sceneKind = 'test'; command = 0; lastInput = observe(car, track);
  $('sceneMode').textContent = 'TESTE · SEM ALTERAR PESOS';
  $('phaseInfo').textContent = `${profile.name}. O modelo decide sozinho; testar não realiza treinamento.`;
  $('ghostLegend').hidden = false;
  $('run').textContent = '▶ Testar piloto';
  draw();
}

function showSample(sample) {
  if (!sample) return;
  latest = sample;
  $('before').textContent = sample.before.toFixed(4);
  $('target').textContent = sample.target.toFixed(4);
  $('after').textContent = sample.after.toFixed(4);
  $('sampleInfo').textContent = `Mesmas 5 entradas, antes/depois do ajuste. Erro absoluto: ${Math.abs(sample.before - sample.target).toFixed(4)} → ${Math.abs(sample.after - sample.target).toFixed(4)}. A prévia da pista pode mostrar outra situação.`;
}

function record() {
  if (history.length && history.at(-1).updates === graphUpdates) return history.at(-1);
  const point = { updates: graphUpdates, train: data.length ? net.loss(data) : null,
    val: net.loss(validation), preview: null };
  history.push(point); drawChart(); return point;
}

// Pausa entre duas atualizações: nenhuma chamada a learn() ocorre na prévia.
// Usa sempre a pista 7, conhecida do conjunto de treino, para não avaliar na prova.
async function preview(point) {
  if (!visual()) return;
  pista = 7; track = road(pista); car = start(track); ghost = start(track);
  showGhost = true; sceneKind = 'checkpoint'; command = 0;
  lastInput = observe(car, track);
  $('ghostLegend').hidden = false;
  $('sceneMode').textContent = 'PRÉVIA · PESOS CONGELADOS';
  $('phaseInfo').textContent = `${point.updates.toLocaleString('pt-BR')} ajustes neste gráfico. Nenhum peso muda durante este percurso. A atualização retoma após a prévia.`;
  draw();
  let previous = await nextFrame(), clock = 0;
  while (visual() && car.alive && !car.done) {
    const now = await nextFrame();
    clock += Math.max(0, Math.min(100, now - previous)) * Number($('speed').value); previous = now;
    while (clock >= 1000 / 60 && car.alive && !car.done) {
      clock -= 1000 / 60;
      lastInput = observe(car, track); command = net.predict(lastInput);
      step(car, command, track, profile);
      step(ghost, initial.predict(observe(ghost, track)), track, profile);
    }
    draw();
  }
  point.preview = car.done ? '100% · chegou' : !car.alive ? `${(car.s / 24).toFixed(0)}% · saiu` : 'interrompida';
  drawChart();
}

function showRound(task) {
  if (!task.car) return;
  pista = task.seed; track = task.track; car = task.car;
  showGhost = false; sceneKind = 'trajectory';
  command = task.last.before; lastInput = task.last.x;
  $('ghostLegend').hidden = true;
  $('sceneMode').textContent = 'TREINANDO · PESOS SENDO AJUSTADOS';
  $('phaseInfo').textContent = `Tentativa ${task.episode}/12 · ${task.arrivals} chegadas nesta rodada. Volante da rede antes do ajuste; professor fornece apenas o alvo.`;
  draw();
}

async function terminalHold() {
  const until = performance.now() + 250;
  while (visual() && performance.now() < until) await nextFrame();
}

$('train').onclick = async () => {
  if (training || loading) return;
  const count = Number($('epochs').value), rate = Number($('rate').value);
  if (!Number.isInteger(count) || count < 1 || count > 200 || !Number.isFinite(rate) || rate < .001 || rate > .1) {
    return status('Use 1–200 épocas/rodadas e taxa de 0.001 a 0.1.');
  }
  if ($('method').value === 'dataset' && !data.length) return status('Gere os dados primeiro.');
  training = true; running = false; stopRequested = false;
  $('run').textContent = '▶ Testar piloto';
  invalidateEvaluation(); refresh();
  let completed = 0;
  try {
    if (!history.length) record();
    if ($('method').value === 'dataset') await preview(record());
    while (completed < count && !stopRequested) {
      if (!pending || pending.done) pending = $('method').value === 'dataset'
        ? net.createEpoch(data, rate, net.epochs + 10)
        : createRound(net, rate, profile);
      const task = pending;
      let previous = performance.now(), clock = 0;
      while (!task.done && !stopRequested) {
        let size = 25;
        if (task.kind === 'trajectory' && visual()) {
          const now = await nextFrame();
          clock += Math.max(0, Math.min(100, now - previous)) * Number($('speed').value); previous = now;
          size = Math.floor(clock / (1000 / 60));
          clock -= size * (1000 / 60);
          if (size < 1) continue;
        } else {
          await yieldBrowser(); previous = performance.now(); clock = 0;
        }
        if (stopRequested) break;
        if (!$('watch').checked) {
          $('sceneMode').textContent = 'TREINANDO · SEM ANIMAÇÃO';
          $('phaseInfo').textContent = 'Cena pausada. Os ajustes continuam no motor; marque “Ver aprendizado na pista” para acompanhar.';
        }
        const before = task.processed;
        task.advance(size);
        graphUpdates += task.processed - before;
        showSample(task.last);
        $('epochMetric').textContent = `${net.epochs} / ${net.rounds}`;
        $('updateMetric').textContent = net.updates === null ? 'Legado' : net.updates.toLocaleString('pt-BR');
        $('progress').max = task.kind === 'dataset' ? task.total : 12;
        $('progress').value = task.kind === 'dataset' ? task.processed : task.completed;
        $('progressInfo').textContent = task.kind === 'dataset'
          ? `Época: ${task.processed}/${task.total} exemplos · ${completed}/${count} épocas concluídas nesta execução.`
          : `Rodada: ${task.completed}/12 tentativas concluídas · ${task.processed} ajustes · ${completed}/${count} rodadas concluídas nesta execução.`;
        status($('progressInfo').textContent);
        const milestone = task.kind === 'dataset'
          ? task.done || (completed === 0 && [25, 50, 100, 200, 400, 800, 1600].includes(task.processed))
          : task.done || Math.floor(before / 100) !== Math.floor(task.processed / 100);
        if (milestone) record();
        if (task.kind === 'dataset') {
          if (milestone) {
            lastInput = task.last.x; drawNetwork();
            if (visual()) await preview(record());
          }
        } else if (visual()) {
          showRound(task);
          if (!task.car.alive || task.car.done) { await terminalHold(); previous = performance.now(); }
        }
      }
      if (task.done) {
        completed++; pending = null;
        $('progressInfo').textContent = task.kind === 'dataset'
          ? `${task.total}/${task.total} exemplos · ${completed}/${count} épocas concluídas nesta execução.`
          : `12/12 tentativas · ${task.processed} ajustes · ${completed}/${count} rodadas concluídas nesta execução.`;
        if (task.kind === 'trajectory') showRound(task);
      }
    }
    record();
    status(stopRequested
      ? pending && !pending.done
        ? 'Treinamento interrompido. Ajustes preservados; “Retomar” continua do próximo exemplo ou decisão nesta página.'
        : 'Treinamento parado entre etapas. Ajustes preservados; o próximo treinamento iniciará uma nova época ou rodada.'
      : 'Treinamento concluído. Teste o modelo congelado em 20 pistas e salve o JSON. Chegar não significa dirigir sem desvios.');
  } catch (error) {
    status('Treinamento não concluído: ' + error.message);
  } finally {
    training = false; refresh();
    if (!$('watch').checked && sceneKind !== 'trajectory') resetScene();
    if (sceneKind === 'trajectory') {
      $('sceneMode').textContent = 'ÚLTIMA TRAJETÓRIA · TREINO PARADO';
      $('phaseInfo').textContent += ' Para uma avaliação com pesos fixos, use Testar piloto ou Avaliar 20 pistas.';
    }
    if (sceneKind === 'checkpoint') {
      $('sceneMode').textContent = 'ÚLTIMA PRÉVIA · TREINO PARADO';
      $('phaseInfo').textContent = 'Resultado da última prévia com pesos congelados na pista 7. O treino está parado; avalie em 20 pistas para medir a generalização.';
    }
    draw();
  }
};

$('stop').onclick = () => { stopRequested = true; };
$('generate').onclick = () => {
  const seed = Number($('seed').value);
  if (!Number.isInteger(seed) || seed < 1 || seed > 99999) return status('Semente: inteiro de 1 a 99999.');
  data = generate(seed); pending = null; clearHistory(); refresh();
  status('2.400 exemplos gerados. Os pesos foram mantidos; uma eventual época parcial foi descartada.');
};
$('method').onchange = () => {
  pending = null; clearHistory(); refresh();
  status('Método alterado. Pesos e dados mantidos; progresso parcial descartado.');
};
$('profile').onchange = () => {
  profile = profiles[$('profile').value]; pending = null; running = false;
  clearHistory(); invalidateEvaluation(); resetScene(); refresh();
  status('Largura alterada. Pesos mantidos; avalie novamente neste desafio.');
};
$('rate').onchange = () => {
  if (pending) { pending = null; refresh(); status('Taxa alterada. Pesos preservados; a próxima época/rodada começará do início.'); }
};
$('feedback').onclick = () => {
  running = false;
  const more = feedback(net, profile);
  data.push(...more); pending = null; clearHistory(); resetScene(); refresh();
  status(`${more.length} correções acrescentadas. Selecione “Com exemplos gerados” e treine para incorporá-las aos pesos.`);
};
$('export').onclick = () => save('modelo-estrada-neural.json', net.export());
$('dataExport').onclick = () => save('dados-estrada-neural.json', {
  format: 'estrada-dados-v1', inputs: Lab.config.inputs,
  target: 'volante [-1,1] do professor', training: data, validation
});
$('import').onchange = async event => {
  const file = event.target.files[0]; if (!file) return;
  loading = true; refresh();
  try {
    if (file.size > 1000000) throw Error('Arquivo maior que 1 MB.');
    const loaded = Network.from(JSON.parse(await file.text()));
    net = loaded; running = false; pending = null; clearHistory(); invalidateEvaluation(); resetScene();
    status('Modelo carregado. Pronto para dirigir sem treinamento; a largura selecionada foi mantida.');
  } catch (error) { status('Não foi possível carregar: ' + error.message); }
  finally { loading = false; event.target.value = ''; refresh(); }
};
$('reset').onclick = () => {
  net = new Network(); pending = null; running = false;
  clearHistory(); invalidateEvaluation(); resetScene(); refresh();
  status('Pesos e contadores reiniciados. Os exemplos continuam disponíveis.');
};
$('run').onclick = () => {
  if (sceneKind !== 'test' || !car.alive || car.done) resetScene();
  running = !running;
  $('run').textContent = running ? 'Ⅱ Pausar' : '▶ Testar piloto';
};
$('newRoad').onclick = () => { testSeed++; running = false; resetScene(); };
$('benchmark').onclick = () => {
  const result = evaluate(net, undefined, profile);
  const n = result.filter(row => row.success).length;
  const average = key => result.reduce((sum, row) => sum + row[key], 0) / result.length;
  $('score').textContent = `${n} / 20`;
  $('assessment').textContent = `${profile.name} · ${n}/20 chegadas · percurso médio ${(average('distance') / 24).toFixed(1)}% · desvio médio ${average('meanDeviation').toFixed(2)} · maior desvio ${Math.max(...result.map(row => row.maxDeviation)).toFixed(2)} · variação do volante ${average('steeringVariation').toFixed(4)}. Médias de trajetórias interrompidas não equivalem a percursos completos.`;
  status('Avaliação concluída com pesos fixos. Nenhum ajuste foi realizado.');
};

function updateDrivingMetrics() {
  const metrics = drivingMetrics(car);
  $('meanDeviation').textContent = metrics.meanDeviation.toFixed(2);
  $('maxDeviation').textContent = metrics.maxDeviation.toFixed(2);
  $('steeringVariation').textContent = metrics.steeringVariation.toFixed(3);
  $('roadLabel').textContent = `PISTA ${pista} · LARGURA ${profile.halfWidth * 2}`;
}

function drawChart() {
  const c = $('chart').getContext('2d');
  c.clearRect(0, 0, 560, 215); c.font = '11px monospace'; c.textAlign = 'left';
  const max = Math.max(.001, ...history.map(p => Math.max(p.train || 0, p.val)));
  for (let j = 0; j < 4; j++) {
    const y = 18 + j * 51; c.strokeStyle = '#2a3b4b'; c.beginPath();
    c.moveTo(56, y); c.lineTo(545, y); c.stroke(); c.fillStyle = '#9aaebf';
    c.fillText((max * (1 - j / 3)).toFixed(3), 0, y + 4);
  }
  const last = Math.max(1, history.at(-1)?.updates || 1);
  for (const [key, color] of [['train', '#5ee6ce'], ['val', '#ffd185']]) {
    c.beginPath(); let started = false;
    for (const p of history) {
      if (p[key] === null) continue;
      const x = 56 + p.updates / last * 489, y = 171 - p[key] / max * 153;
      if (started) c.lineTo(x, y); else c.moveTo(x, y);
      started = true;
    }
    c.strokeStyle = color; c.lineWidth = 2; c.stroke();
  }
  c.fillStyle = '#9aaebf'; c.fillText(`0 → ${history.at(-1)?.updates || 0} ajustes · escala linear`, 56, 202);
  const p = history.at(-1);
  $('lossInfo').textContent = p ? `Erro quadrático médio: ${p.train === null ? 'sem conjunto sorteado' : 'treino ' + p.train.toFixed(6)} · validação ${p.val.toFixed(6)}. A avaliação em pistas é uma medida diferente.` : 'Erro antes, durante e depois do treinamento.';
  $('milestones').innerHTML = history.slice(-24).map(row => `<tr><td>${row.updates}</td><td>${row.val.toFixed(5)}</td><td>${row.preview || '—'}</td></tr>`).join('');
}

let lastFrame = 0, accumulator = 0;
function frame(now) {
  const dt = Math.min(100, now - lastFrame); lastFrame = now;
  if (running && !training && !loading) {
    accumulator += dt * Number($('speed').value);
    while (accumulator >= 1000 / 60) {
      accumulator -= 1000 / 60;
      lastInput = observe(car, track); command = net.predict(lastInput);
      step(car, command, track, profile);
      step(ghost, initial.predict(observe(ghost, track)), track, profile);
      if (!car.alive || car.done) {
        running = false; accumulator = 0; $('run').textContent = '▶ Testar novamente';
        status(car.done ? 'Destino alcançado. Compare também o desvio e a variação do volante.' : 'Saiu da pista. Isso encerra o teste; não produz aprendizado automático.');
        break;
      }
    }
    draw();
  }
  requestAnimationFrame(frame);
}

refresh(); resetScene(); drawChart(); requestAnimationFrame(frame);

function draw(){let c=$('road').getContext('2d'),w=760,h=460,origin=car.s-105;const px=s=>track(s)+190,py=s=>h-(s-origin);c.fillStyle='#0a1923';c.fillRect(0,0,w,h);c.strokeStyle='#17313a';c.lineWidth=1;for(let x=0;x<w;x+=38){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=(origin%38);y<h;y+=38){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
 c.beginPath();for(let s=origin-10;s<origin+h+20;s+=5){let x=px(s)-profile.halfWidth,y=py(s);s===origin-10?c.moveTo(x,y):c.lineTo(x,y);}for(let s=origin+h+20;s>=origin-10;s-=5)c.lineTo(px(s)+profile.halfWidth,py(s));c.closePath();c.fillStyle='#293947';c.fill();for(let edge of [-profile.halfWidth,profile.halfWidth,0]){c.beginPath();for(let s=origin-10;s<origin+h+20;s+=5){let x=px(s)+edge,y=py(s);s===origin-10?c.moveTo(x,y):c.lineTo(x,y);}c.strokeStyle=edge?'#71828e':'#a4b3ab';c.lineWidth=edge?2:2;c.setLineDash(edge?[]:[13,17]);c.stroke();}c.setLineDash([]);
 if(py(2400)>-20&&py(2400)<h){for(let j=0;j<12;j++){c.fillStyle=j%2?'#edf7ef':'#14232d';c.fillRect(px(2400)-profile.halfWidth+j*(profile.halfWidth/6),py(2400),profile.halfWidth/6,12);}c.fillStyle='#edf7ef';c.font='12px system-ui';c.fillText('CHEGADA',px(2400)-28,py(2400)-10);}
 for(let d of [30,70,120]){c.beginPath();c.moveTo(car.x+190,py(car.s));c.lineTo(px(car.s+d),py(car.s+d));c.strokeStyle='#5ee6ce66';c.stroke();c.beginPath();c.arc(px(car.s+d),py(car.s+d),4,0,Math.PI*2);c.fillStyle='#5ee6ce';c.fill();}
 function vehicle(v,color){let y=py(v.s);if(y<0||y>h)return;c.save();c.translate(v.x+190,y);c.rotate(Math.atan2(v.v,2.5));c.fillStyle='#071019';c.fillRect(-12,-12,5,9);c.fillRect(7,-12,5,9);c.fillRect(-12,8,5,9);c.fillRect(7,8,5,9);c.fillStyle=v.alive?color:'#fa7e8c';c.fillRect(-8,-20,16,37);c.fillStyle='#152c3b';c.fillRect(-6,-10,12,10);c.fillStyle='#e9ffe7';c.fillRect(-6,-20,4,3);c.fillRect(2,-20,4,3);c.restore();}
 if(showGhost)vehicle(ghost,'#f780a4');vehicle(car,'#5ee6ce');c.font='11px monospace';c.fillStyle='#829daa';c.fillText(`PISTA ${pista}`,22,28);c.fillText(`${Math.min(2400,car.s).toFixed(0)} / 2400 m simulados`,22,47);c.fillStyle=car.alive?'#5ee6ce':'#f780a4';c.font='bold 13px system-ui';c.fillText(car.done?'DESTINO ALCANÇADO':!car.alive?'SAIU DA PISTA':training?'APRENDIZADO EM EXIBIÇÃO':running?'REDE NO COMANDO':'PRONTO PARA TESTAR',22,h-22);$('distance').textContent=`${Math.min(100,car.s/24).toFixed(0)}%`;$('steering').textContent=command.toFixed(2);drawNetwork();updateDrivingMetrics();}
function drawNetwork(){let ctx=$('network').getContext('2d'),a=net.forward(lastInput),w=620,h=290;ctx.clearRect(0,0,w,h);let points=a.map((layer,l)=>layer.map((v,j)=>({x:52+l*172,y:32+(j+.5)*(220/layer.length),v})));for(let l=0;l<3;l++)for(let j=0;j<net.weights[l].length;j++)for(let k=0;k<net.weights[l][j].length;k++){let weight=net.weights[l][j][k],p=points[l][k],q=points[l+1][j];ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle=weight>=0?'rgba(94,230,206,.25)':'rgba(247,128,164,.25)';ctx.lineWidth=.3+Math.min(2,Math.abs(weight));ctx.stroke();}points.forEach((layer,l)=>{layer.forEach(p=>{ctx.beginPath();ctx.arc(p.x,p.y,l===0?9:7,0,Math.PI*2);ctx.fillStyle=p.v>=0?`rgba(94,230,206,${.25+.75*Math.min(1,Math.abs(p.v))})`:`rgba(247,128,164,${.25+.75*Math.min(1,Math.abs(p.v))})`;ctx.fill();ctx.strokeStyle='#bedbd3';ctx.lineWidth=1;ctx.stroke();});ctx.fillStyle='#9aaebf';ctx.font='11px system-ui';ctx.textAlign='center';ctx.fillText(['5 entradas','12 neurônios','8 neurônios','volante'][l],layer[0].x,279);});$('parameters').textContent=JSON.stringify({observacoes:lastInput,previsao:net.predict(lastInput),primeiroNeuronio:{pesos:net.weights[0][0],vies:net.biases[0][0]},formula:'a = tanh(w0*x0 + … + w4*x4 + b)'},null,2);}


