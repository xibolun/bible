"""Protect scripture wording while removing SWORD annotation markup."""
import unittest
import gzip
import hashlib
import io
import json
import zipfile

from import_data import ROOT, osis_plain, publisher_vpl


class SwordTextTests(unittest.TestCase):
    def test_psalm_divine_name_added_words_and_annotation_removal(self):
        source='<title canonical="true">A Psalm of David.</title><w savlm="strong:H03068">The <divineName>Lord</divineName></w> <transChange type="added">is</transChange> my shepherd;<note>explanatory material</note> I shall not want.'
        self.assertEqual(osis_plain(source),'The LORD is my shepherd; I shall not want.')

    def test_layout_breaks_and_non_bmp_text_do_not_lose_words(self):
        self.assertEqual(osis_plain('And God said,<lb/>\n<w>Let there be light</w>: and there was light. 😀'),'And God said, Let there be light: and there was light. 😀')
        with self.assertRaises(ValueError):osis_plain('First words<note>unterminated explanation')


class PublisherVPLTests(unittest.TestCase):
    def read(self, text, skip_books=()):
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as source:
            source.writestr('sample.txt', text)
        archive.seek(0)
        return list(publisher_vpl(archive, 'sample.txt', skip_books))

    def test_source_labels_brackets_and_missing_records_are_preserved(self):
        self.assertEqual(self.read('\ufeffACT 8:36 words\nACT 8:37 \nACT 8:38 [He] said.\nACT 8:38a more words'),
                         [('ACT', 8, '36', 'words'), ('ACT', 8, '38', '[He] said.'), ('ACT', 8, '38a', 'more words')])
        self.assertEqual(self.read('JOH 3:16 only-begotten Son'), [('JHN', 3, '16', 'only-begotten Son')])
        self.assertEqual(self.read('PS2 1:1 outside canon', skip_books=('PS2',)), [])

    def test_invalid_and_duplicate_references_are_rejected(self):
        for text in ['GEN 51:1 words', 'GEN 0:1 words', 'GEN 1:0 words', 'XYZ 1:1 words',
                     'PS2 1:1 words', 'GEN 1:1 words\nGEN 1:1 duplicate', 'JOH 1:1 words\nJHN 1:1 duplicate',
                     'not a verse', 'GEN 1:1', 'GEN 1:x words']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.read(text)


class LegacyCorpusTests(unittest.TestCase):
    def test_every_legacy_verse_and_annotation_version_is_unchanged(self):
        data = json.loads(gzip.decompress((ROOT/'internal/bible/dataset.json.gz').read_bytes()))
        expected = {'cuv': '351096cecd590944ae953ae5309a49719d05b07502c65551366161bf6f84ce02'}
        self.assertEqual({tr['id'] for tr in data['translations']}, {'cuv'})
        self.assertTrue(all(key.split('/')[0] in {'cuv', 'webp'} for key in data['chapters']))
        for identity, digest in expected.items():
            with self.subTest(translation=identity):
                payload = {'translation': next(tr for tr in data['translations'] if tr['id']==identity),
                           'chapters': {key:value for key,value in data['chapters'].items() if key.startswith(identity+'/')}}
                actual = hashlib.sha256(json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
                self.assertEqual(actual, digest)


if __name__=='__main__':unittest.main()
