// Constants
const THEME = "theme";
const LIGHT = "light";
const DARK = "dark";

// Initial color scheme
// dark-first: 기본값 dark로 설정 (Alpine Green glassmorphism 테마가 dark에 최적화됨)
const initialColorScheme = "dark";

function getPreferTheme(): string {
  const currentTheme = localStorage.getItem(THEME);
  if (currentTheme) return currentTheme;

  if (initialColorScheme) return initialColorScheme;

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? DARK
    : LIGHT;
}

let themeValue = window.theme?.themeValue ?? getPreferTheme();

function setPreference(): void {
  localStorage.setItem(THEME, themeValue);
  reflectPreference();
}

function reflectPreference(): void {
  document.firstElementChild?.setAttribute("data-theme", themeValue);

  document.querySelector("#theme-btn")?.setAttribute("aria-label", themeValue);

  const body = document.body;

  if (body) {
    const computedStyles = window.getComputedStyle(body);

    const bgColor = computedStyles.backgroundColor;

    document
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", bgColor);
  }
}

if (window.theme) {
  window.theme.setPreference = setPreference;
  window.theme.reflectPreference = reflectPreference;
} else {
  window.theme = {
    themeValue,
    setPreference,
    reflectPreference,
    getTheme: () => themeValue,
    setTheme: (val: string) => {
      themeValue = val;
    },
  };
}

reflectPreference();

function setThemeFeature(): void {
  reflectPreference();

  document.querySelector("#theme-btn")?.addEventListener("click", () => {
    themeValue = themeValue === LIGHT ? DARK : LIGHT;
    window.theme?.setTheme(themeValue);
    setPreference();
  });
}

setThemeFeature();

document.addEventListener("astro:after-swap", setThemeFeature);

document.addEventListener("astro:before-swap", event => {
  const astroEvent = event;
  const bgColor = document
    .querySelector("meta[name='theme-color']")
    ?.getAttribute("content");

  if (bgColor) {
    astroEvent.newDocument
      .querySelector("meta[name='theme-color']")
      ?.setAttribute("content", bgColor);
  }
});

window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", ({ matches: isDark }) => {
    themeValue = isDark ? DARK : LIGHT;
    window.theme?.setTheme(themeValue);
    setPreference();
  });
