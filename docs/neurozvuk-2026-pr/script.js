'use strict';

const P = contestData.participants;
const N = P.length;
const SCALE = contestData.scale;
const JUDGES = P.filter(p => p.isJudge);
const J = JUDGES.length;
const byAuthor = new Map(P.map(p => [p.author, p]));

const el = id => document.getElementById(id);
const fmt = (x, d = 2) => x.toFixed(d);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

// Бюллетень судьи: за кого он голосовал, от большего балла к меньшему.
const ballots = new Map();
for (const j of JUDGES) ballots.set(j.author, []);
for (const p of P) {
    for (const [jname, v] of Object.entries(p.votes)) {
        if (ballots.has(jname)) ballots.get(jname).push({ target: p, pts: v });
    }
}
for (const b of ballots.values()) b.sort((a, b2) => b2.pts - a.pts);

let query = '';
let current = null;

// Счёт с заданными весами голосующих; corr — коэффициент за неучастие.
// Вес есть только у голосовавших: у остальных нет голосов, взвешивать нечего.
function tally(weights, corr) {
    const s = new Map(P.map(p => [p.author, 0]));
    for (const p of P) {
        for (const [jname, v] of Object.entries(p.votes)) {
            s.set(p.author, s.get(p.author) + v * (weights ? weights.get(jname) : 1));
        }
    }
    if (!corr) return s;
    // База — суммарный вес голосовавших (при равных весах это просто их число).
    const W = weights ? [...weights.values()].reduce((a, b) => a + b, 0) : J;
    for (const p of P) {
        const own = weights ? (weights.get(p.author) || 0) : (p.isJudge ? 1 : 0);
        const avail = W - own;
        if (avail > 1e-12) s.set(p.author, s.get(p.author) * (N - 1) / avail * (W / J));
    }
    return s;
}

// Итеративное взвешивание: вес голосующего = его место в текущем рейтинге.
function solvePR(damp, corr, maxIters = 100) {
    let weights = new Map(JUDGES.map(j => [j.author, 1]));
    let scores = tally(weights, corr);
    const history = [];
    for (let it = 0; it < maxIters; it++) {
        const max = Math.max(...scores.values()) || 1;
        const next = new Map(JUDGES.map(j => [j.author, scores.get(j.author) / max]));
        const nmax = Math.max(...next.values()) || 1;
        let delta = 0;
        for (const j of JUDGES) {
            const v = (1 - damp) + damp * (next.get(j.author) / nmax);
            delta = Math.max(delta, Math.abs(v - weights.get(j.author)));
            next.set(j.author, v);
        }
        weights = next;
        history.push(delta);
        scores = tally(weights, corr);
        if (delta < 1e-10) break;
    }
    return { scores, weights, iters: history.length };
}

function compute() {
    const useCorr = el('corr').checked;
    const usePR = el('pr').checked;
    const damp = +el('damp').value / 100;

    const res = usePR ? solvePR(damp, useCorr) : { scores: tally(null, useCorr), weights: null, iters: 0 };
    const plain = tally(null, false);   // база для колонки «Общий» и стрелок

    const rows = P.map(p => {
        const raw = plain.get(p.author);
        const final = res.scores.get(p.author);
        // счётчик мест 1..4 — для tie-break
        const places = [0, 0, 0, 0];
        for (const v of Object.values(p.votes)) {
            const i = SCALE.indexOf(v);
            if (i >= 0) places[i]++;
        }
        return {
            p, raw, final,
            k: raw > 0 ? final / raw : 1,
            weight: res.weights ? res.weights.get(p.author) : null,
            places, voters: Object.entries(p.votes).sort((a, b) => b[1] - a[1])
        };
    });
    rows.iters = res.iters;
    rows.weights = res.weights;

    const cmp = key => (a, b) => {
        if (b[key] !== a[key]) return b[key] - a[key];
        for (let i = 0; i < 4; i++) if (b.places[i] !== a.places[i]) return b.places[i] - a.places[i];
        return a.p.id - b.p.id;
    };
    const sorted = [...rows].sort(cmp('final'));
    const rawRank = new Map([...rows].sort(cmp('raw')).map((r, i) => [r.p.id, i + 1]));
    sorted.forEach((r, i) => { r.place = i + 1; r.rawPlace = rawRank.get(r.p.id); });
    sorted.iters = rows.iters;
    sorted.weights = rows.weights;
    return sorted;
}

function renderStats(rows) {
    el('stats').innerHTML = [
        [N, 'участников'],
        [J, 'голосовали'],
        [N - J, 'не голосовали']
    ].map(([n, l]) => `<div class="stat glass"><div class="stat-n">${n}</div><div class="stat-l">${l}</div></div>`).join('');

    const usePR = el('pr').checked;
    const kj = (N - 1) / (J - 1), kn = (N - 1) / J;
    el('corrHint').textContent = el('corr').checked
        ? (usePR ? 'считается от суммарного веса голосовавших'
                 : `голосовавшим ×${fmt(kj, 3)}, остальным ×${fmt(kn, 3)} (разница ${fmt((kn / kj - 1) * 100, 2)}%)`)
        : 'выключен';

    el('prControls').style.display = usePR ? '' : 'none';
    el('thWeight').style.display = usePR ? '' : 'none';
    document.querySelector('.row.head').style.gridTemplateColumns =
        usePR ? '54px 1fr 84px 72px 84px' : '54px 1fr 96px 84px';
    el('dampVal').textContent = fmt(+el('damp').value / 100, 2);

    if (usePR && rows.weights) {
        const ws = [...rows.weights.values()];
        const spread = Math.min(...ws) > 1e-9 ? Math.max(...ws) / Math.min(...ws) : Infinity;
        el('prHint').textContent = `вес голоса от ${fmt(Math.min(...ws), 2)} до ${fmt(Math.max(...ws), 2)}`;
        el('prStats').textContent =
            `${rows.iters} итераций до сходимости · разброс ${isFinite(spread) ? fmt(spread, 1) + '×' : '∞'}`;
    } else {
        el('prHint').textContent = 'выключен — все голоса равны';
        el('prStats').textContent = '';
    }
}

const MEDAL = ['🥇', '🥈', '🥉'];

function renderPodium(rows) {
    el('podium').innerHTML = rows.slice(0, 3).map((r, i) => `
        <div class="pod g${i + 1}" data-id="${r.p.id}">
            <div class="pod-medal">${MEDAL[i]}</div>
            <div class="pod-score">${fmt(r.final)}</div>
            <div class="pod-raw">общий ${fmt(r.raw)}${r.k !== 1 ? ` × ${fmt(r.k, 3)}` : ''}</div>
            <div class="pod-author">${esc(r.p.author)}</div>
            <div class="pod-track">${esc(r.p.track)}</div>
            ${r.p.project ? `<div class="pod-proj">${esc(r.p.project)}</div>` : ''}
        </div>`).join('');
}

function renderRows(rows) {
    const q = query.trim().toLowerCase();
    const rest = rows.slice(3).filter(r => !q ||
        r.p.author.toLowerCase().includes(q) ||
        r.p.track.toLowerCase().includes(q) ||
        (r.p.project || '').toLowerCase().includes(q));

    const usePR = el('pr').checked;
    const cols = usePR ? '54px 1fr 84px 72px 84px' : '54px 1fr 96px 84px';

    el('rows').innerHTML = rest.map(r => {
        const d = r.rawPlace - r.place;
        const shift = d > 0 ? `<span class="shift up">▲${d}</span>`
                    : d < 0 ? `<span class="shift down">▼${-d}</span>` : '';
        const wCell = usePR
            ? `<div class="r-num r-w">${r.weight != null ? fmt(r.weight, 2) : '—'}</div>` : '';
        return `<div class="row ${r.raw === 0 ? 'zero' : ''}" data-id="${r.p.id}" style="grid-template-columns:${cols}">
            <div class="r-place">${r.place}${shift}</div>
            <div>
                <div class="r-author">${esc(r.p.author)}<span class="badge ${r.p.isJudge ? '' : 'no'}">${
                    r.p.isJudge ? 'голосовал' : 'не голосовал'}</span></div>
                <div class="r-track">${esc(r.p.track)}${r.p.project ? ' · ' + esc(r.p.project) : ''}</div>
            </div>
            <div class="r-num r-raw">${fmt(r.raw)}</div>
            ${wCell}
            <div class="r-num r-fin">${fmt(r.final)}</div>
        </div>`;
    }).join('') || '<div class="row" style="justify-items:center"><div></div><div class="empty">Ничего не найдено</div></div>';
}

function render() {
    current = compute();
    renderStats(current);
    renderPodium(current);
    renderRows(current);
}

function openModal(id) {
    const r = current.find(x => x.p.id === id);
    if (!r) return;
    const p = r.p;
    const posName = ['1 место', '2 место', '3 место', '4 место'];
    const nameOf = v => `${posName[SCALE.indexOf(v)] || '—'}`;

    const W = current.weights;
    const gotList = r.voters.length
        ? `<ul class="vlist">${r.voters.map(([jname, v]) => {
            const jp = byAuthor.get(jname);
            const nm = jp && jp.vk
                ? `<a href="${esc(jp.vk)}" target="_blank" rel="noopener">${esc(jname)}</a>`
                : esc(jname);
            const w = W ? W.get(jname) : null;
            const wTag = w != null ? ` <b style="color:var(--gold)">×${fmt(w, 2)}</b>` : '';
            const contrib = w != null ? ` = ${fmt(v * w, 2)}` : '';
            return `<li><span>${nm}${wTag}</span><span class="pts">${nameOf(v)} · ${fmt(v, 1)}${contrib}</span></li>`;
        }).join('')}</ul>`
        : '<p class="empty">За этот трек не проголосовал никто.</p>';

    const own = p.isJudge ? (() => {
        const b = ballots.get(p.author);
        if (!b.length) return '<p class="empty">Бюллетень пуст.</p>';
        const warn = b.length !== 4
            ? `<div class="m-note">Проголосовал не полностью: ${b.length} ${b.length === 1 ? 'оценка' : 'оценки'} вместо 4.</div>`
            : '';
        return warn + `<ul class="vlist">${b.map(x =>
            `<li><span>${esc(x.target.author)} — <i>${esc(x.target.track)}</i></span>
                 <span class="pts">${fmt(x.pts, 1)}</span></li>`).join('')}</ul>`;
    })() : '<p class="empty">Не голосовал — участвовал только как автор.</p>';

    el('modalBody').innerHTML = `
        <div class="m-place">${r.place} место из ${N}${
            r.place !== r.rawPlace ? ` · без коэффициента было ${r.rawPlace}` : ''}</div>
        <h2>${p.vk
            ? `<a class="m-vk" href="${esc(p.vk)}" target="_blank" rel="noopener">${esc(p.author)}</a>`
            : esc(p.author)}</h2>
        <div class="m-track">${esc(p.track)}</div>
        ${p.project ? `<div class="m-proj">${esc(p.project)}</div>` : '<div class="m-proj"></div>'}
        ${p.trackNote ? `<div class="m-note">${esc(p.trackNote)}</div>` : ''}
        <div class="m-grid">
            <div class="m-cell"><div class="v">${fmt(r.raw)}</div><div class="k">общий балл</div></div>
            <div class="m-cell"><div class="v">×${fmt(r.k, 3)}</div><div class="k">множитель</div></div>
            <div class="m-cell"><div class="v">${fmt(r.final)}</div><div class="k">итог</div></div>
            <div class="m-cell"><div class="v">${r.voters.length}</div><div class="k">голосов за него</div></div>
            ${r.weight != null
                ? `<div class="m-cell"><div class="v">${fmt(r.weight, 2)}</div><div class="k">вес его голоса</div></div>`
                : ''}
        </div>
        <div class="m-h">Голоса</div>
        ${gotList}
        <div class="m-h">Бюллетень</div>
        ${own}`;
    el('overlay').style.display = 'flex';
}

el('corr').addEventListener('change', render);
el('pr').addEventListener('change', render);
el('damp').addEventListener('input', render);
el('search').addEventListener('input', e => { query = e.target.value; renderRows(current); });
el('rows').addEventListener('click', e => {
    const row = e.target.closest('.row[data-id]');
    if (row) openModal(+row.dataset.id);
});
el('podium').addEventListener('click', e => {
    const pod = e.target.closest('.pod[data-id]');
    if (pod) openModal(+pod.dataset.id);
});
el('modalX').addEventListener('click', () => el('overlay').style.display = 'none');
el('overlay').addEventListener('click', e => { if (e.target.id === 'overlay') el('overlay').style.display = 'none'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') el('overlay').style.display = 'none'; });

render();
