# Lone Archer

A 2D browser horde-defense game. You command a stationary ballista on the right
of the screen; enemies stream in from the left and damage your castle wall if
they reach it. Hold the mouse (or finger) to fire arrows, and spend the gold you
earn on upgrades between and during the fight.

Built with **vanilla Canvas 2D** — zero dependencies, no build step.

## Play

Just open [`index.html`](index.html) in any modern browser. No server needed
(it runs straight from `file://`).

## Controls

| Action | Input |
| --- | --- |
| Aim & shoot | Hold **mouse / finger** toward the cursor |
| Toggle auto-fire | **F** |
| Upgrades (pauses) | **U** |
| Pause | **P** / **Esc** |

Auto-fire keeps shooting toward the cursor without holding; the setting is
remembered between sessions.

## Modes

- **Endless** — survive escalating waves; your best wave is saved locally. Every
  5th wave is headlined by a mini-boss, cycling **Ogre → Siege Tower → Sky
  Terror** so each one demands a different answer.
- **Campaign** — 10 hand-tuned waves, an Ogre at wave 5, ending on the
  **Warlord** (a heavily plated boss).

A progress bar tracks the current wave — how many foes are left, and whether a
boss is inbound. The sky runs midnight to dawn as you clear each wave.

## Enemies

The horde does not attack on one line, and it is not all made of flesh:

| Foe | From | Threat |
| --- | --- | --- |
| Grunt / Runner / Brute / Shaman | wave 1–6 | the ground line — cheap, fast, or bulky |
| **Bat** | wave 3 | first flyer — cruises high, must actually be aimed at |
| **Sapper** | wave 5 | first plating — teaches you that armor isn't just more HP |
| **Harpy** | wave 8 | tougher flyer that dives at the battlements |
| **Siege Ram** | wave 11 | slow, enormous armor, devastating if it lands |
| **Wyvern** | wave 13 | armored *and* airborne |

Flyers cruise at their own altitude and only swoop onto the wall at the last
moment, so a single flat firing lane no longer clears the field.

### Bosses

Each one is a different question, so a build that answers only one will stall:

| Boss | Where | Asks for |
| --- | --- | --- |
| **Ogre** | endless w5, 15, … · campaign w5 | raw sustained damage — no tricks |
| **Siege Tower** | endless w10, 25, … | armor answers; almost all of its bulk is plating |
| **Sky Terror** | endless w15, 30, … | aim — it's armored *and* it flies |
| **Warlord** | campaign w10 | everything at once; a fixed fight, not wave-scaled |

## Armor

Armored foes carry a steel pool **in front of** their health. A plain arrow only
lands half its damage on plating, so armor is worth roughly double its number in
effective HP — until you answer it:

- **Blunt Heads** — batter plating apart far faster (useless once it's gone).
- **Armor Piercing** — a share of every hit skips armor and bites health directly.
- **Toxic Coating** — poison seeps *under* plating and always damages health.

Break the plating and the surplus damage carries straight through.

**Explosive Tips are not an armor answer** — splash is soaked by plating exactly
like a direct hit, so it shreds crowds but does little to a Siege Ram. Crit
damage is soaked the same way. And despite the name, **Piercing** passes through
*bodies*, not plating — it does nothing about armor. Only the three upgrades
above get past it.

## Upgrades

Offense: Arrow Power, Draw Speed, **Bolt Velocity** (speed *and* flat reach),
Multi-Shot, **Focused Volley** (tightens the spread), Piercing, Critical Eye.
Arrowcraft: **Armor Piercing**, **Blunt Heads**, **Explosive Tips** (splash),
**Toxic Coating** (damage over time), **Frost Arrows** (slow/stagger).
Defense: Fortify Wall, Masons (regen).
Economy: Bounty (kill multiplier), **Tribute** (gold/sec, scales with the wave),
**Coin Vault** (interest on held gold, cap scales with the wave).

Levels can be sold back for a 75% refund, so builds aren't locked in.

Arrows fly flat for their reach, then arc down under gravity — the aim guide
shows the predicted trajectory and landing spot.

## Balance notes

- Enemy HP and armor scale **geometrically** with the wave, while their damage
  and especially the gold they drop scale far slower. Stacking Arrow Power alone
  stalls out fast; you have to bring the right tool for what's walking at you.
- Kill-gold can't keep up with geometric HP on its own, so **investment-based
  passive income (Tribute and the Coin Vault's payout cap) scales with the
  wave**. A committed economy build can therefore keep pace and chase endless
  records; a combat-only build still eventually walls out, just later.
- The **Coin Vault** still caps each payout at its (now wave-scaling) capacity,
  so it's a strong, hoard-rewarding stipend rather than an infinite money printer.
- Bosses spawn last in their wave but announce themselves the instant they step
  onto the field (alarm + banner) and carry a health bar pinned to the top of
  the screen, so they can't sneak in among the horde.

## Files

- `index.html` — markup + UI overlays
- `style.css` — styling / theme
- `game.js` — all game logic (loop, physics, waves, upgrades, sound)
