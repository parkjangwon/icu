import { ref, onMounted, watch } from 'vue';

type Theme = 'light' | 'dark';

export function useTheme() {
  const theme = ref<Theme>('light');

  const applyTheme = (newTheme: Theme) => {
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', newTheme);
    theme.value = newTheme;
  };

  const toggleTheme = () => {
    applyTheme(theme.value === 'light' ? 'dark' : 'light');
  };

  onMounted(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    if (savedTheme) {
      applyTheme(savedTheme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      applyTheme(prefersDark ? 'dark' : 'light');
    }
  });

  // Optional: Watch for system theme changes
  watch(() => window.matchMedia('(prefers-color-scheme: dark)'), (mediaQueryList) => {
    if (!localStorage.getItem('theme')) { // Only apply if user hasn't set a preference
      applyTheme(mediaQueryList.matches ? 'dark' : 'light');
    }
  });

  return {
    theme,
    toggleTheme,
  };
}
