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

// Бюллетень: за кого отдан голос, от большего балла к меньшему.
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

function compute() {
    const useCorr = el('corr').checked;

    const rows = P.map(p => {
        const raw = Object.values(p.votes).reduce((a, b) => a + b, 0);
        // База — не голосовавшие: их выбирали все J человек.
        // Голосовавших выбирали J-1 (за себя нельзя), поэтому им множитель J/(J-1).
        const k = useCorr && p.isJudge && J > 1 ? J / (J - 1) : 1;
        // счётчик мест 1..4 — для tie-break
        const places = [0, 0, 0, 0];
        for (const v of Object.values(p.votes)) {
            const i = SCALE.indexOf(v);
            if (i >= 0) places[i]++;
        }
        return { p, raw, k, final: raw * k, places, voters: Object.entries(p.votes).sort((a, b) => b[1] - a[1]) };
    });

    const cmp = key => (a, b) => {
        if (b[key] !== a[key]) return b[key] - a[key];
        for (let i = 0; i < 4; i++) if (b.places[i] !== a.places[i]) return b.places[i] - a.places[i];
        return a.p.id - b.p.id;
    };
    const sorted = [...rows].sort(cmp('final'));
    const rawRank = new Map([...rows].sort(cmp('raw')).map((r, i) => [r.p.id, i + 1]));
    sorted.forEach((r, i) => { r.place = i + 1; r.rawPlace = rawRank.get(r.p.id); });
    return sorted;
}

function renderStats(rows) {
    el('stats').innerHTML = [
        [N, 'участников'],
        [J, 'голосовали'],
        [N - J, 'не голосовали']
    ].map(([n, l]) => `<div class="stat glass"><div class="stat-n">${n}</div><div class="stat-l">${l}</div></div>`).join('');

    const k = J / (J - 1);
    el('corrHint').textContent = el('corr').checked
        ? `голосовавшим ×${fmt(k, 4)} (+${fmt((k - 1) * 100, 2)}%), остальным — как есть`
        : 'выключен — общая сумма баллов';

    // числа в подвале берём из данных, чтобы текст не разошёлся с расчётом
    el('fJ1').textContent = J - 1;
    el('fJ').textContent = J;
    el('fK').textContent = `${J} / ${J - 1} = ${fmt(k, 4)}`;
    el('fP').textContent = `+${fmt((k - 1) * 100, 2)}%`;
}

const MEDAL = ['🥇', '🥈', '🥉'];

// Ссылка на трек. У VK-аудио публичного embed нет (audio_ext.php не существует),
// поэтому там кнопка; для источников с embed — плеер.
function playerHTML(url) {
    if (!url) return '';
    const u = String(url);
    if (/\.(mp3|ogg|wav|m4a|opus)(\?|$)/i.test(u))
        return `<audio class="pod-audio" controls preload="none" src="${esc(u)}"></audio>`;
    if (/vk\.(?:com|ru)\/audio-?\d+_\d+/.test(u))
        return `<a class="pod-link vk" href="${esc(u)}" target="_blank" rel="noopener">Слушать вконтакте</a>`;

    let src = null, m;
    if ((m = u.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/)))
        src = `https://www.youtube.com/embed/${m[1]}`;
    else if (/soundcloud\.com/.test(u))
        src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(u)}&visual=false`;
    else if ((m = u.match(/vk\.(?:com|ru)\/video(-?\d+)_(\d+)/)))
        src = `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}`;
    else if (/suno\.(com|ai)/.test(u))
        src = u.replace('/song/', '/embed/');

    return src
        ? `<iframe class="pod-frame" src="${esc(src)}" loading="lazy" allow="encrypted-media"
                   referrerpolicy="no-referrer-when-downgrade"></iframe>`
        : `<a class="pod-link" href="${esc(u)}" target="_blank" rel="noopener">🎵 слушать</a>`;
}

function renderPodium(rows) {
    el('podium').innerHTML = rows.slice(0, 3).map((r, i) => `
        <div class="pod g${i + 1}" data-id="${r.p.id}">
            <div class="pod-medal">${MEDAL[i]}</div>
            <div class="pod-score">${fmt(r.final)}</div>
            <div class="pod-raw">общий ${fmt(r.raw)}${r.k !== 1 ? ` × ${fmt(r.k, 3)}` : ''}</div>
            <div class="pod-author">${esc(r.p.author)}<span class="badge ${r.p.isJudge ? '' : 'no'}" title="${
                r.p.isJudge ? 'участвовал в голосовании' : 'не участвовал в голосовании'}">⚖</span></div>
            <div class="pod-track">${esc(r.p.track)}</div>
            ${r.p.project ? `<div class="pod-proj">${esc(r.p.project)}</div>` : ''}
            ${r.p.audio ? `<div class="pod-player">${playerHTML(r.p.audio)}</div>` : ''}
        </div>`).join('');
}

function renderRows(rows) {
    const q = query.trim().toLowerCase();
    const rest = rows.slice(3).filter(r => !q ||
        r.p.author.toLowerCase().includes(q) ||
        r.p.track.toLowerCase().includes(q) ||
        (r.p.project || '').toLowerCase().includes(q));

    el('rows').innerHTML = rest.map(r => {
        const d = r.rawPlace - r.place;
        const shift = d > 0 ? `<span class="shift up">▲${d}</span>`
                    : d < 0 ? `<span class="shift down">▼${-d}</span>` : '';
        return `<div class="row ${r.raw === 0 ? 'zero' : ''}" data-id="${r.p.id}">
            <div class="r-place">${r.place}${shift}</div>
            <div>
                <div class="r-author">${esc(r.p.author)}<span class="badge ${r.p.isJudge ? '' : 'no'}" title="${
                    r.p.isJudge ? 'участвовал в голосовании' : 'не участвовал в голосовании'}">⚖</span></div>
                <div class="r-track">${esc(r.p.track)}${r.p.project ? ' · ' + esc(r.p.project) : ''}</div>
            </div>
            <div class="r-num r-raw">${fmt(r.raw)}</div>
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

    const gotList = r.voters.length
        ? `<ul class="vlist">${r.voters.map(([jname, v]) => {
            const jp = byAuthor.get(jname);
            const nm = jp && jp.vk
                ? `<a href="${esc(jp.vk)}" target="_blank" rel="noopener">${esc(jname)}</a>`
                : esc(jname);
            return `<li><span>${nm}</span><span class="pts">${nameOf(v)} · ${fmt(v, 1)}</span></li>`;
        }).join('')}</ul>`
        : '<p class="empty">За этот трек никто не отдал голос.</p>';

    const own = p.isJudge ? (() => {
        const b = ballots.get(p.author);
        if (!b.length) return '<p class="empty">Бюллетень пуст.</p>';
        const warn = b.length !== 4
            ? `<div class="m-note">Бюллетень неполный: ${b.length} ${b.length === 1 ? 'оценка' : 'оценки'} вместо 4.</div>`
            : '';
        return warn + `<ul class="vlist">${b.map(x => {
            const t = x.target;
            const nm = t.vk
                ? `<a href="${esc(t.vk)}" target="_blank" rel="noopener">${esc(t.author)}</a>`
                : esc(t.author);
            return `<li><span>${nm} — <i>${esc(t.track)}</i></span>
                 <span class="pts">${fmt(x.pts, 1)}</span></li>`;
        }).join('')}</ul>`;
    })() : '<p class="empty">Не участвовал(а) в голосовании.</p>';

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
            <div class="m-cell"><div class="v">×${fmt(r.k, 3)}</div><div class="k">коэффициент</div></div>
            <div class="m-cell"><div class="v">${fmt(r.final)}</div><div class="k">итог</div></div>
            <div class="m-cell"><div class="v">${r.voters.length}</div><div class="k">голосов за него</div></div>
        </div>
        <div class="m-h">Голоса</div>
        ${gotList}
        <div class="m-h">Бюллетень</div>
        ${own}`;
    el('overlay').style.display = 'flex';
}

el('corr').addEventListener('change', render);
el('search').addEventListener('input', e => { query = e.target.value; renderRows(current); });
el('rows').addEventListener('click', e => {
    const row = e.target.closest('.row[data-id]');
    if (row) openModal(+row.dataset.id);
});
el('podium').addEventListener('click', e => {
    if (e.target.closest('.pod-player')) return;   // клик по плееру — не открывать попап
    const pod = e.target.closest('.pod[data-id]');
    if (pod) openModal(+pod.dataset.id);
});
el('modalX').addEventListener('click', () => el('overlay').style.display = 'none');
el('overlay').addEventListener('click', e => { if (e.target.id === 'overlay') el('overlay').style.display = 'none'; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') el('overlay').style.display = 'none'; });

render();
