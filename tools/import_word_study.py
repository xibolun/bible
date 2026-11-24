"""Build offline word study without changing scripture text or annotation offsets.

Export the pinned CrossWire StrongsGreek 2.0 module with `mod2imp StrongsGreek`.
Inputs and source attribution are recorded in data/word-study-manifest.json.
"""
import argparse
import gzip
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from pathlib import Path

from import_data import ROOT, books, osis_plain

HEBREW_COMMIT = '21c9add13bc727d3a951361778e97e3ff7afd1ce'
PINS = {
    'hebrew': 'a628f4f89f8bdaf2483fd3faf1abc8653cc6717758dfc9f24beb7571d9bdd0c4',
    'greek_archive': '38f7d29db912d7c6a416cf19bfdefd9bdb9882193634229210a0d10b5cccc434',
    'greek': '1d066cb16e2f56d6d80bd2434e15e3928aeb390321cf4fbd8c6468754d228ead',
    'kjv': '0530658ddc2f0ea6a570ce8df1a45d7e690759f1d22492093e6838385e02a257',
}


def plain(element):
    return re.sub(r'\s+', ' ', ''.join(element.itertext())).strip() if element is not None else ''


def hebrew_entries(source):
    ns = {'h': 'http://openscriptures.github.com/morphhb/namespace'}
    result = {}
    for node in ET.fromstring(source):
        word = node.find('h:w', ns)
        code = node.attrib['id']
        result[code] = dict(id=code, lemma=plain(word), transliteration=word.get('xlit', ''),
                            pronunciation=word.get('pron', ''), language='Aramaic' if word.get('{http://www.w3.org/XML/1998/namespace}lang') == 'arc' else 'Hebrew',
                            definition=' '.join(plain(node.find('h:'+tag, ns)) for tag in ['source', 'meaning', 'usage']).strip(),
                            source='OSHB Strong’s Hebrew · CC BY 4.0')
    return result


def greek_entries(source):
    result = {}
    for code, markup in re.findall(r'^\$\$\$(\d+)\n(.*?)(?=^\$\$\$|\Z)', source, re.M | re.S):
        if int(code) == 0:
            continue
        node = ET.fromstring(markup.strip())
        code = 'G'+str(int(code))
        result[code] = dict(id=code, lemma=plain(node.find('orth')), language='Greek',
                            transliteration=plain(node.find("orth[@type='trans']")),
                            pronunciation=plain(node.find('pron')),
                            definition=plain(node.find('def')) or plain(node),
                            source='CrossWire Strong’s Greek 2.0 · Public Domain')
    return result


class Words(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.excluded = 0
        self.current = None
        self.words = []

    def handle_starttag(self, tag, attrs):
        if tag in ('note', 'title'):
            self.excluded += 1
        if tag == 'w' and not self.excluded:
            values = dict(attrs)
            codes = re.findall(r'strong:([HG])0*(\d+)(?!\d)', values.get('lemma', values.get('savlm', '')))
            self.current = {'text': '', 'strongs': list(dict.fromkeys(prefix+str(int(number)) for prefix, number in codes if int(number)))}

    def handle_data(self, text):
        if self.current is not None and not self.excluded:
            self.current['text'] += text

    def handle_endtag(self, tag):
        if tag == 'w' and self.current is not None and not self.excluded:
            if self.current['strongs']:
                self.current['text'] = re.sub(r'\s+', ' ', self.current['text']).strip()
                self.words.append(self.current)
            self.current = None
        if tag in ('note', 'title'):
            self.excluded = max(0, self.excluded-1)


def verse_words(markup):
    parser = Words()
    parser.feed(markup)
    parser.close()
    return parser.words


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in PINS:
        parser.add_argument('--'+name.replace('_', '-'), required=True, type=Path)
    args = parser.parse_args()
    for key, expected in PINS.items():
        if hashlib.sha256(getattr(args, key).read_bytes()).hexdigest() != expected:
            raise ValueError('Use pinned '+key+' source')
    entries = hebrew_entries(args.hebrew.read_bytes()) | greek_entries(args.greek.read_text(encoding='utf-8'))
    normalized_chapters = {}
    names = {book['englishName']: book['id'] for book in books()}
    verses = {}
    for line in args.kjv.read_text(encoding='utf-8').splitlines():
        match = re.fullmatch(r'(.+?) (\d+):(\d+[a-z]?) (.*)', line)
        if not match:
            if not line.strip() or line.startswith('[ Testament '):
                continue
            raise ValueError('Invalid KJV line')
        name, chapter, label, markup = match.groups()
        if int(chapter) == 0 or int(re.match(r'\d+', label)[0]) == 0:
            continue
        key = f'{names[name]}/{chapter}/{label}'
        if key in verses:
            raise ValueError('KJV text or reference mismatch: '+key)
        normalized_chapters.setdefault(f'kjv/{names[name]}/{chapter}', []).append(dict(label=label, text=osis_plain(markup)))
        verses[key] = verse_words(markup)
    plain_hash = hashlib.sha256(json.dumps(normalized_chapters, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    if plain_hash != '4fdc37c1b21153507e3c06c23fdf989d266f18edafa51c5d9284d3ecfa2b44bf':
        raise ValueError('Pinned KJV word-study source text changed')
    if len(verses) != 31102 or len(entries) < 14000:
        raise ValueError('Incomplete word study data')
    raw = json.dumps(dict(entries=entries, verses=verses), ensure_ascii=False, separators=(',', ':')).encode()
    compressed = gzip.compress(raw, mtime=0)
    (ROOT/'internal/bible/word-study.json.gz').write_bytes(compressed)
    (ROOT/'frontend/public/word-study.json').write_bytes(raw)
    manifest = dict(retrieved='2026-11-17', inputs=PINS, hebrewCommit=HEBREW_COMMIT,
                    sources=[f'https://raw.githubusercontent.com/openscriptures/HebrewLexicon/{HEBREW_COMMIT}/HebrewStrong.xml',
                             'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/StrongsGreek.zip',
                             'https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/KJV.zip'],
                    conversion='Strong’s definitions to plain text; KJV OSIS lemma/savlm groups, source verse labels; no translated-text alignment',
                    entries=len(entries), verses=len(verses),
                    plainSha256=hashlib.sha256(raw).hexdigest(), datasetSha256=hashlib.sha256(compressed).hexdigest())
    (ROOT/'data/word-study-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n', encoding='utf-8')
    print(f'Generated {len(entries)} dictionary entries and {len(verses)} verse records')


if __name__ == '__main__':
    main()
