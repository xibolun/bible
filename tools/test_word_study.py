import unittest

from import_word_study import hebrew_entries, greek_entries, verse_words
from import_chinese_dictionary import entries, decode_field


class WordStudyImport(unittest.TestCase):
    def test_licensed_chinese_dump_preserves_layout_and_literal_caret(self):
        source = "00430^神\\r\\n1) 眾神^author^2026^reviewer^אֱלֹהִים^text\\^literal\n"
        entry = entries(source, 'H')['H430']
        self.assertEqual(entry['definition'], '神\n1) 眾神')
        self.assertEqual(entry['lemma'], 'אֱלֹהִים')
        self.assertEqual(decode_field('\\N'), '')
        self.assertEqual(entries('1234a^補充^author^2026^reviewer^^', 'G'), {})
        with self.assertRaises(ValueError):
            entries(source+source, 'H')

    def test_kjv_groups_exclude_notes_and_preserve_multiple_codes(self):
        markup = '<title><w lemma="strong:G1">title</w></title><w savlm="strong:H00853 strong:H01254">created <transChange>all</transChange></w><note><w lemma="strong:H1">note</w></note><w lemma="strong:H0">added</w>'
        self.assertEqual(verse_words(markup), [{'text': 'created all', 'strongs': ['H853', 'H1254']}])

    def test_original_script_and_nested_definitions(self):
        source = '<lexicon xmlns="http://openscriptures.github.com/morphhb/namespace"><entry id="H430"><w xlit="elohim" pron="el-o-heem" xml:lang="heb">אֱלֹהִים</w><meaning>the <def>God</def></meaning><usage>gods</usage></entry></lexicon>'
        entry = hebrew_entries(source)['H430']
        self.assertEqual(entry['lemma'], 'אֱלֹהִים')
        self.assertIn('the God', entry['definition'])
        greek = greek_entries('$$$03056\n<entryFree><orth>λόγος</orth><orth type="trans">logos</orth><pron>log-os</pron><def>a <hi>word</hi></def></entryFree>\n')
        self.assertEqual(greek['G3056']['lemma'], 'λόγος')
        self.assertEqual(greek['G3056']['definition'], 'a word')


if __name__ == '__main__':
    unittest.main()
