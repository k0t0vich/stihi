'use strict';

const P = contestData.participants;
const N = P.length;
const byId = new Map(P.map(p => [p.id, p]));

let filter = 'all';
let query = '';

const el = id => document.getElementById(id);
const scale = () => [1,2,3,4].map(i => parseFloat(el('scale'+i).value) || 0);

// Судьи, отключённые ползунком «снять N голосующих» — берём с конца списка,
// чтобы при движении ползунка набор менялся предсказуемо.
function activeJudges(drop) {
    const all = P.filter(p => p.isJudge);
    return new Set(all.slice(0, all.length - drop).map(p => p.id));
}

function compute() {
    const drop = +el('dropJudges').value;
    const useCorr = el('useCorrection').checked;
    const S = scale();
    const active = activeJudges(drop);
    const J = active.size;

    const raw = new Map(P.map(p => [p.id, 0]));
    // places[id] = [сколько первых, вторых, третьих, четвёртых] — для tie-break
    const places = new Map(P.map(p => [p.id, [0,0,0,0]]));
    const from = new Map(P.map(p => [p.id, []]));

    for (const p of P) {
        if (!active.has(p.id) || !p.top) continue;
        p.top.forEach((wid, pos) => {
            if (!byId.has(wid)) return;
            raw.set(wid, raw.get(wid) + S[pos]);
            places.get(wid)[pos]++;
            from.get(wid).push({ judge: p.id, pos, pts: S[pos] });
        });
    }

    const rows = P.map(p => {
        const voted = active.has(p.id);
        const E = J - (voted ? 1 : 0);          // сколько судей МОГЛИ за него голосовать
        const k = (useCorr && E > 0) ? (N - 1) / E : 1;
        return {
            p, voted, raw: raw.get(p.id), k,
            final: raw.get(p.id) * k,
            places: places.get(p.id),
            from: from.get(p.id)
        };
    });

    // Основной порядок и «сырой» порядок — для стрелок сдвига
    const cmp = key => (a, b) => {
        if (b[key] !== a[key]) return b[key] - a[key];
        for (let i = 0; i < 4; i++)
            if (b.places[i] !== a.places[i]) return b.places[i] - a.places[i];
        return a.p.id - b.p.id;
    };
    const sorted = [...rows].sort(cmp('final'));
    const rawOrder = new Map([...rows].sort(cmp('raw')).map((r, i) => [r.p.id, i + 1]));

    sorted.forEach((r, i) => {
        r.rank = i + 1;
        r.rawRank = rawOrder.get(r.p.id);
        // ничья только по баллу; tie-break уже развёл их по местам
        r.tie = sorted.some(o => o !== r && Math.abs(o.final - r.final) < 1e-9 && r.final > 0);
    });

    return { rows: sorted, J, drop, useCorr, S };
}

const fmt = (x, d = 2) => x.toFixed(d);

function renderStats(st) {
    el('statParticipants').textContent = N;
    el('statJudges').textContent = st.J;
    el('statTurnout').textContent = Math.round(st.J / N * 100) + '%';
    const penalty = st.useCorr && st.J > 1 ? (1 - (st.J - 1) / st.J) * 100 : 0;
    el('statPenalty').textContent = penalty ? '−' + penalty.toFixed(1) + '%' : '—';

    const kJ = st.J > 1 ? (N - 1) / (st.J - 1) : 0;
    const kN = st.J > 0 ? (N - 1) / st.J : 0;
    el('formulaBox').innerHTML = st.useCorr
        ? `Итоговый балл: <code>S × (N−1) / (J − j)</code>, где <b>N</b> = ${N} участников,
           <b>J</b> = ${st.J} проголосовавших, <b>j</b> = 1 если участник сам голосовал.<br>
           Коэффициент: <b>голосовавшим</b> ${fmt(kJ,4)} (электорат ${st.J - 1}),
           <b>не голосовавшим</b> ${fmt(kN,4)} (электорат ${st.J}).
           Разница <b>${Math.abs((kN/kJ - 1) * 100).toFixed(2)}%</b> — на неё неголосующий и получал бы преимущество.`
        : `Коррекция выключена — показан сырой счёт по методу Борда.
           Не голосовавшие имеют электорат из ${st.J} судей против ${st.J - 1} у голосовавших,
           то есть <b>систематическое преимущество</b>.`;
}

function renderPodium(rows) {
    el('podium').innerHTML = rows.slice(0, 4).map((r, i) => `
        <div class="podium-place p${i+1}">
            <div class="podium-rank">${i+1}</div>
            <div class="podium-score">${fmt(r.final)}</div>
            <div class="podium-raw">сырой ${fmt(r.raw)}${r.k !== 1 ? ' × ' + fmt(r.k, 3) : ''}</div>
            <div class="podium-name">${r.p.name}${r.voted
                ? '<span class="judge-badge">судил</span>'
                : '<span class="nojudge-badge">не голосовал</span>'}</div>
            <div class="podium-song">${r.p.song}</div>
        </div>`).join('');
}

function renderTable(rows) {
    const q = query.toLowerCase();
    const visible = rows.filter(r => {
        if (q && !(r.p.name.toLowerCase().includes(q) || r.p.song.toLowerCase().includes(q))) return false;
        if (filter === 'top10') return r.rank <= 10;
        if (filter === 'judges') return r.voted;
        if (filter === 'nojudges') return !r.voted;
        if (filter === 'scored') return r.raw > 0;
        return true;
    });

    el('resultsBody').innerHTML = visible.map(r => {
        const d = r.rawRank - r.rank;
        const moved = d > 0 ? `<span class="moved up">▲${d}</span>`
                    : d < 0 ? `<span class="moved down">▼${-d}</span>` : '';
        return `<tr data-id="${r.p.id}" class="${r.raw === 0 ? 'zero-row' : ''}">
            <td class="rank">${r.rank}${moved}</td>
            <td><span class="participant-name">${r.p.name}</span>${r.voted
                ? '<span class="judge-badge">судил</span>'
                : '<span class="nojudge-badge">нет</span>'}</td>
            <td class="song-title">${r.p.song}</td>
            <td class="score">${fmt(r.raw)}</td>
            <td class="score">${fmt(r.k, 3)}</td>
            <td class="adjusted-score">${fmt(r.final)}${r.tie ? '<span class="tie-mark">≈</span>' : ''}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="6" style="padding:20px;text-align:center;color:#999">Ничего не найдено</td></tr>';
}

let current = null;

function render() {
    current = compute();
    el('dropVal').textContent = current.drop;
    renderStats(current);
    renderPodium(current.rows);
    renderTable(current.rows);
}

function showModal(id) {
    const r = current.rows.find(x => x.p.id === id);
    if (!r) return;
    const S = current.S;
    const posName = ['1 место', '2 место', '3 место', '4 место'];

    const votes = r.from.length
        ? `<ul class="vote-list">${r.from
            .sort((a, b) => a.pos - b.pos)
            .map(v => `<li><span>${byId.get(v.judge).name}</span>
                       <span class="pts">${posName[v.pos]} · +${fmt(v.pts)}</span></li>`).join('')}</ul>`
        : '<p style="color:#999;padding:8px 0">Ни одного голоса.</p>';

    const own = r.p.top
        ? `<h4 style="margin-top:14px;color:#495057">Его голоса</h4>
           <ul class="vote-list">${r.p.top.map((wid, i) =>
                `<li><span>${posName[i]}: ${byId.get(wid) ? byId.get(wid).name : '—'}</span>
                     <span class="pts">${fmt(S[i])}</span></li>`).join('')}</ul>`
        : '';

    el('modalContent').innerHTML = `
        <h3>${r.rank}. ${r.p.name}</h3>
        <div class="m-song">${r.p.song}</div>
        <table class="calc-table">
            <tr><td>Голосовал сам</td><td>${r.voted ? 'да' : 'нет'}</td></tr>
            <tr><td>Судей могли за него голосовать</td><td>${current.J - (r.voted ? 1 : 0)}</td></tr>
            <tr><td>Сырой балл</td><td>${fmt(r.raw)}</td></tr>
            <tr><td>Коэффициент (N−1)/(J−j)</td><td>× ${fmt(r.k, 4)}</td></tr>
            <tr class="calc-total"><td><b>Итоговый балл</b></td><td>${fmt(r.final, 3)}</td></tr>
            <tr><td>Мест 1/2/3/4 получено</td><td>${r.places.join(' / ')}</td></tr>
        </table>
        <h4 style="color:#495057">Кто за него голосовал</h4>
        ${votes}
        ${own}`;
    el('modal').style.display = 'flex';
}

// ── события ──
['scale1','scale2','scale3','scale4'].forEach(id => el(id).addEventListener('input', render));
el('useCorrection').addEventListener('change', render);
el('dropJudges').addEventListener('input', render);
el('searchBox').addEventListener('input', e => { query = e.target.value; renderTable(current.rows); });

document.querySelectorAll('.filter-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    filter = b.dataset.filter;
    renderTable(current.rows);
}));

el('resultsBody').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) showModal(+tr.dataset.id);
});
el('modalClose').addEventListener('click', () => el('modal').style.display = 'none');
el('modal').addEventListener('click', e => { if (e.target.id === 'modal') el('modal').style.display = 'none'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') el('modal').style.display = 'none'; });

el('dropJudges').max = P.filter(p => p.isJudge).length - 1;
render();
