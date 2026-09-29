// White theme by default; dark only when chosen in Settings (or "System" is chosen and the OS is dark).
try {
  var t = localStorage.getItem('jpm-theme');
  if (t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
} catch (e) {}
