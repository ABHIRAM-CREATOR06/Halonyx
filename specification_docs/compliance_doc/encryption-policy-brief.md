# Comparative Encryption Policy Brief

*EU, US, India, UK, and UN approaches to end-to-end encryption — and where Halonyx stands relative to each*

Prepared July 2026 · Status current as of publication; all five regimes have live, moving legislation or ratification processes

## 1. Purpose and Scope

This brief summarizes the current state of encryption-related policy in four national jurisdictions — the European Union, the United States, India, and the United Kingdom — plus the UN Convention against Cybercrime as a multilateral treaty layer above them, and evaluates, feature by feature, whether Halonyx's architecture is consistent with, exposed to, or unaffected by each regime. It is written for a technical audience evaluating deployment risk, not as legal advice, and reflects a fast-moving policy landscape that may shift after publication.

## 2. Jurisdiction Summaries

### 2.1 European Union — CSAR / "Chat Control"

The EU's Child Sexual Abuse Regulation (CSAR), widely known as "Chat Control," has been in negotiation since 2022. As of mid-2026 the situation is unsettled but trending away from mandatory scanning:

- The Council dropped its original demand for mandatory client-side scanning of encrypted messages in late 2025.

- A temporary voluntary-scanning derogation ("Chat Control 1.0") expired on 3 April 2026 after Parliament voted to reject its extension; a subsequent July 2026 vote to extend it again narrowly failed to be blocked, so the derogation stands, but with an amendment explicitly excluding end-to-end encrypted communications from its scope.

- The permanent regulation ("Chat Control 2.0") remains in trilogue negotiation between Commission, Council, and Parliament, with open questions on age verification and "risk-mitigation" obligations that some fear could pressure encrypted services indirectly even without a scanning mandate.

Net position for encrypted messaging apps as of writing: no legally mandated backdoor or client-side scanning obligation currently in force against end-to-end encrypted services, but the permanent regulation is unresolved and worth monitoring.

### 2.2 United States — EARN IT Act and PQC Executive Order

The US does not currently have an enacted law mandating encryption backdoors. Two separate policy threads are relevant:

- The EARN IT Act (reintroduced in multiple Congresses since 2020) would remove Section 230 liability protection from platforms unless they meet "best practices" set by a government-influenced commission — critics including EFF, ACLU, and cryptographer Matthew Green argue this creates strong indirect pressure toward backdoors or scanning without directly mandating them by name. It has not been enacted as of mid-2026.

- Separately, a 2026 executive order directs a federal transition to post-quantum cryptography (PQC), assigning NIST (with NSA and CISA) to lead standards work and requiring federal contractors to comply with NIST PQC standards by December 31, 2030. This is a modernization mandate, not a backdoor mandate.

Net position: no current US law compels backdoors in commercial E2EE products. Legislative pressure (EARN IT) recurs periodically but has not passed. The live federal encryption initiative that does exist (PQC transition) points toward stronger, not weaker, cryptography.

### 2.3 India — IT Rules 2021, Rule 4(2) Traceability

India's Intermediary Guidelines and Digital Media Ethics Code Rules, 2021 impose a "traceability" requirement on "significant social media intermediaries" (over 5 million users) offering messaging:

- Rule 4(2) requires the ability to identify the "first originator" of a message within India upon a valid judicial or Section 69 order, for offences above a specified severity threshold.

- WhatsApp, joined by other platforms, has challenged this in the Delhi High Court, arguing that traceability is technically impossible without retaining data that breaks end-to-end encryption guarantees — litigation remains unresolved as of this writing.

- The government's own FAQ states the intent is not to break encryption and that providers may design "alternative technological solutions" — but no such solution has been demonstrated to satisfy both traceability and unmodified E2EE, and Signal's founder has publicly stated the two are architecturally incompatible.

Net position: a real, currently-in-force legal rule that is in direct tension with strict E2EE for any service with 5M+ Indian users; enforcement and ultimate resolution remain pending in the courts.

### 2.4 United Kingdom — Online Safety Act 2023 and Investigatory Powers Act 2016

The UK runs two parallel legal mechanisms relevant to encryption:

- The Online Safety Act 2023 (OSA) empowers Ofcom to require "accredited technology" — including client-side scanning — to detect CSAM on encrypted services. No accredited technology currently exists, and Ofcom's final implementation guidance was expected in spring 2026; enforcement has not yet been technically deployed.

- The Investigatory Powers Act 2016 (IPA) separately allows the Home Secretary to issue secret Technical Capability Notices (TCNs) compelling a company to remove "electronic protection." This mechanism was reportedly used against Apple's iCloud Advanced Data Protection in 2025; Apple responded by withdrawing that feature for UK users rather than complying, and the matter is before the Investigatory Powers Tribunal.

- Signal has published statements that it would exit the UK market before implementing client-side scanning.

Net position: the clearest existing legal mechanism (IPA/TCN) for compelling backdoor-equivalent access anywhere in this brief, already reportedly exercised once against a major provider; the OSA threat is real but not yet technically operational.

### 2.5 United Nations — Convention against Cybercrime

Unlike the other four jurisdictions, this is not a domestic law but a multilateral treaty — relevant here because it would sit above and interact with all four national regimes if enough countries ratify it.

- The UN Convention against Cybercrime was adopted by the General Assembly by consensus on 24 December 2024 and opened for signature in Hanoi on 25 October 2025. It is not yet in force: it requires 40 ratifications and takes effect 90 days after the 40th is deposited. As of mid-2026, 72+ countries have signed, but signature alone does not create binding obligations — only ratification does, and the ratification count remains well short of 40.
- The provision most relevant to encryption is Article 28.4, on search and seizure of electronic data, which privacy organizations (Internet Society, EFF, Privacy International) warn could be read to let domestic authorities compel handover of encryption keys or other information that defeats security measures — with the actual safeguards left to each country's own domestic law rather than specified in the treaty itself.
- Notably, the US has not signed, and India has not signed. The EU's Council has authorized the European Commission and member states to sign, with member-state ratification still pending. This means the treaty's eventual reach into two of the four jurisdictions already covered in this brief is currently uncertain.
- Human rights groups (EFF, Privacy International) have been vocal that the treaty's broad surveillance-cooperation provisions and vague domestic-law deference create a risk of the treaty being used by authoritarian-leaning states to justify surveillance demands under the banner of international cybercrime cooperation.

Net position: not yet in force anywhere, and won't be until 40 states ratify — a threshold not yet met. Its eventual effect on encryption depends entirely on how individual signatory states implement Article 28.4 domestically, which is not yet determined for any of the four jurisdictions above.

## 3. Cross-Jurisdiction Comparison

| Dimension | EU | US | India | UK | UN |
|---|---|---|---|---|---|
| Legal mechanism | CSAR / Chat Control (regulation, in trilogue) | EARN IT Act (not enacted); PQC EO (enacted, unrelated to backdoors) | IT Rules 2021, Rule 4(2) (in force, litigated) | Online Safety Act 2023 + Investigatory Powers Act 2016 (both in force) | UN Convention against Cybercrime, Art. 28.4 (signed by 72+ states, not yet in force) |
| Mandates breaking E2EE? | No, as currently amended — E2EE explicitly excluded from scanning scope | No enacted mandate | Effectively yes, per WhatsApp's and Signal founder's technical assessment | Yes, via IPA technical capability notices (reportedly used once); OSA scanning power exists but not yet technically enforced | Ambiguous — could permit compelled key handover depending on domestic implementation, not specified in treaty text |
| Currently enforced against E2EE apps? | No | No | Contested in court; not resolved | IPA: yes (Apple case). OSA: not yet | No — treaty not yet in force anywhere |
| Status | Unsettled, active trilogue through 2026 | Recurs in Congress periodically, not passed | Active litigation, Delhi High Court | Active litigation, Investigatory Powers Tribunal | Awaiting 40th ratification; US and India have not signed, EU ratification pending |

## 4. Does Halonyx Comply? A Feature-by-Feature Check

*"Comply" is doing different work in each row: some rows ask whether Halonyx meets a legal obligation, others ask whether Halonyx is even the kind of entity the law targets. Read each row on its own terms rather than as a single yes/no verdict.*

### 4.1 Against the EU (CSAR / Chat Control)

|                                                                            |                                                                                                                                                                                               |
|----------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Requirement (as currently drafted)**                                     | **Halonyx status**                                                                                                                                                                            |
| E2EE communications excluded from voluntary/mandatory scanning scope       | Consistent — Halonyx has no scanning mechanism of any kind, so it does not need the exclusion; there is nothing to exclude.                                                                   |
| Age verification obligations under discussion for the permanent regulation | Not implemented — Halonyx has no age-verification, registration, or identity-binding layer. If this becomes law, it would apply to Halonyx as much as any other service; this is an open gap. |
| Risk-mitigation / design obligations (vague, still being negotiated)       | Unknown / unresolved — the scope of this obligation is not finalized in the source legislation itself, so no service can be assessed against it yet.                                          |

### 4.2 Against the US (EARN IT Act — not currently enacted)

|                                                                                                |                                                                                                                                                                                                                                                                                                                                 |
|------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Requirement (as proposed, not law)**                                                         | **Halonyx status**                                                                                                                                                                                                                                                                                                              |
| "Best practices" commission-approved content moderation as condition of Section 230 protection | Not applicable / not enacted — Section 230 governs US-based platforms hosting third-party content at scale; EARN IT has not passed, and its ultimate scope (if any) is undetermined.                                                                                                                                            |
| PQC transition (NIST-led, contractor deadline 2030)                                            | Not implemented — Halonyx currently uses classical curves (X25519, P-256, Ed25519), consistent with Signal Protocol's current production design. No post-quantum key exchange (e.g., Kyber/ML-KEM) is implemented. This mirrors the roadmap gap most E2EE messengers currently have, including Signal itself as of the writeup. |

### 4.3 Against India (IT Rules 2021, Rule 4(2))

|                                                                                                                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|--------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Requirement (in force, litigated)**                                                                              | **Halonyx status**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Traceability: identify first originator within India on valid order, for services with 5M+ Indian registered users | Not applicable at current scale — Halonyx is an early-stage, non-production project with no meaningful user base, so the "significant social media intermediary" threshold is not met. Architecturally not applicable either: Halonyx's server stores only hashed USIDs and encrypted payloads (Section 5 of the technical writeup), so it has no mechanism to identify a message originator even if compelled — the same structural conflict WhatsApp has argued in court applies to Halonyx's design. |
| Data localization / registration requirements for significant intermediaries                                       | Not applicable at current scale for the same reason.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### 4.4 Against the UK (Online Safety Act 2023 / Investigatory Powers Act 2016)

|                                                                                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|-----------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Requirement (in force)**                                                              | **Halonyx status**                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| OSA: deploy "accredited technology" (client-side scanning) if compelled by Ofcom        | Not implemented, and no accredited technology exists yet for Ofcom to mandate against anyone. If this is later operationalized, Halonyx's architecture — server never possesses plaintext or keys — would require a fundamentally new client-side component to comply, exactly the same tension WhatsApp, Signal, and Apple face.                                                                                                                                                      |
| IPA: comply with a secret Technical Capability Notice to remove "electronic protection" | Unclear / architecturally resistant but not immune — Halonyx's non-exportable CryptoKey design and server-side blindness to plaintext make silent compliance structurally harder than for a service that controls its own client update channel at scale, but a TCN's legal force does not depend on technical convenience. As a self-hosted, non-commercial project, Halonyx is a far less likely target for this mechanism than a major provider, but "less likely" is not "exempt." |

### 4.5 Against the UN Convention against Cybercrime

| Requirement (treaty text, not yet in force) | Halonyx status |
|---|---|
| Art. 28.4: domestic authorities may be empowered to compel handover of encryption keys or defeat security measures during search and seizure | Not currently applicable — the treaty is not in force anywhere, and even once it is, it operates by directing states to legislate domestically; it creates no direct obligation on Halonyx itself. Its eventual effect would flow through whichever of the four national regimes above choose to ratify and implement it, not through the treaty text directly. |
| International cooperation / cross-border evidence sharing for serious crimes | Not applicable — Halonyx has no operator handling cross-border legal requests at any meaningful scale, and no country has yet implemented enabling domestic legislation. |

## 5. Summary Judgment

Halonyx is not in conflict with any currently-enforced law in the EU or US, and is architecturally aligned with the direction those two jurisdictions are currently trending (E2EE carve-outs in the EU; no enacted backdoor mandate in the US). It has no live compliance obligation in India or the UK today, mainly because its scale and non-commercial status place it outside the practical reach of the mechanisms that exist there — not because its architecture has been tested against them. The UN Convention against Cybercrime adds a fifth data point worth watching rather than acting on: it is not yet in force anywhere, and its eventual bite on encryption depends on how — and whether — individual states choose to implement Article 28.4 domestically once it does take effect.

The more important observation is architectural, not jurisdictional: every mechanism reviewed here (client-side scanning, traceability, technical capability notices, and the UN treaty's compelled-key-handover language) works by compelling change at the client or at the point of key exchange. Halonyx's server-side blindness (hashed USIDs, no plaintext, non-exportable keys) is a genuine structural obstacle to silent compliance — but it is not a legal shield. A government order compelling a client-side change would still bind Halonyx's maintainers the same way it binds Signal's, if Halonyx ever reached comparable scale or jurisdictional attention.

For the current stage of the project — a self-hosted, non-production, educational implementation — none of these regimes currently impose an active, enforceable obligation on Halonyx specifically. This assessment is tied to that current stage and scale, not a permanent verdict.

*Sources: EU trilogue status via multiple 2026 policy trackers (Fight Chat Control, State of Surveillance, Andrea Fortuna, EFF); India traceability via EFF, Internet Society, Forbes India, and Delhi High Court reporting; UK via Computer Weekly, State of Surveillance, and Signal's public statements; US via New America, EFF, and a June 2026 executive order summary; UN Convention against Cybercrime via UNODC treaty records, Internet Society, Privacy International, EFF, and Just Security analysis. This brief reflects public reporting as of July 2026 and should be re-verified before use in any formal compliance context.*
