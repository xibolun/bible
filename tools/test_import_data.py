"""Protect scripture wording while removing SWORD annotation markup."""
import unittest

from import_data import osis_plain


class SwordTextTests(unittest.TestCase):
    def test_psalm_divine_name_added_words_and_annotation_removal(self):
        source='<title canonical="true">A Psalm of David.</title><w savlm="strong:H03068">The <divineName>Lord</divineName></w> <transChange type="added">is</transChange> my shepherd;<note>explanatory material</note> I shall not want.'
        self.assertEqual(osis_plain(source),'The LORD is my shepherd; I shall not want.')

    def test_layout_breaks_and_non_bmp_text_do_not_lose_words(self):
        self.assertEqual(osis_plain('And God said,<lb/>\n<w>Let there be light</w>: and there was light. 😀'),'And God said, Let there be light: and there was light. 😀')
        with self.assertRaises(ValueError):osis_plain('First words<note>unterminated explanation')


if __name__=='__main__':unittest.main()
