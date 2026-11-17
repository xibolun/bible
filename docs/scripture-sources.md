# Scripture sources and editions

The application bundles three complete 66-book translations. SWORD is a module
format and toolchain; it is not an English Bible translation. The initial WEBP
snapshot came directly from its publisher because a plain-text export and its
public-domain notice were available. Chinese CUV and the added KJV use SWORD
modules; the application does not link or require a SWORD runtime library.

| Translation                           | Source and pinned edition                          | Publisher notice                                                                                    |
| ------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| CUV, simplified Chinese Union Version | CrossWire ChiUns 3.1; module source identifies FHL | Public Domain                                                                                       |
| WEBP, World English Bible             | eBible engwebp snapshot 2026-11-13                 | Public Domain; retain the translation name for unchanged text                                       |
| KJV, King James Version (1769)        | CrossWire KJV 3.1, 2023-07-19                      | DistributionLicense=GPL; exact CrossWire permission and Crown-of-England base-text notice preserved |

Source links: [ChiUns](https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=ChiUns),
[WEBP](https://ebible.org/bible/details.php?id=engwebp),
[KJV](https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=KJV).
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
  --kjv-archive /path/to/KJV.zip --kjv-export /path/to/KJV-raw.vpl
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

## NIV status

NIV is tracked in [Issue #6](https://github.com/xibolun/bible/issues/6). The user
confirmed that authorization is not currently available and requested KJV
first. NIV text is not bundled, represented by substitute text, or extracted
from protected modules. Its edition and offline/distribution/copy/card scope
must be confirmed before implementation. Guidance is provided by
[CrossWire](https://www.crosswire.org/faq/) and
[Biblica](https://www.biblica.com/permissions/).
