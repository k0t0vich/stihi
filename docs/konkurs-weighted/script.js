'use strict';

const P = contestData.participants;
const N = P.length;
const byId = new Map(P.map(p => [p.id, p]));
const SCALE = [0.4, 0.3, 0.2, 0.1];
const JUDGES = P.filter(p => p.isJudge);

let method = 'plain';
let query = '';
let current = null;

const el = id => document.getElementById(id);
const fmt = (x, d = 2) => x.toFixed(d);

// Один проход: раздать баллы с учётом весов судей.
function tally(weights) {
    const s = new Map(P.map(p => [p.id, 0]));
    for (const j of JUDGES) {
        const w = weights.get(j.id);
        j.top.forEach((wid, pos) => {
            if (!byId.has(wid)) return;
            s.set(wid, s.get(wid) + SCALE[pos] * w);
        });
    }
    return s;
}

// Итеративный расчёт. Возвращает баллы, веса и историю изменений.
function solve(mode, damp, maxIters) {
    let weights = new Map(JUDGES.map(j => [j.id, 1]));
    const history = [];
    if (mode === 'plain') return { scores: tally(weights), weights, history, iters: 0 };

    let scores = tally(weights);
    for (let it = 0; it < maxIters; it++) {
        const max = Math.max(...scores.values()) || 1;
        const next = new Map();

        for (const j of JUDGES) {
            let base;
            if (mode === 'rating') {
                // вес = собственный рейтинг участника
                base = scores.get(j.id) / max;
            } else {
                // вес = согласие бюллетеня с общим результатом
                let agree = 0;
                j.top.forEach((wid, pos) => {
                    if (byId.has(wid)) agree += SCALE[pos] * (scores.get(wid) / max);
                });
                base = agree;
            }
            next.set(j.id, base);
        }

        // нормируем к максимуму 1, затем сглаживаем: damp=0 -> все равны, damp=1 -> чистый вес
        const nmax = Math.max(...next.values()) || 1;
        let delta = 0;
        for (const j of JUDGES) {
            const v = (1 - damp) + damp * (next.get(j.id) / nmax);
            delta = Math.max(delta, Math.abs(v - weights.get(j.id)));
            next.set(j.id, v);
        }
        weights = next;
        history.push(delta);
        scores = tally(weights);
        if (delta < 1e-9) return { scores, weights, history, iters: it + 1 };
    }
    return { scores, weights, history, iters: maxIters };
}

function compute() {
    const damp = +el('damp').value / 100;
    const maxIters = +el('iters').value;

    const plain = solve('plain', 0, 1);
    const res = method === 'plain' ? plain : solve(method, damp, maxIters);

    // счётчик мест 1/2/3/4 — для tie-break
    const places = new Map(P.map(p => [p.id, [0, 0, 0, 0]]));
    const from = new Map(P.map(p => [p.id, []]));
    for (const j of JUDGES) {
        j.top.forEach((wid, pos) => {
            if (!byId.has(wid)) return;
            places.get(wid)[pos]++;
            from.get(wid).push({ judge: j.id, pos });
        });
    }

    const rows = P.map(p => ({
        p,
        plain: plain.scores.get(p.id),
        final: res.scores.get(p.id),
        weight: res.weights.get(p.id) ?? 1,
        places: places.get(p.id),
        from: from.get(p.id)
    }));

    const cmp = key => (a, b) => {
        if (b[key] !== a[key]) return b[key] - a[key];
        for (let i = 0; i < 4; i++) if (b.places[i] !== a.places[i]) return b.places[i] - a.places[i];
        return a.p.id - b.p.id;
    };
    const sorted = [...rows].sort(cmp('final'));
    const plainRank = new Map([...rows].sort(cmp('plain')).map((r, i) => [r.p.id, i + 1]));
    sorted.forEach((r, i) => { r.rank = i + 1; r.plainRank = plainRank.get(r.p.id); });

    const ws = [...res.weights.values()];
    return {
        rows: sorted, iters: res.iters, history: res.history,
        spread: Math.min(...ws) > 0 ? Math.max(...ws) / Math.min(...ws) : Infinity,
        moved: sorted.filter(r => r.rank !== r.plainRank).length
    };
}

const EXPLAIN = {
    plain: `Все голоса равны. Итог = сумма баллов по шкале 0.4 / 0.3 / 0.2 / 0.1 —
            обычный метод Борда, база для сравнения.`,
    rating: `Вес судьи = его собственное место в таблице: <code>w = (1−d) + d · S/S_max</code>.
             Считаем рейтинг, пересчитываем веса, повторяем. Гипотеза: чей трек лучше,
             тот и разбирается лучше. <b>Риск:</b> если связи между качеством трека и вкусом нет,
             метод только добавляет шум — на модели он проигрывает простому счёту.`,
    consensus: `Вес судьи = насколько его бюллетень совпал с общим результатом:
                <code>w ~ Σ SCALE[поз] · S(выбранный)/S_max</code>. Меряет не качество трека,
                а попадание в консенсус. На модели коррелирует с настоящей компетентностью
                на +0.5 даже когда качество и вкус не связаны. <b>Риск:</b> награждает конформизм.`
};

function render() {
    el('dampVal').textContent = (+el('damp').value / 100).toFixed(2);
    el('itersVal').textContent = el('iters').value;
    el('explain').innerHTML = EXPLAIN[method];

    current = compute();

    el('statMethod').textContent = { plain: 'простой', rating: 'рейтинг', consensus: 'согласие' }[method];
    el('statIters').textContent = current.iters || '—';
    el('statSpread').textContent = method === 'plain' ? '—'
        : (isFinite(current.spread) ? fmt(current.spread, 1) + '×' : '∞');
    el('statMoved').textContent = current.moved;

    renderPodium(current.rows);
    renderTable(current.rows);
    renderChart(current.history);
}

function renderPodium(rows) {
    el('podium').innerHTML = rows.slice(0, 4).map((r, i) => `
        <div class="podium-place p${i + 1}">
            <div class="podium-rank">${i + 1}</div>
            <div class="podium-score">${fmt(r.final)}</div>
            <div class="podium-raw">простой ${fmt(r.plain)}${
                r.rank !== r.plainRank ? ` · был ${r.plainRank}-м` : ''}</div>
            <div class="podium-name">${r.p.name}</div>
            <div class="podium-song">${r.p.song}</div>
        </div>`).join('');
}

function renderTable(rows) {
    const q = query.toLowerCase();
    const vis = rows.filter(r => !q || r.p.name.toLowerCase().includes(q) || r.p.song.toLowerCase().includes(q));
    const maxW = Math.max(...rows.map(r => r.weight), 1);

    el('resultsBody').innerHTML = vis.map(r => {
        const d = r.plainRank - r.rank;
        const moved = d > 0 ? `<span class="moved up">▲${d}</span>`
                    : d < 0 ? `<span class="moved down">▼${-d}</span>` : '';
        const wpct = Math.round(r.weight / maxW * 100);
        return `<tr data-id="${r.p.id}">
            <td class="rank">${r.rank}${moved}</td>
            <td><span class="participant-name">${r.p.name}</span></td>
            <td class="song-title">${r.p.song}</td>
            <td class="num">${fmt(r.plain)}</td>
            <td class="num"><div class="wbar">
                <div class="wbar-track"><div class="wbar-fill" style="width:${wpct}%"></div></div>
                <span>${fmt(r.weight, 2)}</span></div></td>
            <td class="num final">${fmt(r.final)}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#999">Ничего не найдено</td></tr>';
}

function renderChart(history) {
    const c = el('convChart'), dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = 90;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!history.length) {
        ctx.fillStyle = '#adb5bd'; ctx.font = '13px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('Простой счёт — итераций нет', w / 2, h / 2 + 4);
        return;
    }
    // логарифмическая шкала: изменения падают на порядки
    const vals = history.map(v => Math.log10(Math.max(v, 1e-12)));
    const lo = Math.min(...vals), hi = Math.max(...vals), span = (hi - lo) || 1;
    const pad = 8, iw = w - pad * 2, ih = h - pad * 2;

    ctx.strokeStyle = '#dee2e6'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, h - pad); ctx.lineTo(w - pad, h - pad); ctx.stroke();

    ctx.strokeStyle = '#11998e'; ctx.lineWidth = 2; ctx.beginPath();
    vals.forEach((v, i) => {
        const x = pad + (vals.length === 1 ? iw / 2 : i / (vals.length - 1) * iw);
        const y = pad + (1 - (v - lo) / span) * ih;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();

    ctx.fillStyle = '#6c757d'; ctx.font = '11px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(`${history.length} итер., последнее изменение ${history[history.length - 1].toExponential(1)}`, pad, 14);
}

function showModal(id) {
    const r = current.rows.find(x => x.p.id === id);
    if (!r) return;
    const posName = ['1 место', '2 место', '3 место', '4 место'];
    const maxW = Math.max(...current.rows.map(x => x.weight), 1);

    const votes = r.from.length
        ? `<ul class="vote-list">${r.from.sort((a, b) => a.pos - b.pos).map(v => {
            const jr = current.rows.find(x => x.p.id === v.judge);
            const contrib = SCALE[v.pos] * (method === 'plain' ? 1 : jr.weight);
            return `<li><span>${byId.get(v.judge).name} <b style="color:#11998e">×${fmt(jr.weight, 2)}</b></span>
                        <span class="pts">${posName[v.pos]} · ${fmt(contrib, 3)}</span></li>`;
        }).join('')}</ul>`
        : '<p style="color:#999;padding:8px 0">Ни одного голоса.</p>';

    el('modalContent').innerHTML = `
        <h3>${r.rank}. ${r.p.name}</h3>
        <div class="m-song">${r.p.song}</div>
        <table class="calc-table">
            <tr><td>Простой счёт</td><td>${fmt(r.plain)} (${r.plainRank} место)</td></tr>
            <tr><td>Вес его голоса как судьи</td><td>${fmt(r.weight, 3)} из ${fmt(maxW, 3)}</td></tr>
            <tr class="calc-total"><td><b>Итог методом «${
                { plain: 'простой', rating: 'рейтинг', consensus: 'согласие' }[method]}»</b></td>
                <td>${fmt(r.final, 3)}</td></tr>
            <tr><td>Мест 1/2/3/4 получено</td><td>${r.places.join(' / ')}</td></tr>
        </table>
        <h4 style="color:#16564d">Кто голосовал за него (и с каким весом)</h4>
        ${votes}
        <h4 style="margin-top:14px;color:#16564d">Его бюллетень</h4>
        <ul class="vote-list">${r.p.top.map((wid, i) =>
            `<li><span>${posName[i]}: ${byId.get(wid) ? byId.get(wid).name : '—'}</span>
                 <span class="pts">${fmt(SCALE[i])}</span></li>`).join('')}</ul>`;
    el('modal').style.display = 'flex';
}

el('methods').addEventListener('click', e => {
    const b = e.target.closest('.method-btn');
    if (!b) return;
    document.querySelectorAll('.method-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    method = b.dataset.m;
    render();
});
el('damp').addEventListener('input', render);
el('iters').addEventListener('input', render);
el('searchBox').addEventListener('input', e => { query = e.target.value; renderTable(current.rows); });
el('resultsBody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) showModal(+tr.dataset.id);
});
el('modalClose').addEventListener('click', () => el('modal').style.display = 'none');
el('modal').addEventListener('click', e => { if (e.target.id === 'modal') el('modal').style.display = 'none'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') el('modal').style.display = 'none'; });
window.addEventListener('resize', () => current && renderChart(current.history));

render();
