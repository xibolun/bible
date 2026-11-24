# Scripture sources and editions

The application bundles only Simplified Chinese CUV, covering the 66-book canon.
WEBP, KJV and Darby scripture are no longer bundled; other editions use local import.
SWORD is a module format and toolchain, not an English translation. No SWORD
runtime library or external converter is required by the application.

| Translation | Source and pinned edition | Publisher notice |
| --- | --- | --- |
| CUV, simplified Chinese Union Version | CrossWire ChiUns 3.1; source identifies FHL | Public Domain; original module notice retained |

Exact input hashes, conversion descriptions, verse counts and output fingerprints
are in `data/manifest.json`. Source notices ship in `data/` and `licenses/`.
CUV text and data versions remain unchanged, preserving highlight offsets.

To rebuild from the pinned inputs:

```sh
diatheke -b ChiUns -f plain -k 'Genesis 1:1-Revelation 22:21' > ChiUns.txt
python3 tools/import_data.py \
  --chinese-archive /path/to/ChiUns.zip --chinese-export /path/to/ChiUns.txt
python3 tools/licenses.py
make verify-data
```

The local importer supports a bounded SWORD zText/ZIP/UTF-8/OSIS KJV/NRSV profile,
including the user-supplied Darby 2.0 ZIP. That module has 66 books, 1189
chapters and 31,099 scripture records. It stays in private user storage and is
not added to the public dataset. See [edition-import.md](edition-import.md).
A separate chapter/verse count table supports SWORD and theWord indexing
without carrying KJV scripture.

## User-selected downloads

The edition manager reads the official CrossWire `mods.d.tar.gz` catalogue over
HTTPS only after the reader clicks More editions below the local list. Opening
Editions or refreshing the local list does not request it. It lists Chinese and English modules
together with installed editions, retains source notices and checks the supported
native profile before download. Clicking Download or Update authorizes that
selected ZIP's validated local installation. Progress, cancellation and retry
stay in its row; installation completes automatically. Local file imports retain
their separate preview and confirmation flow.
No remote module scripture is included in application assets or installers.

Bilingual regression tests explicitly install selected public-domain WEBP excerpts
from `testdata/webp-reader-fixture.json` into the Mock user library. Those 233
reference verses are CI-only, derived from the previously bundled pinned WEBP
source; they are not application assets or a second built-in edition. The original
WEBP publisher notice remains with the test source attribution.

## Offline original-language dictionary

Word study is independent of the scripture dataset and annotation offsets.
Selected-verse links retain the pinned KJV 3.1 OSIS Strong’s word groups, with
the source identified in the reader. They do not assert CUV/WEBP word alignment.
No remote dictionary service is needed at runtime.

- Chinese definitions: FHL Information Center / CBOL, Old and New Testament
  original-language dictionary dumps from [the official public data page](https://bible.fhl.net/public/).
  The publisher identifies FHL dictionaries as GNU FDL 1.1-or-later in its
  [copyright notice](https://www.fhl.net/main/fhl/fhl8.html). The lookup index
  preserves Traditional Chinese wording and source line structure; empty
  records and nonstandard letter-suffix numbers are omitted. Complete verbatim
  transparent dumps, contributor identifiers, license and transformation
  history ship in `licenses/word-study-fhl/`. This independent dictionary
  remains GNU FDL; original application code retains its existing status.
- Hebrew/Aramaic script and English metadata: Open Scriptures Hebrew Bible
  Project, `HebrewLexicon/HebrewStrong.xml`, pinned commit
  `21c9add13bc727d3a951361778e97e3ff7afd1ce`, CC BY 4.0 structured data with
  Public Domain Strong’s text. Original README and full license ship in
  `licenses/word-study-*`.
- Greek script and English definitions: CrossWire `StrongsGreek` 2.0, Public
  Domain. Its unchanged source configuration ships in `licenses/`.

Input hashes and output counts/checksums are in `data/word-study-manifest.json`
and `data/chinese-dictionary-manifest.json`. The importer rejects unpinned
archives; a complete normalized KJV source fingerprint is checked before deriving links.
KJV's source notice remains for these independent word-study resources.
To rebuild, use these manifest inputs outside the repository:

```sh
mod2imp StrongsGreek > StrongsGreek.imp
python3 tools/import_word_study.py \
  --hebrew /path/to/HebrewStrong.xml --greek-archive /path/to/StrongsGreek.zip \
  --greek /path/to/StrongsGreek.imp --kjv /path/to/KJV-raw.vpl
python3 tools/import_chinese_dictionary.py \
  --hebrew /path/to/dhfhl.tgz --greek /path/to/dgfhl.tgz
make verify-data
```

## NIV status

NIV is tracked in [Issue #6](https://github.com/xibolun/bible/issues/6). The user
confirmed that authorization is not currently available and requested KJV
first. NIV text is not bundled, represented by substitute text, or extracted
from protected modules. Its edition and offline/distribution/copy/card scope
must be confirmed before implementation. Guidance is provided by
[CrossWire](https://www.crosswire.org/faq/) and
[Biblica](https://www.biblica.com/permissions/).

## Darby and pending Chinese editions

Darby is available through local import rather than the built-in catalogue. Source
notices, supplied-word brackets, punctuation and omitted verse positions are
preserved by the applicable import profile. No Chinese Darby text is bundled.

The user confirmed that NIV and Lu Zhenzhong distribution permission is not
currently available. Lu Zhenzhong is tracked in Issue #24; FHL's regional
copyright-expiration statement does not establish worldwide distribution
scope. A requested Chinese rendering of Darby would be a separately identified,
reviewed derivative reference translation, not the English corpus relabeled
as Chinese. No Chinese Darby corpus is currently bundled.
