#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Анализатор ритма стихов (по мотивам Fet.Online).
Строит послоговую карту 0/1/2 (безударный/слабоударный/ударный),
размер строк, схему ударений, проверяет ударения ПО СЛОВАРЮ.

Использование:
  python3 scan.py текст.txt
  echo "строка стиха" | python3 scan.py -
  python3 scan.py текст.txt --map   # только карта слогов

Ударения берутся из all_accents.tsv (словарь), а не «на память».
Односложные служебные слова считаются безударными (клитики).
Слова не из словаря помечаются '?' — ударение оценивается эвристически.
"""
import sys, os, re, functools

DATA = os.path.join(os.path.dirname(__file__), "all_accents.tsv")
VOWELS = "аеёиоуыэюя"
# служебные односложные — обычно безударные (клитики)
CLITICS = set("а и но да же ли бы ль в во к ко с со у о об от до за на по из под над "
              "не ни что как бы же ведь вот там тут мне мной я ты он мы вы их им её его "
              "де ка то се ж".split())

@functools.lru_cache(maxsize=1)
def load():
    d = {}
    with open(DATA, encoding="utf-8") as f:
        for line in f:
            p = line.rstrip("\n").split("\t")
            if len(p)!=2 or "^" not in p[1]: continue
            plain, marked = p
            idx = marked.find("^")  # позиция ударной гласной в чистом слове
            d.setdefault(plain.lower(), idx)
    return d

def count_vowels(w):
    w = w.lower()
    return [i for i,c in enumerate(w) if c in VOWELS]

def stressed_vowel_index(word):
    """номер ударной ГЛАСНОЙ (0-based среди гласных) или None."""
    d = load()
    w = word.lower()
    if w in d:
        cidx = d[w]  # позиция в буквах
        vlist = count_vowels(w)
        for n,vi in enumerate(vlist):
            if vi==cidx: return n, True  # словарное
        return None, True
    # эвристика: если 1 гласная — она ударная; иначе неизвестно
    vlist = count_vowels(w)
    if len(vlist)==1: return 0, False
    if "ё" in w:  # ё всегда ударная
        for n,vi in enumerate(vlist):
            if w[vi]=="ё": return n, False
    return None, False

def _is_body(l):
    """строка — это тело стиха (а не тег/метаданные/заголовок/латиница)?"""
    s = l.strip()
    if not s: return True  # пустые сохраняем как разделители строф
    if re.match(r"^[\[(]", s): return False
    if "genre:" in l: return False
    if re.search(r"\bv\d+\b", l) or re.search(r"\(v\d", l): return False
    if "ПОСЛЕДНИЙ ВАГОН" in s or "СХЕМА" in s: return False
    cyr = len(re.findall(r"[А-Яа-яЁё]", s))
    lat = len(re.findall(r"[A-Za-z]", s))
    if lat > cyr: return False
    if s.isupper() and len(s.split())<=3: return False
    return True

def clean_words(line):
    # оставляем буквы/дефис как разделители слов
    return re.findall(r"[А-Яа-яЁё\-]+", line)

def split_syllables(word):
    """бьёт слово на слоги по гласным: слог = согласные + гласная.
    остаточные согласные в конце приклеиваются к последнему слогу.
    возвращает список строк-слогов, сохраняя исходный регистр."""
    vlist = count_vowels(word)
    if not vlist:
        return [word] if word else []
    syls = []
    start = 0
    for k, vi in enumerate(vlist):
        if k == len(vlist)-1:
            # последний слог — до конца слова (забирает хвост согласных)
            syls.append(word[start:])
        else:
            # граница: после текущей гласной оставляем согласные следующему слогу,
            # кроме одной (открытый слог). Простое правило: режем сразу после гласной,
            # но одиночную согласную между гласными отдаём следующему слогу.
            nxt = vlist[k+1]
            cons_between = nxt - vi - 1
            if cons_between <= 1:
                cut = vi + 1                    # открытый слог: во-да
            else:
                cut = vi + 1 + (cons_between-1)  # часть согласных к текущему: пол-ночь
            syls.append(word[start:cut])
            start = cut
    return syls

def line_syllable_cells(line):
    """список ячеек: РОВНО одна клетка на слог (квадратная сетка).
    Пробелы и знаки препинания приклеиваются к ПРЕДЫДУЩЕМУ слогу
    (в поле 'suf'), чтобы не ломать колонки. Формат клетки:
    {'t':слог, 'suf':хвост_знаков_и_пробел, 'c':код}."""
    # разбор строки на токены с сохранением позиций слов и «мусора» между ними
    tokens = re.findall(r"[А-Яа-яЁё\-]+|[^А-Яа-яЁё\-]+", line)
    cells = []
    pending_pre = ""  # префикс (напр. предлог без гласной 'в','с'), ждёт следующего слога
    for tok in tokens:
        if re.match(r"[А-Яа-яЁё\-]+", tok):
            w = tok
            vlist = count_vowels(w)
            if not vlist:
                # слово без гласной (в, с, к) — приклеить к следующему слогу как префикс
                if cells: cells[-1]["suf"] += w + " "
                else: pending_pre += w + " "
                continue
            nsyl = len(vlist)
            wl = w.lower()
            syls = split_syllables(w)
            if nsyl == 1:
                codes = [0 if wl in CLITICS else 1]
            elif wl in CLITICS:
                codes = [0]*nsyl
            else:
                si, known = stressed_vowel_index(w)
                codes = []
                for n in range(nsyl):
                    if si is not None and n == si:
                        codes.append(2)
                    elif si is not None and nsyl>=4 and abs(n-si)>=2 and (n-si)%2==0:
                        codes.append(1)
                    else:
                        codes.append(0)
            for i,(t, c) in enumerate(zip(syls, codes)):
                if i==0 and pending_pre:
                    t = pending_pre + t; pending_pre = ""
                cells.append({"t": t, "suf": "", "c": c})
        else:
            # знаки/пробелы — в suffix последнего слога (или пропустить, если строка началась с них)
            if cells:
                cells[-1]["suf"] += tok
    return cells

def line_syllable_map(line):
    """возвращает (кол-во слогов, список кодов 0/1/2, есть_неизвестные)."""
    words = clean_words(line)
    codes = []
    unknown = False
    for w in words:
        vlist = count_vowels(w)
        if not vlist: continue
        nsyl = len(vlist)
        wl = w.lower()
        if nsyl==1:
            # клитика -> безударный(0); знаменательное односложное -> слабоударный(1)
            codes.append(0 if wl in CLITICS else 1)
            continue
        # двусложные предлоги/частицы тоже клитики
        if wl in CLITICS:
            codes.extend([0]*nsyl); continue
        si, known = stressed_vowel_index(w)
        if not known: unknown = True
        for n in range(nsyl):
            if si is not None and n==si:
                codes.append(2)      # главное ударение
            elif si is not None and nsyl>=4 and abs(n-si)>=2 and (n-si)%2==0:
                codes.append(1)      # побочное (слабоударное) в длинном слове
            else:
                codes.append(0)      # безударный
        if si is None:
            unknown = True
    return len(codes), codes, unknown

def analyze(lines):
    print("="*70)
    rows = []
    for ln in lines:
        if not ln.strip():
            rows.append(None); continue
        n, codes, unk = line_syllable_map(ln)
        rows.append((ln.strip(), n, codes, unk))
    # печать
    sizes = []
    for r in rows:
        if r is None:
            print(); continue
        ln,n,codes,unk = r
        mark = "".join(str(c) for c in codes)
        flag = " ?" if unk else ""
        print(f"[{n:>2}]{flag} {mark}")
        print(f"      {ln}")
        sizes.append(n)
    print("="*70)
    if sizes:
        from collections import Counter
        c = Counter(sizes)
        print(f"Размеры строк: {dict(sorted(c.items()))}")
        reg = len(c)<=2
        print(f"Регулярность размера: {'ДА' if reg else 'скачет — ' + str(sorted(set(sizes)))}")
        # статистика слогов
        allc = [x for r in rows if r for x in r[2]]
        tot=len(allc)
        z=allc.count(0); o=allc.count(1); t=allc.count(2)
        print(f"Гласные: безударные {z} | слабоударные {o} ({100*o//max(tot,1)}%) | ударные {t}")
        print("Норма слабоударных ~20-25%.")

def build_data(lines):
    """структура для HTML: список строф, каждая — список строк {n, codes, text, unk}."""
    strophes = []
    cur = []
    for ln in lines:
        if not ln.strip():
            if cur: strophes.append(cur); cur=[]
            continue
        n, codes, unk = line_syllable_map(ln)
        cells = line_syllable_cells(ln)
        cur.append({"n": n, "codes": codes, "text": ln.strip(), "unk": unk, "cells": cells})
    if cur: strophes.append(cur)
    return strophes

def render_html(strophes, title="Разбор строфы"):
    import html as _h, json
    tmpl = os.path.join(os.path.dirname(__file__), "strofa_template.html")
    with open(tmpl, encoding="utf-8") as f:
        t = f.read()
    return t.replace("__TITLE__", _h.escape(title)) \
            .replace("__DATA__", json.dumps(strophes, ensure_ascii=False))

def main():
    argv = sys.argv[1:]
    html_mode = "--html" in argv
    args = [a for a in argv if not a.startswith("--")]
    if not args:
        print(__doc__); return
    if html_mode:
        src = args[0]
        if src=="-":
            lines = sys.stdin.read().splitlines()
        else:
            lines = open(src, encoding="utf-8").read().splitlines()
        body = [l for l in lines if _is_body(l)]
        data = build_data(body)
        out = args[1] if len(args)>1 else (os.path.splitext(src)[0]+"_разбор.html" if src!="-" else "разбор.html")
        with open(out, "w", encoding="utf-8") as f:
            f.write(render_html(data, os.path.basename(src)))
        print(f"HTML: {out}")
        return
    src = args[0]
    if src=="-":
        lines = sys.stdin.read().splitlines()
    else:
        with open(src, encoding="utf-8") as f:
            lines = f.read().splitlines()
    body = [l for l in lines if _is_body(l)]
    analyze(body)

if __name__=="__main__":
    main()
