"""Normalize the licensed FHL CBOL Chinese dictionary, retaining source wording.

The independent Chinese dictionary remains GNU FDL 1.1-or-later. Its verbatim
transparent source dumps, publisher notice and license ship in licenses/word-study-fhl.
"""
import argparse
import gzip
import hashlib
import json
import re
import tarfile
from pathlib import Path

from import_data import ROOT

PINS = {'hebrew': 'e82f47aa3aa70e147323a988419c62a1661795d7d5191511af8b90705dde1846',
        'greek': '4bf5e01643f6fe8769b4de94e20c19756ba500beb6eab73cfe0690f78b781985'}


def decode_field(value):
    if value == '\\N':
        return ''
    return value.replace('\\r\\n', '\n').replace('\\n', '\n').replace('\\t', '\t').replace('\\\\', '\\')


def entries(source, prefix):
    result = {}
    for line in source.splitlines():
        fields = line.split('^', 6)
        if len(fields) != 7 or not re.fullmatch(r'\d+[a-z]?', fields[0]):
            raise ValueError('Invalid FHL dictionary record')
        if not fields[0].isdigit():
            continue  # Supplemental FHL suffix codes are not canonical Strong's numbers.
        code = prefix+str(int(fields[0]))
        if code in result:
            raise ValueError('Duplicate FHL entry: '+code)
        definition = decode_field(fields[1]).strip()
        if definition:
            result[code] = {'definition': definition, 'lemma': decode_field(fields[5]).strip(),
                            'source': '信望愛資訊中心 CBOL 原文字典 · GNU FDL 1.1 或更新版本'}
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--hebrew', required=True, type=Path)
    parser.add_argument('--greek', required=True, type=Path)
    args = parser.parse_args()
    output = {}
    legal = ROOT/'licenses/word-study-fhl'
    legal.mkdir(exist_ok=True)
    for key, prefix, name in [('hebrew', 'H', 'dhfhl'), ('greek', 'G', 'dgfhl')]:
        archive = getattr(args, key).read_bytes()
        if hashlib.sha256(archive).hexdigest() != PINS[key]:
            raise ValueError('Use pinned FHL '+key+' archive')
        with tarfile.open(getattr(args, key)) as source:
            raw = source.extractfile(name).read()
        output.update(entries(raw.decode('utf-8'), prefix))
        # Transparent source including attribution fields is retained unchanged.
        (legal/(name+'.txt')).write_bytes(raw)
    if len(output) < 14000 or 'H430' not in output or 'G3056' not in output:
        raise ValueError('Incomplete Chinese dictionary')
    raw = json.dumps(output, ensure_ascii=False, separators=(',', ':')).encode()
    compressed = gzip.compress(raw, mtime=0)
    (ROOT/'internal/bible/chinese-dictionary.json.gz').write_bytes(compressed)
    (ROOT/'frontend/public/chinese-dictionary.json').write_bytes(raw)
    manifest = dict(retrieved='2026-11-17', inputs=PINS, entries=len(output),
                    sources=['https://bible.fhl.net/public/dhfhl.tgz', 'https://bible.fhl.net/public/dgfhl.tgz'],
                    license='GNU FDL 1.1-or-later', copyright='信望愛資訊中心 / FHL CBOL contributors',
                    notice='https://www.fhl.net/main/fhl/fhl8.html',
                    conversion='Separate Chinese dictionary; decode dump newline escapes, preserve Traditional Chinese wording and plain-text references; skip empty records and supplemental suffix codes',
                    datasetSha256=hashlib.sha256(compressed).hexdigest(), plainSha256=hashlib.sha256(raw).hexdigest())
    (ROOT/'data/chinese-dictionary-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'Generated {len(output)} licensed Chinese dictionary entries')


if __name__ == '__main__':
    main()
