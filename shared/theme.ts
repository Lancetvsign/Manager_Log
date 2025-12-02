/**
 * SOCIAL CLUB PRO THEME CONFIGURATION
 * ====================================
 * This file defines the visual theme for the Manager Log module to match
 * the Social Club Pro application styling.
 * 
 * HOW TO ADJUST COLORS:
 * ---------------------
 * 1. Colors are defined in HSL format (Hue, Saturation%, Lightness%)
 * 2. The CSS variables in index.css reference these values
 * 3. To change the primary accent, update the `primary` values below
 * 4. Dark mode values are automatically derived but can be customized
 * 
 * USAGE IN COMPONENTS:
 * --------------------
 * - Use Tailwind classes like `bg-primary`, `text-primary-foreground`
 * - For custom styling, use CSS variables: `hsl(var(--primary))`
 * - The theme is applied automatically via Tailwind's configuration
 */

export const theme = {
  /**
   * PRIMARY ACCENT COLOR - Teal
   * Used for: active navigation items, buttons, links, focus rings
   */
  primary: {
    hue: 174,        // Teal hue
    saturation: 72,  // Vibrant but professional
    lightness: 40,   // Good contrast on white
  },

  /**
   * HEADER/NAV COLOR - Dark charcoal
   * Used for: top navigation bar, branded header areas
   */
  header: {
    hue: 210,
    saturation: 20,
    lightness: 15,   // Very dark for contrast
  },

  /**
   * SIDEBAR COLOR - Light gray
   * Used for: side navigation panel background
   */
  sidebar: {
    hue: 210,
    saturation: 15,
    lightness: 96,   // Very light, almost white
  },

  /**
   * CARD STYLING
   * Used for: content cards, form containers, data panels
   */
  card: {
    background: {
      hue: 0,
      saturation: 0,
      lightness: 100, // Pure white
    },
    border: {
      hue: 210,
      saturation: 10,
      lightness: 90,  // Subtle gray border
    },
    shadow: "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)",
  },

  /**
   * TEXT COLORS
   * Three levels of hierarchy for information display
   */
  text: {
    default: {
      hue: 210,
      saturation: 20,
      lightness: 15,  // Dark gray, high contrast
    },
    muted: {
      hue: 210,
      saturation: 10,
      lightness: 45,  // Medium gray for secondary text
    },
    light: {
      hue: 210,
      saturation: 10,
      lightness: 65,  // Light gray for tertiary/hint text
    },
  },

  /**
   * BACKGROUND COLOR
   * Used for: page background, container backgrounds
   */
  background: {
    hue: 210,
    saturation: 20,
    lightness: 98,   // Off-white, slightly warm
  },
};

/**
 * Helper function to generate HSL string from theme values
 * @param color - Object with hue, saturation, lightness
 * @returns HSL color string for CSS
 */
export function hsl(color: { hue: number; saturation: number; lightness: number }): string {
  return `${color.hue} ${color.saturation}% ${color.lightness}%`;
}

/**
 * CSS variable values derived from theme
 * These are applied to index.css via Tailwind
 */
export const cssVariables = {
  light: {
    primary: hsl(theme.primary),
    background: hsl(theme.background),
    foreground: hsl(theme.text.default),
    muted: `${theme.text.muted.hue} ${theme.text.muted.saturation}% 87%`,
    mutedForeground: hsl(theme.text.muted),
    card: hsl(theme.card.background),
    cardBorder: hsl(theme.card.border),
    sidebar: hsl(theme.sidebar),
    header: hsl(theme.header),
  },
  dark: {
    primary: `${theme.primary.hue} ${theme.primary.saturation}% 50%`, // Brighter in dark mode
    background: "210 20% 10%",
    foreground: "210 20% 95%",
    muted: "210 15% 20%",
    mutedForeground: "210 10% 60%",
    card: "210 20% 14%",
    cardBorder: "210 15% 20%",
    sidebar: "210 20% 12%",
    header: "210 20% 8%",
  },
};

export default theme;
