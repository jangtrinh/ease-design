---
name: "Bad sample"
version: "alpha"

colors:
  brand:
    primary: "#d97706"
  neutral:
    bg: "#ffffff"
    fg: "#000000"

typography:
  body:
    md:
      fontFamily: "Inter, sans-serif"
      fontSize: "16px"
      fontWeight: 400
      lineHeight: "1.5"

rounded:
  md: "8px"

spacing:
  "0": "0px"
  "1": "8px"

components:
  card:
    backgroundColor: "{colors.neutral.bg}"
    textColor: "{colors.neutral.fg}"
    typography: "{typography.body.md}"
    rounded: "{rounded.md}"
    padding: "{spacing.1}"
---

## Overview

This sample deliberately ships an invented `#d97706` brand primary and an `Inter` font that aren't in the source CSS.

## Colors

| Role | Hex |
|------|-----|
| Brand primary | `#d97706` |
| Background | `#ffffff` |
| Foreground | `#000000` |

## Typography

Inter (which does not appear in tokens.json).

## Layout

8 px base.

## Elevation & Depth

Flat.

## Shapes

8 px radii.

## Components

- card

## Do's and Don'ts

Don't ship invented values.
