#!/usr/bin/env python3
"""Deterministic OEWN subset builder; Python stdlib only. Does not fetch data or generate teaching claims."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'data/wordnet/json'
OUT = ROOT / 'miniprogram'

def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n')

def main():
    if not SOURCE.is_dir():
        raise SystemExit('Missing OEWN JSON: download/extract per data/wordnet/README.md first.')
    entries, synsets = {}, {}
    for path in sorted(SOURCE.glob('*.json')):
        target = entries if path.name.startswith('entries-') else synsets
        target.update(json.loads(path.read_text()))
    selection = json.loads((ROOT / 'data/vocabulary/selection.json').read_text())
    notes = json.loads((ROOT / 'data/vocabulary/deep.json').read_text())
    basic = dict(line.split('\t', 1) for line in (ROOT / 'data/vocabulary/basic.tsv').read_text().splitlines())
    aliases = selection['aliases']
    words = selection['words']
    assert len(words) == len(set(words)) == 10000
    rows = []
    for word in words:
        senses, ipa = [], ''
        for pos, value in entries[word].items():
            if not ipa:
                pronunciations = value.get('pronunciation', [])
                ipa = pronunciations[0].get('value', '') if pronunciations else ''
            for sense in value.get('sense', []):
                syn = synsets[sense['synset']]
                if not syn.get('definition'): continue
                examples = [e if isinstance(e, str) else e.get('text', '') for e in syn.get('example', [])]
                members = [m if isinstance(m, str) else m[0] for m in syn.get('members', [])]
                senses.append({'id': sense['synset'], 'pos': pos, 'definition': '; '.join(syn['definition']), 'examples': examples, 'synonyms': [m for m in members if m != word]})
        assert senses, word
        # Deduplicate identical synsets appearing under multiple POS categories.
        senses = list({s['id']: s for s in senses}.values())
        row = {'id': 'w-' + word, 'word': word, 'ipa': ipa, 'variants': [a for a, target in aliases.items() if target == word], 'senses': senses}
        if word in basic: row['zh'] = basic[word]
        if word in notes:
            note = notes[word]
            assert note['senseId'] in [s['id'] for s in senses], word
            assert len(note['blocks']) == 6 and all(b['en'].strip() and b.get('zh', '').strip() for b in note['blocks'])
            assert 50 <= len(re.findall(r"[A-Za-z]+(?:['’-][A-Za-z]+)*", note['example'])) <= 100, word
            row['deep'] = {k: note[k] for k in ['senseId', 'blocks', 'status', 'version']}
            row['zh'] = note['gloss']
        rows.append(row)
    # Normal package assets: at most 1.45 MB per data file; all senses preserved.
    chunks, chunk, size = [], [], 2
    for row in rows:
        n = len(json.dumps(row, ensure_ascii=False, separators=(',', ':')).encode()) + 1
        if chunk and size + n > 1450000: chunks.append(chunk); chunk, size = [], 2
        chunk.append(row); size += n
    if chunk: chunks.append(chunk)
    catalog, packages = [], []
    for i, chunk in enumerate(chunks):
        name = 'worddata' + str(i)
        (OUT / name).mkdir(parents=True, exist_ok=True)
        (OUT / name / 'data.js').write_text('// Definitions: Open English Wordnet 2025, CC BY 4.0. Selected collection/order: CC BY-SA 4.0. See vocabulary/licenses and catalog attribution.\nmodule.exports=' + json.dumps(chunk, ensure_ascii=False, separators=(',', ':')) + ';\n')
        old = OUT / name / 'data.json'
        if old.exists(): old.unlink()
        # A minimal page makes each data package valid in the WeChat configuration.
        path = OUT / name / 'loader'
        path.with_suffix('.ts').write_text('Page({ data: {}, back() { wx.navigateBack(); } });\n')
        path.with_suffix('.wxml').write_text('<view class="page">此词包用于离线学习。<button bindtap="back">返回</button></view>\n')
        dump(path.with_suffix('.json'), {'usingComponents': {}})
        packages.append({'name': name, 'root': name, 'pages': ['loader']})
        for row in chunk:
            rank = words.index(row['word'])
            level = 'L4' if row['word'] in notes else 'L1' if rank < 1500 else 'L2' if rank < 3500 else 'L3' if rank < 6500 else 'L4'
            catalog.append({'id': row['id'], 'word': row['word'], 'level': level, 'shard': name, 'variants': row['variants'], 'deep': 'deep' in row})
    manifest = {'version': 'oewn-2025-v1', 'total': len(rows), 'deepCount': len(notes), 'chineseCount': sum('zh' in r for r in rows), 'shards': [p['name'] for p in packages], 'definitionsLicense': 'CC BY 4.0', 'selectionLicense': 'CC BY-SA 4.0', 'selectionAttribution': selection['attribution'], 'selectionSource': selection['source'], 'selectionLicenseUrl': selection['licenseUrl'], 'levelStatus': 'frequency bands with editorial overrides; not verified curriculum', 'deepStatus': 'original editorial notes; not independent expert review'}
    (OUT / 'core/vocabulary/catalog.js').write_text('// Selection and level index: CC BY-SA 4.0. Attribution embedded in manifest.\nmodule.exports=' + json.dumps({'manifest': manifest, 'entries': catalog}, ensure_ascii=False, separators=(',', ':')) + ';\n')
    old = OUT / 'core/vocabulary/catalog.json'
    if old.exists(): old.unlink()
    dispatch = "import { Entry } from './types';\ndeclare const require: { async(path: string): Promise<Entry[]> };\nexport function loadShard(name: string): Promise<Entry[]> {\n if (typeof require.async !== 'function') return Promise.reject(new Error('请升级微信以支持分包异步加载'));\n switch(name) {\n"
    for p in packages:
        dispatch += " case '" + p['name'] + "': return require.async('../../" + p['name'] + "/data.js');\n"
    dispatch += " default: return Promise.reject(new Error('未知词包'));\n }\n}\n"
    (OUT / 'core/vocabulary/shards.ts').write_text(dispatch)
    app = json.loads((OUT / 'app.json').read_text())
    route = 'pages/vocabulary/vocabulary'
    if route not in app['pages']: app['pages'].append(route)
    if not any(t['pagePath'] == route for t in app['tabBar']['list']): app['tabBar']['list'].insert(1, {'pagePath': route, 'text': '背词'})
    app['subPackages'] = [{'name': 'vocabulary', 'root': 'vocabulary', 'pages': ['pages/' + n + '/' + n for n in ['library', 'study', 'word', 'settings', 'ask']]}] + packages
    (OUT / 'app.json').write_text(json.dumps(app, ensure_ascii=False, indent=2) + '\n')
    dump(ROOT / 'data/vocabulary/build-report.json', {'manifest': manifest, 'packages': [{'name': p['name'], 'bytes': (OUT / p['root'] / 'data.js').stat().st_size, 'sha256': hashlib.sha256((OUT / p['root'] / 'data.js').read_bytes()).hexdigest()} for p in packages]})
    print(json.dumps({'words': len(rows), 'deep': len(notes), 'shards': len(packages), 'bytes': sum((OUT / p['root'] / 'data.js').stat().st_size for p in packages)}))

if __name__ == '__main__': main()
