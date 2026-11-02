# Episode 1 voice status (2 Nov 2026)

Voiced cut: `scripts/render_episode1_voiced.py` (3:30). Narrator: ElevenLabs **Clara**
(voice `2OEeJcYw2f3bWMzzjVMU`, model eleven_v4, one take per line).

**Character voices are taken from the owner's own Flow clips** (local Whisper transcription, all
clips: `clip-transcripts.tsv`):

| Scene | Line | Source |
|---|---|---|
| 07 friend | "We stick together, okay?" | C03 5.0–7.2 s |
| 17 gate | "Squish Man? Is that you?" | C24 2.8–5.5 s |
| 18 stuck | "I chased a butterfly and got lost." / "That explains the paw prints." | C27 1.7–6.3 s |
| 22 reunion | "I knew you'd come for me! Best friends always find each other." | C25 2.0–7.8 s |
| 23 race back | "Thank you for finding me, Squish Man! Now let's get you home." | C28 1.7–7.2 s |

Lines that name Pudy (C26, C30–C32) are not used in Episode 1.

**Narration done (13 lines):** hook, 03, 04, 05, 08, 09, 10, 11a, 11b, 12, 14, 15, 20.
**Narration still needed (16 lines)** — ElevenLabs disabled the free tier on the account
("unusual activity … proxy or VPN … upgrade to a paid subscription"):
06, 07, 16a, 16b, 17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29. Once each file exists as
`narr/<scene>.mp3`, re-running the script places it automatically.
