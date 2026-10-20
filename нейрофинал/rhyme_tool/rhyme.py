#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Подборщик рифм по памятке (ассонанс по ударному ядру, пары согласных/гласных,
типы клаузул). Использует датасет ударений all_accents.tsv (Koziev, CC0).

Формат датасета: слово<TAB>слово_с_^ударением  (^ стоит ПЕРЕД ударной гласной).

Примеры:
  python3 rhyme.py оружие              # рифмы к слову
  python3 rhyme.py оружие --klauzula dactyl --limit 40
  python3 rhyme.py носа --pos-diff     # только другие части речи (эвристика)
  python3 rhyme.py --pair носа заноза  # проверить конкретную пару
"""
import sys, os, argparse, functools

DATA = os.path.join(os.path.dirname(__file__), "all_accents.tsv")

VOWELS = "аеёиоуыэюя"
# классы гласных по огласовке (ассонансные пары): а/я, о/ё, у/ю, э/е, ы/и
VOWEL_CLASS = {
    "а":"A","я":"A", "о":"O","ё":"O", "у":"U","ю":"U",
    "э":"E","е":"E", "ы":"I","и":"I",
}
# классы согласных (близкие пары считаем созвучными)
CONS_CLASS = {}
for group in [
    "бп","вф","гк","дт","жш","зс",   # звонк/глух
    "мн",                              # носовые сонорные
    "лр",                              # плавные сонорные
    "кх","гх",                         # фрикативные заднеязычные
    "сцчщз",                           # свистящие/шипящие/аффрикаты (одобрено автором)
    "й",
]:
    for ch in group:
        CONS_CLASS.setdefault(ch, set()).add(group)

def cons_key(ch):
    """каноничный ключ класса согласного (объединение групп, куда он входит)."""
    ch = ch.lower()
    if ch in CONS_CLASS:
        # берём отсортированное объединение всех групп символа
        return "".join(sorted(set().union(*[set(g) for g in CONS_CLASS[ch]])))
    return ch

def vowel_key(ch):
    return VOWEL_CLASS.get(ch.lower(), ch.lower())

def parse_accent(marked):
    """'зан^оза' -> (чистое слово, индекс ударной гласной)."""
    idx = marked.find("^")
    if idx == -1:
        return marked, -1
    word = marked.replace("^", "")
    # ударная гласная — та, что стояла сразу после ^
    return word, idx  # idx в marked == позиция ударной гласной в word

def syllables_after(word, stress_idx):
    """сколько гласных ПОСЛЕ ударной (0=муж,1=жен,2=дактиль,3+=гипер)."""
    return sum(1 for c in word[stress_idx+1:] if c in VOWELS)

def klauzula(word, stress_idx):
    n = syllables_after(word, stress_idx)
    return {0:"male",1:"fem",2:"dactyl"}.get(n, "hyper")

def rhyme_signature(word, stress_idx, strict=False):
    """
    Фонетическая подпись рифмо-хвоста от ударной гласной.
    strict=True — точнее (реальные буквы), False — по классам (ассонанс).
    Возвращает кортеж классов: (ядро_согл_до, гласная, хвост...).
    """
    tail = word[stress_idx:]  # от ударной гласной до конца
    pre = word[stress_idx-1] if stress_idx > 0 and word[stress_idx-1] not in VOWELS else ""
    sig = []
    if pre:
        sig.append(("C", pre if strict else cons_key(pre)))
    for ch in tail:
        if ch in VOWELS:
            sig.append(("V", ch if strict else vowel_key(ch)))
        else:
            sig.append(("C", ch if strict else cons_key(ch)))
    return tuple(sig)

def core_signature(word, stress_idx, strict=False):
    """только УДАРНОЕ ЯДРО: согл-до + ударная гласная + согл-после."""
    pre = word[stress_idx-1] if stress_idx>0 and word[stress_idx-1] not in VOWELS else ""
    vow = word[stress_idx]
    post = ""
    if stress_idx+1 < len(word) and word[stress_idx+1] not in VOWELS:
        post = word[stress_idx+1]
    def ck(c): return (c if strict else cons_key(c)) if c else ""
    def vk(c): return c if strict else vowel_key(c)
    return (ck(pre), vk(vow), ck(post))

@functools.lru_cache(maxsize=1)
def load():
    rows = []
    with open(DATA, encoding="utf-8") as f:
        for line in f:
            parts = line.rstrip("\n").split("\t")
            if len(parts) != 2: continue
            plain, marked = parts
            if "^" not in marked: continue
            word, sidx = parse_accent(marked)
            if sidx < 0 or sidx >= len(word) or word[sidx] not in VOWELS:
                continue
            if not word.isalpha(): continue
            rows.append((word, sidx))
    return rows

def score(a_word, a_i, b_word, b_i):
    """оценка созвучия 0..100 + флаги."""
    # ядро
    ca = core_signature(a_word, a_i)
    cb = core_signature(b_word, b_i)
    core_match = (ca == cb)
    # хвост целиком (ассонанс)
    sa = rhyme_signature(a_word, a_i)
    sb = rhyme_signature(b_word, b_i)
    # длина совпадения хвоста
    common = sum(1 for x,y in zip(sa, sb) if x==y)
    tail_ratio = common / max(len(sa), len(sb))
    s = 0
    if ca[1]==cb[1]: s += 30            # ударная гласная (класс) совпала
    if ca[2]==cb[2] and ca[2]!="": s+=20 # согл после ударной
    if ca[0]==cb[0] and ca[0]!="": s+=10 # согл до ударной
    s += int(tail_ratio*40)
    return s, core_match

PREFIXES = ["вполо","пере","пред","подо","разо","вос","воз","обо","про","при","пре",
            "под","над","раз","рас","без","бес","изо","низ","нис","от","об","до","за",
            "на","по","вы","во","в","с","у","из","не"]

def strip_prefix(w):
    for p in sorted(PREFIXES, key=len, reverse=True):
        if w.startswith(p) and len(w)-len(p) >= 3:
            return w[len(p):]
    return w

def is_cognate(a, b):
    """эвристика однокоренных: сравниваем корни после снятия приставок."""
    ra, rb = strip_prefix(a), strip_prefix(b)
    # общий начальный сегмент корней
    m = 0
    for x,y in zip(ra,rb):
        if x==y: m+=1
        else: break
    if m >= 4:
        return True
    # либо один корень входит в другой (ворота/оборота -> орота)
    short, long = sorted([ra,rb], key=len)
    return len(short) >= 4 and short in long

def find(target, klauzula_filter=None, limit=30, min_score=55, exclude_cognate=True):
    rows = load()
    # найти цель
    tgt = [(w,i) for (w,i) in rows if w==target.lower()]
    if not tgt:
        print(f"! слово '{target}' не найдено в словаре", file=sys.stderr)
        return []
    tw, ti = tgt[0]
    tkl = klauzula(tw, ti)
    tcore = core_signature(tw, ti)
    out = []
    seen = set()
    for (w,i) in rows:
        if w==tw or w in seen: continue
        if klauzula_filter and klauzula(w,i)!=klauzula_filter: continue
        c = core_signature(w,i)
        if c[1]!=tcore[1]:  # ударная гласная-класс должна совпасть
            continue
        sc, core_match = score(tw,ti,w,i)
        if sc < min_score: continue
        if exclude_cognate and is_cognate(tw,w): continue
        seen.add(w)
        out.append((sc, klauzula(w,i), w))
    out.sort(reverse=True)
    return tw, ti, tkl, out[:limit]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("word", nargs="?")
    ap.add_argument("--pair", nargs=2, metavar=("A","B"))
    ap.add_argument("--klauzula", choices=["male","fem","dactyl","hyper"])
    ap.add_argument("--limit", type=int, default=30)
    ap.add_argument("--min-score", type=int, default=55)
    ap.add_argument("--allow-cognate", action="store_true")
    args = ap.parse_args()

    if args.pair:
        rows = load()
        res = {}
        for name in args.pair:
            hit = [(w,i) for (w,i) in rows if w==name.lower()]
            if not hit:
                print(f"! '{name}' не найдено"); return
            res[name]=hit[0]
        (aw,ai),(bw,bi)=res[args.pair[0]],res[args.pair[1]]
        sc, cm = score(aw,ai,bw,bi)
        print(f"{aw} [{klauzula(aw,ai)}] core={core_signature(aw,ai,strict=True)}")
        print(f"{bw} [{klauzula(bw,bi)}] core={core_signature(bw,bi,strict=True)}")
        print(f"score={sc}/100  ядро_совпадает={cm}  однокоренные≈{is_cognate(aw,bw)}")
        return

    if not args.word:
        ap.print_help(); return
    r = find(args.word, args.klauzula, args.limit, args.min_score, not args.allow_cognate)
    if not r: return
    tw,ti,tkl,out = r
    print(f"# рифмы к '{tw}' (ядро {core_signature(tw,ti,strict=True)}, клаузула {tkl})")
    print(f"{'score':>5}  {'клаузула':<8} слово")
    for sc,kl,w in out:
        print(f"{sc:>5}  {kl:<8} {w}")

if __name__=="__main__":
    main()
