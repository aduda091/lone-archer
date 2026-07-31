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
| Upgrades (pauses) | **U** |
| Pause | **P** / **Esc** |

## Modes

- **Endless** — survive escalating waves; your best wave is saved locally.
- **Campaign** — 10 hand-tuned waves ending in a boss (the Warlord).

## Upgrades

Combat: Arrow Power, Draw Speed, Bolt Velocity, **Arrow Range**, Multi-Shot,
Piercing, Critical Eye, **Frost Arrows** (slow/stagger).
Defense: Fortify Wall, Masons (regen).
Economy: Bounty (kill multiplier), **Tribute** (gold/sec), **Coin Vault**
(interest on held gold).

Arrows fly flat for their range, then arc down under gravity — the aim guide
shows the predicted trajectory and landing spot.

## Files

- `index.html` — markup + UI overlays
- `style.css` — styling / theme
- `game.js` — all game logic (loop, physics, waves, upgrades, sound)
