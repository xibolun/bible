"""Rebuild immutable text from pinned publisher archives and a plain SWORD export.

SWORD export (no optional annotation filters):
diatheke -b ChiUns -f plain -k 'Genesis 1:1-Revelation 22:21'
mod2vpl KJV 1  # raw OSIS records; this importer removes annotations structurally
This importer retains verse text only. Separate word-study importers preserve
Strong's associations without changing this dataset or its annotation offsets.
"""
import argparse
import gzip
import hashlib
import json
import re
import zipfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
METADATA = '''GEN|创世记|创|Genesis|50
EXO|出埃及记|出|Exodus|40
LEV|利未记|利|Leviticus|27
NUM|民数记|民|Numbers|36
DEU|申命记|申|Deuteronomy|34
JOS|约书亚记|书|Joshua|24
JDG|士师记|士|Judges|21
RUT|路得记|得|Ruth|4
1SA|撒母耳记上|撒上|I Samuel|31
2SA|撒母耳记下|撒下|II Samuel|24
1KI|列王纪上|王上|I Kings|22
2KI|列王纪下|王下|II Kings|25
1CH|历代志上|代上|I Chronicles|29
2CH|历代志下|代下|II Chronicles|36
EZR|以斯拉记|拉|Ezra|10
NEH|尼希米记|尼|Nehemiah|13
EST|以斯帖记|斯|Esther|10
JOB|约伯记|伯|Job|42
PSA|诗篇|诗|Psalms|150
PRO|箴言|箴|Proverbs|31
ECC|传道书|传|Ecclesiastes|12
SNG|雅歌|歌|Song of Solomon|8
ISA|以赛亚书|赛|Isaiah|66
JER|耶利米书|耶|Jeremiah|52
LAM|耶利米哀歌|哀|Lamentations|5
EZK|以西结书|结|Ezekiel|48
DAN|但以理书|但|Daniel|12
HOS|何西阿书|何|Hosea|14
JOL|约珥书|珥|Joel|3
AMO|阿摩司书|摩|Amos|9
OBA|俄巴底亚书|俄|Obadiah|1
JON|约拿书|拿|Jonah|4
MIC|弥迦书|弥|Micah|7
NAM|那鸿书|鸿|Nahum|3
HAB|哈巴谷书|哈|Habakkuk|3
ZEP|西番雅书|番|Zephaniah|3
HAG|哈该书|该|Haggai|2
ZEC|撒迦利亚书|亚|Zechariah|14
MAL|玛拉基书|玛|Malachi|4
MAT|马太福音|太|Matthew|28
MRK|马可福音|可|Mark|16
LUK|路加福音|路|Luke|24
JHN|约翰福音|约|John|21
ACT|使徒行传|徒|Acts|28
ROM|罗马书|罗|Romans|16
1CO|哥林多前书|林前|I Corinthians|16
2CO|哥林多后书|林后|II Corinthians|13
GAL|加拉太书|加|Galatians|6
EPH|以弗所书|弗|Ephesians|6
PHP|腓立比书|腓|Philippians|4
COL|歌罗西书|西|Colossians|4
1TH|帖撒罗尼迦前书|帖前|I Thessalonians|5
2TH|帖撒罗尼迦后书|帖后|II Thessalonians|3
1TI|提摩太前书|提前|I Timothy|6
2TI|提摩太后书|提后|II Timothy|4
TIT|提多书|多|Titus|3
PHM|腓利门书|门|Philemon|1
HEB|希伯来书|来|Hebrews|13
JAS|雅各书|雅|James|5
1PE|彼得前书|彼前|I Peter|5
2PE|彼得后书|彼后|II Peter|3
1JN|约翰一书|约一|I John|5
2JN|约翰二书|约二|II John|1
3JN|约翰三书|约三|III John|1
JUD|犹大书|犹|Jude|1
REV|启示录|启|Revelation of John|22'''


def books():
    result = []
    for i, line in enumerate(METADATA.splitlines()):
        ident, name, short, english, chapters = line.split('|')
        result.append(dict(id=ident, name=name, abbreviation=short, englishName=english,
                           testament='OT' if i < 39 else 'NT', chapters=int(chapters)))
    return result


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class ScripturePlain(HTMLParser):
    """Keep verse words, divine-name capitalization, and no OSIS annotations."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts=[];self.excluded=0;self.divine=0

    def handle_starttag(self,tag,attrs):
        if tag in ('note','title'):self.excluded+=1
        if tag=='divinename':self.divine+=1
        if tag in ('lb','p','div','l') and not self.excluded:self.parts.append(' ')

    def handle_endtag(self,tag):
        if tag in ('note','title'):self.excluded=max(0,self.excluded-1)
        if tag=='divinename':self.divine=max(0,self.divine-1)
        if tag in ('p','div','l') and not self.excluded:self.parts.append(' ')

    def handle_data(self,text):
        if not self.excluded:self.parts.append(text.upper() if self.divine else text)


def osis_plain(text):
    parser=ScripturePlain();parser.feed(text);parser.close()
    if parser.excluded:raise ValueError('Unclosed note/title in SWORD verse')
    return re.sub(r'\s+',' ',''.join(parser.parts)).strip()


def publisher_vpl(archive, member, skip_books=()):
    """Read publisher VPL without altering scripture or renumbering gaps."""
    aliases = {'SOL': 'SNG', 'EZE': 'EZK', 'JOE': 'JOL', 'NAH': 'NAM',
               'MAR': 'MRK', 'JOH': 'JHN', 'PHI': 'PHP', 'JAM': 'JAS',
               '1JO': '1JN', '2JO': '2JN', '3JO': '3JN'}
    canon = {book['id']: book['chapters'] for book in books()}
    seen = set()
    with zipfile.ZipFile(archive) as source:
        for line in source.read(member).decode('utf-8-sig').splitlines():
            if not line.strip():
                continue
            match = re.fullmatch(r'([A-Z0-9]{3}) (\d+):(\d+[a-z]?) (.*)', line)
            if not match:
                raise ValueError(f'Unrecognized {member} source line: {line[:80]}')
            book, ch, verse, text = match.groups()
            if book in skip_books:
                continue
            book = aliases.get(book, book)
            chapter = int(ch)
            if book not in canon or not 1 <= chapter <= canon[book] or int(re.match(r'\d+', verse).group()) < 1:
                raise ValueError(f'Invalid {member} reference: {book} {ch}:{verse}')
            identity = (book, chapter, verse)
            if identity in seen:
                raise ValueError(f'Duplicate {member} reference: {identity}')
            seen.add(identity)
            if not text.strip():
                continue  # An empty publisher record marks an omitted verse.
            yield book, chapter, verse, text


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--chinese-archive', type=Path, required=True)
    p.add_argument('--chinese-export', type=Path, required=True)
    p.add_argument('--english-archive', type=Path, required=True)
    p.add_argument('--kjv-archive', type=Path, required=True)
    p.add_argument('--kjv-export', type=Path, required=True)
    p.add_argument('--darby-archive', type=Path, required=True)
    args = p.parse_args()
    pinned = [(args.chinese_archive,'37fcef08bd3b5f42f5d7b8e0a9326075f9f41e6aa39906711b092f105ae4857e'),
              (args.chinese_export,'6d6b67c46231adba2e516ad8277e08b2f08c2f86a54c96e0e6ddc477dd974dcf'),
              (args.english_archive,'7ebe6b7dc416ce63691d1a3889a06f841ccb7f414ada69be82da891f4b9be44f')]
    if any(digest(path)!=expected for path,expected in pinned):
        raise ValueError('Use the pinned CUV and WEBP inputs to preserve existing annotation data versions')
    if digest(args.darby_archive) != '7eb1df2a434f5bbd831591aa96c08e94b900b1458fda74ccf1d1739d5af73619':
        raise ValueError('Use the pinned eBible engDBY 2019-11-15 archive')
    catalog = books()
    names = {b['englishName']: b['id'] for b in catalog}
    chapters = {}
    seen = set()
    def add(translation, book, chapter, verse, text):
        text = text.strip()
        if not text:
            # The source exports empty entries for omitted verses; retain a hole.
            return
        key = f'{translation}/{book}/{chapter}'
        identity = f'{key}/{verse}'
        if identity in seen:
            raise ValueError(f'duplicate source reference {identity}')
        seen.add(identity)
        chapters.setdefault(key, []).append({'label': verse, 'text': text})

    def sword_export(path, module, translation):
        for line in path.read_text(encoding='utf-8').splitlines():
            m = re.fullmatch(r'(.+?) (\d+):(\d+[a-z]?): ?(.*)', line)
            if m:
                name, ch, verse, text = m.groups()
                if int(re.match(r'\d+',verse).group())==0:continue
                add(translation, names[name], int(ch), verse, text)
            elif line.strip() and line.strip() != f'({module})':
                raise ValueError(f'unrecognized {module} SWORD export line: {line[:80]}')
    sword_export(args.chinese_export,'ChiUns','cuv')
    if digest(args.kjv_archive)!='873815aa4b4123025616d1f41eae75f412111275f4c3884e36f92d4f46dcba1d':
        raise ValueError('Use the pinned CrossWire KJV 3.1 archive')
    for line in args.kjv_export.read_text(encoding='utf-8').splitlines():
        match=re.fullmatch(r'(.+?) (\d+):(\d+[a-z]?) (.*)',line)
        if not match:
            if not line.strip() or re.match(r'^\[ Testament [12] Heading \] ',line):continue
            raise ValueError(f'unrecognized KJV raw VPL line: {line[:80]}')
        name,chapter,verse,markup=match.groups()
        if int(chapter)==0 or int(re.match(r'\d+',verse).group())==0:continue
        add('kjv',names[name],int(chapter),verse,osis_plain(markup))
    for book, ch, verse, text in publisher_vpl(args.english_archive, 'engwebp_vpl.txt', skip_books=('PS2',)):
        add('webp', book, ch, verse, text)
    for book, ch, verse, text in publisher_vpl(args.darby_archive, 'engDBY_vpl.txt'):
        add('dby', book, ch, verse, text)
    translations = [
        dict(id='cuv', language='zh-Hans', name='和合本（简体）', abbreviation='CUV',
             dataVersion='ChiUns-3.1-'+digest(args.chinese_archive)[:12],
             sourceUrl='https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=ChiUns', license='Public Domain'),
        dict(id='webp', language='en', name='World English Bible', abbreviation='WEBP',
             dataVersion='engwebp-2026-11-13-'+digest(args.english_archive)[:12],
             sourceUrl='https://ebible.org/bible/details.php?id=engwebp', license='Public Domain'),
        dict(id='kjv', language='en', name='King James Version (1769)', abbreviation='KJV',
             dataVersion='KJV-3.1-'+digest(args.kjv_archive)[:12]+'-'+hashlib.sha256(json.dumps({key:value for key,value in chapters.items() if key.startswith('kjv/')},ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:12],
             sourceUrl='https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=KJV', license='GPL (CrossWire module; see source notice)'),
        dict(id='dby', language='en', name='Darby Translation（达秘译本）', abbreviation='DBY',
             dataVersion='engDBY-2019-11-15-'+digest(args.darby_archive)[:12]+'-'+hashlib.sha256(json.dumps({key:value for key,value in chapters.items() if key.startswith('dby/')},ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()[:12],
             sourceUrl='https://ebible.org/find/details.php?id=engDBY', license='Public Domain')]
    for t in translations:
        for b in catalog:
            for chapter in range(1, b['chapters']+1):
                assert chapters.get(f"{t['id']}/{b['id']}/{chapter}"), (t['id'], b['id'], chapter)
    data = dict(books=catalog, translations=translations, chapters=chapters)
    raw = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
    output = ROOT/'internal/bible/dataset.json.gz'
    output.write_bytes(gzip.compress(raw, mtime=0))
    public = ROOT/'frontend/public'; public.mkdir(parents=True, exist_ok=True)
    (public/'dataset.json').write_bytes(raw)
    sources = [
        dict(id='cuv', url='https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/ChiUns.zip',
             sha256=digest(args.chinese_archive), version='3.1',
             exportSha256=digest(args.chinese_export), conversion='diatheke 4.8 / SWORD 1.9.0 plain, optional filters disabled'),
        dict(id='webp', url='https://ebible.org/Scriptures/engwebp_vpl.zip',
             sha256=digest(args.english_archive), version='2026-11-13', conversion='publisher VPL plain text'),
        dict(id='kjv', url='https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip/KJV.zip',
             sha256=digest(args.kjv_archive), version='3.1', exportSha256=digest(args.kjv_export),
             conversion='SWORD 1.9.0 mod2vpl raw OSIS; strip notes/titles/attributes, preserve divine-name capitals, normalize layout whitespace'),
        dict(id='dby', url='https://ebible.org/Scriptures/engDBY_vpl.zip', sha256=digest(args.darby_archive),
             version='2019-11-15', conversion='publisher VPL plain text; preserve source verse labels and punctuation')]
    manifest=dict(retrieved='2026-11-20', sources=sources, datasetSha256=digest(output),
                  plainSha256=hashlib.sha256(raw).hexdigest(),
                  books=len(catalog), chapters=len(chapters),
                  verses={t['id']:sum(len(v) for k,v in chapters.items() if k.startswith(t['id']+'/')) for t in translations})
    target=ROOT/'data';target.mkdir(exist_ok=True)
    (target/'manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    with zipfile.ZipFile(args.chinese_archive) as z:
        (target/'ChiUns-source.conf').write_bytes(z.read('mods.d/chiuns.conf'))
    with zipfile.ZipFile(args.english_archive) as z:
        (target/'WEBP-source.html').write_bytes(z.read('engwebp_about.htm'))
    with zipfile.ZipFile(args.kjv_archive) as z:
        (target/'KJV-source.conf').write_bytes(z.read('mods.d/kjv.conf'))
    with zipfile.ZipFile(args.darby_archive) as z:
        (target/'DBY-source.html').write_bytes(z.read('engDBY_about.htm'))
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
