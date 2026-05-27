---
name: "Sample"
version: "alpha"

colors:
  brand:
    primary: "#f97316"
  neutral:
    bg: "#ffffff"
    fg: "#1f2937"

typography:
  body:
    md:
      fontFamily: "Plus Jakarta Sans, sans-serif"
      fontSize: "16px"
      fontWeight: 400
      lineHeight: "1.5"
  heading:
    lg:
      fontFamily: "Nunito, sans-serif"
      fontSize: "32px"
      fontWeight: 700
      lineHeight: "1.2"

rounded:
  sm: "4px"
  md: "8px"

spacing:
  "0": "0px"
  "1": "8px"
  "2": "16px"

components:
  card:
    backgroundColor: "{colors.neutral.bg}"
    textColor: "{colors.neutral.fg}"
    typography: "{typography.body.md}"
    rounded: "{rounded.md}"
    padding: "{spacing.2}"
---

## Overview

A high-contrast sample brand for audit testing.

## Colors

| Role | Hex |
|------|-----|
| Brand primary | `#f97316` |
| Background | `#ffffff` |
| Foreground | `#1f2937` |

## Typography

Plus Jakarta Sans for body, Nunito for display.

## Layout

8px base spacing rhythm.

## Elevation & Depth

Flat by default.

## Shapes

4–8 px radii.

## Components

- card: white background, dark slate text, 8px radius.

## Do's and Don'ts

**Do**
- Keep contrast high.

**Don't**
- Stack accents.
