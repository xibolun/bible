# Scripture sources and editions

The application bundles four complete 66-book translations. SWORD is a module
format and toolchain; it is not an English Bible translation. The initial WEBP
snapshot came directly from its publisher because a plain-text export and its
public-domain notice were available. Chinese CUV and the added KJV use SWORD
modules; the application does not link or require a SWORD runtime library.

| Translation                           | Source and pinned edition                          | Publisher notice                                                                                    |
| ------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| CUV, simplified Chinese Union Version | CrossWire ChiUns 3.1; module source identifies FHL | Public Domain                                                                                       |
| WEBP, World English Bible             | eBible engwebp snapshot 2026-11-13                 | Public Domain; retain the translation name for unchanged text                                       |
| KJV, King James Version (1769)        | CrossWire KJV 3.1, 2023-07-19                      | DistributionLicense=GPL; exact CrossWire permission and Crown-of-England base-text notice preserved |
| DBY, English Darby Translation         | eBible engDBY, source text dated 2019-11-15, retrieved 2026-11-20 | Public Domain; original publisher notice and exact scripture wording retained |

Source links: [ChiUns](https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=ChiUns),
[WEBP](https://ebible.org/bible/details.php?id=engwebp),
[KJV](https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=KJV),
[DBY](https://ebible.org/find/details.php?id=engDBY).
Checksums and transformation metadata are in `data/manifest.json`. Original
publisher notices are in `data/` and `licenses/scripture-*`; the KJV module's
metadata is not relabeled as global public domain. These data notices do not
choose or change the original application's license.

## Rebuilding the data

Use the exact archives in the manifest, SWORD 1.9.0 utilities and the recorded
export formats. Install the two SWORD modules into a separate development
module directory and set `SWORD_PATH` to that directory. Do not put modules or
machine-local tool binaries in the repository.

```sh
diatheke -b ChiUns -f plain -k 'Genesis 1:1-Revelation 22:21' > ChiUns.txt
mod2vpl KJV 1 > KJV-raw.vpl
python3 tools/import_data.py \
  --chinese-archive /path/to/ChiUns.zip --chinese-export /path/to/ChiUns.txt \
  --english-archive /path/to/engwebp_vpl.zip \
  --kjv-archive /path/to/KJV.zip --kjv-export /path/to/KJV-raw.vpl \
  --darby-archive /path/to/engDBY_vpl.zip
python3 tools/licenses.py
make verify-data
```

KJV is parsed from per-verse raw OSIS records. The importer removes note/title
content and attributes, retains verse words and divine-name capitalization,
and normalizes layout whitespace. This avoids diatheke's bulk plain-renderer
behavior that can repeat a Psalm heading across later verses. Verse-zero and
book/testament introductions are excluded. KJV contains 31,102 numbered verses.

The existing CUV/WEBP data and versions remain unchanged. Their inputs are
checked against the previous source/export hashes. KJV's `dataVersion` includes
both the archive fingerprint and normalized verse-content fingerprint, so a
future conversion change cannot silently reuse an annotation's text version.

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
archives; KJV text is checked against every existing verse before deriving links.
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

DBY is the English translation. Its 66 books / 1189 chapters contain 31,099
source verses; empty publisher records remain gaps. Supplied-word brackets and
punctuation are retained. A separate normalized corpus fingerprint protects
annotation offsets, while full fingerprints verify that every legacy CUV,
WEBP and KJV verse and data version remains unchanged.

The user confirmed that NIV and Lu Zhenzhong distribution permission is not
currently available. Lu Zhenzhong is tracked in Issue #24; FHL's regional
copyright-expiration statement does not establish worldwide distribution
scope. A requested Chinese rendering of Darby would be a separately identified,
reviewed derivative reference translation, not the English corpus relabeled
as Chinese. No Chinese Darby corpus is currently bundled.
