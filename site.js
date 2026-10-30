// Day/night toggle. The <head> script has already set data-theme before paint.
document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var root = document.documentElement;
    var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = next === 'dark' ? '#16181c' : '#ffffff';
  });
});
