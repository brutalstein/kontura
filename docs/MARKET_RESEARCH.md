# Market Research

Research date: 12 November 2026. Method: web search plus direct reads of primary pages. Every claim is tagged:
**[V]** verified on a primary source today, **[S]** secondary source (aggregator, blog, vendor marketing), **[E]** my estimate, **[A]** assumption, **[U]** unknown.

## 1. Turkish business base

| Finding | Tag | Source |
|---|---|---|
| 3.93 million SMEs in 2024, 99.6% of all enterprises; 12.1% of SMEs are in manufacturing | S (press coverage of the TÜİK bulletin) | [alomaliye](https://www.alomaliye.com/2025/12/24/kobi-istatistikleri-2024-girisim-sayisi-istihdam-ciro-dis-ticaret-ve-ar-ge/), [sabah](https://sabah.com.tr/ekonomi/toplam-girisimde-en-buyuk-pay-kobilerin-7489947) |
| NACE 25 (fabricated metal products) is the manufacturing division with the most SMEs: 65,343 in 2021 | S (Presidency Strategy Office report citing TÜİK 2021) | [SBB ÖİK report](https://www.sbb.gov.tr/wp-content/uploads/2025/08/Girisimcilik-ve-KOBIler-OIK-Raporu_01082025.pdf) |
| 54.8% of manufacturing SMEs are low-tech, 32.1% medium-low-tech | S | [Forbes TR](https://www.forbes.com.tr/para-yatirim/girisimlerin-dogum-orani-2024-te-yuzde-15-8-e-yukseldi-imalatta-dusuk-teknoloji-hakimiyeti-suruyor) |
| "More than ten thousand" window fabricators (PVC/aluminium) | S (PUKAD sector report, method unclear) | [PUKAD 2022](https://pagev.org/upload/files/PUKAD_RAPOR_2022.pdf) |
| Turkey has several domestic fiber-laser machine builders (Nukon, Ermaksan, Durma, Dener) exporting widely | S (vendor self-description) | [Nukon interview](https://demircelik.com.tr/haber/nukon-lazer-yonetim-kurulu-baskani-nuri-korustan-fiber-lazer-kesim-teknolojisiyle-bir-adim-ondeyiz-6108), [Dener](https://en.dener.com/urun/5/fiber-lazer-kesim-makinesi) |
| Number of laser/plasma cutting job shops in Turkey | **U** | No count found. Armut lists "sac lazer kesim" providers per district in every industrial city, which shows density but is not a count. |
| Turkey-specific SaaS market size / SME software spend | **U** | Not found; global figures deliberately not reused. |

What this does and does not show: there are tens of thousands of metal-fabrication SMEs, and laser cutting shops are a visible subset. It does **not** show how many of them would pay for software.

## 2. What buyers are already paying for (evidence of willingness to pay)

Sheet-metal cutting quotation software, public prices:

| Product | Origin | Price | Tag | Source |
|---|---|---|---|---|
| Tempus Tools ToolBox | NZ | USD 100 / 300 / 500 per month (Starter capped at 20 quotes/month); web store on the 300 tier; 2% fee on online orders | V | [tempustools.com/pricing](https://www.tempustools.com/pricing) |
| CutQuote | — | USD 95 / 410 / 900 per user per month; white-label widget from the 410 tier | S | [Capterra](https://www.capterra.com/p/10040294/CutQuote/) |
| Quote & Cut (WordPress) | UK | free tier (25 jobs), GBP 299 / 999 per month | S | [Slashdot listing](https://slashdot.org/software/p/Quote-Cut/) |
| Oroox OX Quote | — | from USD 784 per month, usage-based | S | [Software Advice](https://www.softwareadvice.com/product/490891-OX-Quote/) |
| Paperless Parts | US | not public; USD 300–750/month in a 2019 announcement | S, outdated | [press release](https://www.paperlessparts.com/press/paperless-parts-launches-smart-sheet-metal-fabrication-ordering-quoting-and-collaboration-solution/) |
| SecturaFAB, goCAD, DigiFabster | US/DE | quote on request | S | [goCAD](https://gocad.de/en/webshop), [DigiFabster](https://digifabster.com/products/features) |
| LazerCRM | **Turkey** | 14-day free trial, price not on the page I read | V (features), U (price) | [lazercrm.com.tr](https://lazercrm.com.tr/) |

Turkish demand signals, all **[V]** on the shops' own sites: at least four Turkish shops built their own "upload DXF, get a price" pages ([Cutmatik](https://www.cutmatik.com/), [KesiMAX](https://www.kesimax.com.tr/en), [Robotistan](https://www.robotistan.com/lazer-kesim-servisi), [AKS Lazer](https://www.akslazer.com/)), and others parse the DXF automatically but price by hand ([Antalya Lazer Kesim](http://antalyalazerkesim.com.tr/)). Shops spending engineering money on this is the strongest local evidence that instant quoting matters to them. The typical alternative, described in the trade press, is a spreadsheet fed by a CAM operator's time estimate ([The Fabricator](https://thefabricator.com/thefabricator/article/cadcamsoftware/quoting-software-helps-fill-the-gaps-in-the-fab-shop)).

LazerCRM is the one direct Turkish competitor found. Its quote flow starts from a **Metalix CAM report (DOCX)**: the shop must nest the job in CAM before it can price it. That leaves an opening for pricing straight from the customer's DXF, before any CAM work, and for a customer-facing portal.

Other categories examined:

| Category | Price evidence | Tag | Source |
|---|---|---|---|
| Cutting optimisation (panel/profile) | MaxCut from USD 20/user/month with a free edition; 1DProfileNest USD 9; optiCutter freemium; free iPad apps | S | [GetApp](https://www.getapp.com/all-software/a/maxcut-software/), [1Dcut](https://apps.apple.com/ca/app/1dcut-cutting-optimization/id6754808371) |
| Load planning | Cargo-Planner from USD 59/month; EasyCargo monthly/yearly per-user licences in EUR | S | [SourceForge](https://sourceforge.net/software/load-planning), [EasyCargo](https://www.easycargo3d.com/en/pricing/) |
| Route optimisation | Optiyol (Turkish, enterprise customers such as Horoz Lojistik, Eczacıbaşı), OptimoRoute, Zeo; no public TL prices | S, 2020 data | [Webrazzi](https://webrazzi.com/2020/06/05/yerli-rota-optimizasyonu-cozumu-optiyol/) |
| Shift scheduling | Sling from USD 2, When I Work from USD 3 per user; Kolay İK bundles it into HR | S | [ClickUp roundup](https://clickup.com/tr/blog/178575/vardiya-yoenetimi-yazilimi), [Kolay İK](https://kolayik.com/lp-tr/vardiya-yonetimi-yazilimi) |
| Marketplace seller tools | BirFatura advertises a free marketplace integration; many bundled suites | S | [BirFatura](https://birfatura.com/pazaryeri-entegrasyonu/) |
| Construction progress billing | AMP Yazılım sells a cloud subscription; price not public | S | [OSTİM listing](https://www.ostim.org.tr/amp-yazilim-sanayi-ve-ticaret-ltd-sti/insaat-teklif) |

Reading: cutting optimisation and shift scheduling are commodity-priced (a few dollars a month, strong free tiers). Sheet-metal quoting sustains USD 100–900 a month internationally.

## 3. Payment providers for a Turkish merchant

| Finding | Tag | Source |
|---|---|---|
| Turkey is **not** in Stripe's list of countries where a business can open an account | V (page read today; no "Turkey"/"Türkiye" entry) | [stripe.com/global](https://stripe.com/global) |
| Paddle (merchant of record) accepts sellers everywhere except a published exclusion list; Turkey is not on it | V | [Paddle help](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle) |
| iyzico has a Subscription product: plans (daily to yearly), trial periods with the card stored up front, API and panel management. Paid add-on: free for 3 months, then TRY 199 | V | [iyzico docs](https://docs.iyzico.com/en/products/subscription) |
| PayTR offers card storage for recurring payments; new-merchant campaign rate 2.19% | V (marketing page; campaign terms apply) | [paytr.com](https://www.paytr.com/) |
| iyzico's standard commission | U — one unofficial source says 3.99–4.29% plus a fixed fee; the real rate is shown in the merchant panel | S | [karekod.org](https://www.karekod.org/blog/sanal-pos-komisyon-oranlari/) |
| Paynet moved under the iyzico brand on 1 January 2026 | S | same |

Decision: **iyzico Subscription** for Turkish customers (TRY cards, instalment-capable, local invoicing). Paddle is the candidate for international customers later. Neither is activated: both need a registered company, merchant approval and credentials.

## 4. Legal and operational points (not legal advice)

| Finding | Tag | Source |
|---|---|---|
| KVKK Article 9 was amended by Law 7499, in force 1 June 2024; explicit consent alone no longer covers systematic transfers abroad | S (law-firm summaries of the official texts) | [hukukihaber](https://www.hukukihaber.net/kvkk-yurt-disina-aktarim-kapsaminda-yapilan-kanun-degisikligi) |
| Standard contracts were set by Board decision 2024/959 (four variants) and must be notified through the Authority's module | V (official announcements) | [KVKK 7938](https://www.kvkk.gov.tr/Icerik/7938/Standart-Sozlesmeler-ve-Baglayici-Sirket-Kurallarina-Iliskin-Dokumanlar-Hakkinda-Kamuoyu-Duyurusu), [KVKK 8043](https://www.kvkk.gov.tr/Icerik/8043/Standart-Sozlesme-Bildirim-Modulu-Hakkinda-Kamuoyu-Duyurusu) |
| Notification within five business days of signature; fines for missing it | S — verify with counsel | [CottGroup](https://cottgroup.com/tr/blog/kvkk-gdpr/item/standart-sozlesme-bildirim-yukumlulugu-ve-yaptirimlari) |

Practical consequence: host customer data **in Turkey** (or sign and notify standard contracts with every foreign processor). The product itself needs no licence, authorisation, hardware or government API. What still needs a professional: company formation and tax registration, e-invoice/e-archive set-up for subscription invoices, distance-sales and privacy texts, and the KVKK data-controller registry (VERBİS) assessment.

## 5. Gaps in this research

- No count of Turkish cutting job shops, and no interviews. Demand is inferred from competitors, self-built portals and trade press.
- LazerCRM's price and customer numbers are unknown.
- No Reddit/forum threads were retrieved; shop-floor complaints come from trade articles only.
- Competitor prices from aggregators may be stale.
- Search results are US-biased; Turkish-language coverage is thinner than the market probably is.
