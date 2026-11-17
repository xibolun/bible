# 圣经中文、外文译本与原文版本：来源和授权目录

核验日期：**2026-11-17**。范围为本项目讨论过的中文译本、英文译本和原文数据，不是所有圣经版本的完整清单。

本目录回答三个问题：内容去哪里找、有哪些已公开的许可、需要向谁申请离线全文使用权。**公开许可条件与本项目实际取得的授权分别记录。** 未列出本项目授权记录的受版权保护版本，不能据此目录认定已经获准打包。

## 1. 项目状态与许可状态

本次核验时，`main` 基线为 `714640e`，其 [data/manifest.json](../data/manifest.json) 记录和合本 CUV 与英文 WEBP。KJV 在尚未合并的 [PR #7](https://github.com/xibolun/bible/pull/7) 中；NIV 在 [Issue #6](https://github.com/xibolun/bible/issues/6) 等待授权及数据。其他条目仅为候选来源，本次文档工作不新增经文数据。

| 状态           | 含义与处理                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------ |
| 公有领域来源   | 发布方明确将该具体数据版本标注为 Public Domain；不推广为同名所有修订本、排印本或附加资源均无版权 |
| 公开许可       | 已有 CC BY、CC BY-SA 等许可；在覆盖的范围内按条件使用，不等于没有义务                            |
| 待申请／待确认 | 本次未核验到允许本项目离线全文再分发的许可，需确认版次、权利人或代理及具体使用范围               |
| 专项授权       | 只有取得并核实针对本项目的书面许可或合同后，才能记录为“已取得”；本目录不替代该文件               |

## 2. 中文译本

| 译本／版本                                 | 内容来源与可用格式                                                            | 已核实的许可情况与离线分发判断                                                                       | 本项目状态／申请入口                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 和合本 CUV：简体 ChiUns 3.1                | [CrossWire 模块页][chiuns]；提供 SWORD 下载，来源说明指向信望爱 FHL           | 此具体模块标注 **Public Domain**；其他新标点、修订或注释版需单独核对                                 | 已在 main 捆绑；保留固定来源与校验值                            |
| 和合本修订版 RCUV／和合本 2010             | [香港圣经公会出版目录][hk-publications]；全文数据格式向公会询问               | **待申请／待确认**，不能套用 ChiUns 的公有领域声明                                                   | 未接入；先联系香港圣经公会，确认版次与地区授权                  |
| 吕振中译本                                 | [香港圣经公会出版目录][hk-publications]；电子正文向公会询问                   | **待申请／待确认**，不因可在线阅读认定可再分发                                                       | 未接入；先联系香港圣经公会                                      |
| 现代中文译本 TCV 及修订版                  | [台湾圣经公会中文圣经介绍][tw-chinese]；具体年份、简繁体与全文文件另行确认    | **待申请／待确认**；不同版次、地区的授权窗口需确认                                                   | 未接入；先联系台湾圣经公会，由其确认权利或转介代理              |
| 新译本 CNV                                 | [环球圣经公会版权申请表][wwbs]；同时索取官方电子正文                          | 版权属环球圣经公会；本项目全文离线打包应提交书面申请                                                 | 未接入；环球圣经公会版权部，`legal@wwbible.org`                 |
| 环球圣经译本                               | [环球圣经公会版权申请表][wwbs]；须指定实际版次                                | 版权属环球圣经公会；与 CNV 分别标识，全文使用待申请                                                  | 未接入；同一申请表可选择此版本                                  |
| 新汉语译本 CCV                             | [汉语圣经协会版本介绍][ccv]及其网上圣经；可供授权的书卷、版次和格式向协会确认 | **待申请／待确认**；经文、脚注分别说明范围，不预设已有完整可分发全文                                 | 未接入；[转载申请][cbi-permissions]，`info@chinesebible.org.hk` |
| 新普及译本 CNLT                            | [汉语圣经协会版本介绍及试读入口][cnlt]                                        | **待申请／待确认**；中文使用许可不自动包含配套英文 NLT                                               | 未接入；[转载申请][cbi-permissions]，同上邮箱                   |
| 普通授权版当代译本 CCB                     | [CCB 版本版权说明][ccb-notice]；正式接入数据向 Biblica 或其授权平台询问       | **待申请／待确认**；不能使用下列 OCCB 的许可来覆盖其他 CCB 数据文件                                  | 未接入；[Biblica Permissions][biblica]                          |
| 当代译本开放资源 OCCB：简体 2022，`cmncbs` | [eBible 版本与下载页][occb-s]；USFM、USFX、VPL＋SQL、SWORD 等                 | **CC BY-SA 4.0**；可按条件复制、分发和改编，须署名、保留来源，改编部分按同一许可分享，并遵守商标规则 | 未接入；此开放版在许可覆盖的使用范围内无需逐次申请              |
| 当代译本开放资源 OCCB：繁体 2023，`cmncbt` | [eBible 版本与下载页][occb-t]；USFM、USFX、VPL＋SQL、SWORD 等                 | **CC BY-SA 4.0**；同上，使用对应繁体版的声明和版本信息                                               | 未接入；不能仅靠程序转换简繁体就冒称另一官方版次                |

## 3. 英文译本

| 译本／版本                                                | 内容来源与格式                                                                | 已核实的许可情况与分发条件                                                                                                                               | 本项目状态／申请入口                                                                         |
| --------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| World English Bible，当前项目使用 WEBP／`engwebp`         | [eBible 版本页][webp]；逐节文本 VPL 等；项目固定快照为 2026-11-13             | **Public Domain**；保持准确版本名。修改后的正文不应继续冒用未修改的 World English Bible 名称                                                             | 已在 main 捆绑；来源及哈希见 manifest                                                        |
| King James Version（1769），CrossWire KJV 3.1，2023-07-19 | [CrossWire 模块页][kjv]及其链接的源项目；SWORD／OSIS                          | 模块标注 **DistributionLicense=GPL**，同时载有 CrossWire 允许该项目文本用于任何用途的说明及 Crown 基础文本权利声明；应完整保留，不能简化为“全球公有领域” | PR #7 已接入、尚未合并；模块问题可询 `modules@crosswire.org`；目标地区的基础文本权利另行核对 |
| New International Version，NIV                            | [Biblica 授权页][biblica]列出官方阅读及授权平台；版次和离线数据交付方式须确认 | **待专项授权**；少量引用政策不覆盖全文。普通全文许可只授予注册法人机构，不授予个人                                                                       | 用户已确认暂无授权；Issue #6 等待许可及数据，未捆绑正文                                      |

SWORD 是模块格式和工具生态，并不是某一种英文译本；模块可以下载，不代表其中所有正文、标注和附加资源采用相同许可。NIV 的公开模块可用性也应结合 [CrossWire FAQ][crosswire-faq] 核实。

## 4. 原文经文与研经数据

这里的“原文”指希伯来文／亚兰文旧约和希腊文新约的具体整理版本及其数据。正文、校勘记、词形、词典、注释和字体应分别核对。

| 数据／版本                                       | 内容获取                                                     | 许可或申请情况                                                                                                                         | 本项目状态                                                       |
| ------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| WLC 正文，经 OSHB 发布                           | [Open Scriptures Hebrew Bible][oshb] 的 `wlc` 目录，OSIS XML | 项目明确说明 **WLC 正文仍属 Public Domain**；这不包含所有其他研究资源                                                                  | 未接入                                                           |
| OSHB 词元与词形数据                              | [OSHB 仓库及许可文件][oshb]                                  | **CC BY 4.0**；署名 Open Scriptures Hebrew Bible Project，保留许可并标明修改                                                           | 未接入；可按公开许可评估接入                                     |
| SBL Greek New Testament，SBLGNT                  | [官方网站][sblgnt-site]与[官方源文件仓库][sblgnt-repo]       | 当前官网及仓库为 **CC BY 4.0**；署名、保留许可并说明修改。独立第三方词形数据须另外核对                                                 | 未接入；固定下载版本及其 LICENSE，避免混用历史 PDF 的旧说明      |
| STEPBible Data：TAHOT、TAGNT、词汇和节号映射等   | [STEPBible-Data 官方仓库][step]，提供 UTF-8 制表符分隔数据   | 仓库采用 **CC BY 4.0**，要求署名 STEP Bible 并记录修改；接入时阅读实际选定文件的来源说明。此许可不能推广到 STEP 网站上其他出版方的译本 | 未接入；它是研究数据集合，TAGNT 不能直接冒称为某一个单独学术版次 |
| Biblia Hebraica Stuttgartensia／Quinta，BHS／BHQ | 德国圣经公会出版资源；从[授权页][dbg]询问所需版次的全文数据  | **待申请／待确认**；古代语言不代表现代编辑、校勘及数字版无版权                                                                         | 未接入                                                           |
| Nestle–Aland／UBS Greek New Testament            | 德国圣经公会出版资源；从[授权页][dbg]询问具体版次            | **待申请／待确认**；不能把 SBLGNT 的公开许可套用到 NA／UBS                                                                             | 未接入                                                           |

## 5. 授权申请对象与渠道

| 机构／窗口         | 涉及版本               | 具体渠道与申请动作                                                                                                                               |
| ------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 环球圣经公会版权部 | CNV、环球圣经译本      | 填[官方申请表][wwbs]，发至 `legal@wwbible.org`；可在邮件补充软件发行范围及电子正文需求                                                           |
| 香港圣经公会       | RCUV、吕振中等具体版本 | [官方联系页][hk-contact]：`info@hkbs.org.hk`。这是一般联系窗口，说明版次及地区，请其转版权负责人或确认代理                                       |
| 台湾圣经公会       | 现代中文译本及修订版本 | 使用[官方联系页][tw-contact]；请其确认目标版次的授权主体、数字发行地区及数据交付方式                                                             |
| 汉语圣经协会       | CCV、CNLT              | 按[转载申请说明][cbi-permissions]填表并发至 `info@chinesebible.org.hk`，注明“转载申请”；普通转载说明按一次使用处理，软件持续发行和更新须另行写明 |
| Biblica            | NIV、普通授权版 CCB    | 从 [Permissions][biblica] 进入 Permission Request Form；全文普通许可需注册法人主体。OCCB 的公开许可另按其版本声明处理                            |
| 德国圣经公会       | BHS、BHQ、NA、UBS 等   | [Rights][dbg] 提供申请入口；全文项目应附项目简介联系该页版权人员，核验时列有 `gerhard@dbg.de`                                                    |

正式申请时，应请接收方确认其有权授予目标地区和用途的许可。平台自身获准展示某译本，不表示平台用户也获准将全文随自己的软件再分发。

## 6. 为本项目申请时需要写清的范围

| 事项       | 建议在申请中列明                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| 申请主体   | 实际个人／公司／教会／机构名称、联系人、项目网址；先核对是否满足权利人的主体要求                     |
| 版本与内容 | 译本全名、年份、简繁体、完整圣经或指定书卷；正文、脚注、标题、词形、音频分别说明                     |
| 软件和数据 | Windows、macOS、Linux 桌面阅读器；全文本地存储、搜索、多译本对照；需获得可转换为本地数据库的电子数据 |
| 分发渠道   | 安装包公开下载、GitHub 附件或应用商店；数据是否可进入公开源仓库和 CI 产物，或只能单独受控交付        |
| 用户输出   | 经文复制到剪贴板、文字分享、PNG 经文卡片导出与分享；每次输出的范围及版权标识方式                     |
| 商业与规模 | 是否收费、订阅、广告、捐赠或推广；预计用户数、发行地区、许可期限及更新版本方式                       |
| 数据格式   | 优先询问 USFM、USX、OSIS XML、逐节文本或授权 API；同时索取节号体系、版本说明与所需版权文字           |
| 授权结果   | 许可费用或版税、报表要求、修改限制、撤回与续约条款；把允许和不允许的行为写入授权记录                 |

对本项目而言，**全文离线分发、公开仓库保存数据、用户复制和卡片导出是需要分别确认的用途**。免费应用或少量经文引用政策不能直接替代全文分发许可。Biblica 的非商业平台渠道许可也不能直接当作离线安装包许可；应核对其平台条款及实际数据使用方式。[Biblica 官方政策][biblica]

## 7. 接入公开许可数据时的记录要求

- **CC BY 4.0**：保留作者、版本、来源、许可链接与适用的版权信息，说明修改；不得对许可允许的行为施加额外法律或技术限制。正文转换、删除标记等处理也记录到数据清单。[许可说明][cc-by]
- **CC BY-SA 4.0**：在上述要求之外，受许可约束的改编内容按同一许可分享。不要据此笼统判断所有应用代码必须采用该许可；应按实际使用方式区分数据作品与程序。[许可说明][cc-by-sa]
- **OCCB 商标**：按各版本声明保留来源和版权信息；原样分发与修改后使用 Biblica 商标的条件不同，接入前逐项核对。[简体版声明][occb-s]、[繁体版声明][occb-t]
- **固定证据**：记录来源 URL、下载日期、版次、文件哈希、原始许可和转换方法；公开许可目录不代替数据导入时的版本核验。
- **保存授权**：专项授权原件、联系人私人信息及非公开条款放在私有资料中；公开仓库仅记录获准公开的授权范围和版权声明。

本目录只整理公开政策和项目状态，没有向任何机构提交申请，也没有宣称新增版本已取得专项授权。后续接入时应更新“本项目状态”及核验日期；原有数据说明见 [README](../README.md#data-fonts-and-user-files) 和 [data/manifest.json](../data/manifest.json)。

## 8. 官方来源索引

以下为发布方、权利人、数据维护项目或其公布版权声明的页面。香港圣经公会的部分页面在本次直接抓取时返回 403，相关出版及联系方式同时核对了该域名的搜索索引；本目录未据此认定具体电子分发许可已经确认。

- [CrossWire：ChiUns 模块与 Public Domain 声明][chiuns]
- [eBible：WEBP 版本与下载][webp]
- [CrossWire：KJV 3.1 模块、许可与源项目][kjv]
- [CrossWire FAQ][crosswire-faq]
- [环球圣经公会：版权申请表、版权与引用说明][wwbs]
- [香港圣经公会：出版目录][hk-publications]、[联系窗口][hk-contact]
- [台湾圣经公会：中文圣经介绍][tw-chinese]、[联系窗口][tw-contact]
- [汉语圣经协会：CCV 介绍][ccv]、[CNLT 介绍][cnlt]、[转载申请][cbi-permissions]
- [BibleGateway：CCB 所载版权声明][ccb-notice]
- [Biblica：授权政策与申请入口][biblica]
- [eBible：Biblica OCCB 简体版数据及许可][occb-s]、[繁体版数据及许可][occb-t]
- [OSHB：正文、词元及词形数据的许可][oshb]
- [SBLGNT 官方网站][sblgnt-site]、[官方源文件和 LICENSE][sblgnt-repo]
- [STEPBible 官方数据仓库][step]
- [德国圣经公会：Rights][dbg]
- [Creative Commons：CC BY 4.0][cc-by]、[CC BY-SA 4.0][cc-by-sa]

[chiuns]: https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=ChiUns
[webp]: https://ebible.org/bible/details.php?id=engwebp
[kjv]: https://www.crosswire.org/sword/modules/ModInfo.jsp?modName=KJV
[crosswire-faq]: https://www.crosswire.org/faq/
[wwbs]: https://wwbible.org/download/category/12927
[hk-publications]: https://www.hkbs.org.hk/7
[hk-contact]: https://www.hkbs.org.hk/contact-us
[tw-chinese]: https://www.bstwn.org/chinese-bible/
[tw-contact]: https://www.bstwn.org/contact/
[ccv]: https://www.chinesebible.org.hk/hk/marketing/showroom_ccv.php
[cnlt]: https://www.chinesebible.org.hk/hk/marketing/showroom_cnlt.php
[cbi-permissions]: https://www.chinesebible.org.hk/hk/applycopy.php
[ccb-notice]: https://www.biblegateway.com/versions/Chinese-Contemporary-Bible-CCB
[biblica]: https://www.biblica.com/permissions/
[occb-s]: https://ebible.org/find/details.php?id=cmncbs
[occb-t]: https://ebible.org/find/details.php?id=cmncbt
[oshb]: https://github.com/openscriptures/morphhb
[sblgnt-site]: https://sblgnt.com/
[sblgnt-repo]: https://github.com/Faithlife/SBLGNT
[step]: https://github.com/STEPBible/STEPBible-Data
[dbg]: https://www.die-bibel.de/en/rights
[cc-by]: https://creativecommons.org/licenses/by/4.0/
[cc-by-sa]: https://creativecommons.org/licenses/by-sa/4.0/
