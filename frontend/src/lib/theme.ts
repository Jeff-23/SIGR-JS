export type RestaurantTheme = {
  colorPrimario: string;
  colorSecundario: string;
  colorAcento: string;
  colorFondo: string;
  tipografia: "MANROPE" | "SYSTEM" | "ARIAL" | "VERDANA" | "TREBUCHET" | "GEORGIA";
};

export const DEFAULT_THEME: RestaurantTheme = {
  colorPrimario: "#0A1612",
  colorSecundario: "#1A2930",
  colorAcento: "#F7CE3E",
  colorFondo: "#F4F2EC",
  tipografia: "MANROPE",
};

const FONT_STACKS: Record<RestaurantTheme["tipografia"], string> = {
  MANROPE: '"Manrope", system-ui, sans-serif',
  SYSTEM: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  ARIAL: 'Arial, Helvetica, sans-serif',
  VERDANA: 'Verdana, Geneva, sans-serif',
  TREBUCHET: '"Trebuchet MS", Arial, sans-serif',
  GEORGIA: 'Georgia, "Times New Roman", serif',
};

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return null;
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16)).join(" ");
}

export function applyRestaurantTheme(theme: Partial<RestaurantTheme>) {
  const value = { ...DEFAULT_THEME, ...theme };
  const root = document.documentElement;
  root.style.setProperty("--sigr-steel", hexToRgb(value.colorPrimario) ?? "10 22 18");
  root.style.setProperty("--sigr-denim", hexToRgb(value.colorSecundario) ?? "26 41 48");
  root.style.setProperty("--sigr-marigold", hexToRgb(value.colorAcento) ?? "247 206 62");
  root.style.setProperty("--sigr-background", hexToRgb(value.colorFondo) ?? "244 242 236");
  root.style.setProperty("--sigr-font", FONT_STACKS[value.tipografia] ?? FONT_STACKS.MANROPE);
}
