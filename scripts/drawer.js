const hamburger = document.getElementById('hamburger-btn');
const drawer = document.getElementById('drawer-menu');
const overlay = document.getElementById('drawer-overlay');
let isOpen = false;
function toggleDrawer() {
  isOpen = !isOpen;
  drawer.classList.toggle('open', isOpen);
  hamburger.classList.toggle('open', isOpen);
  drawer.setAttribute('aria-hidden', !isOpen);
  hamburger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
  overlay.classList.toggle('open', isOpen);
  // Remove lazy loading from images in drawer when opened
  if (isOpen) {
    drawer.querySelectorAll('img[loading="lazy"]').forEach(img => {
      img.removeAttribute('loading');
    });
  }
}
hamburger.addEventListener('click', toggleDrawer);
hamburger.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggleDrawer();
  }
});
overlay.addEventListener('click', () => {
  if (isOpen) toggleDrawer();
});
// Optional: close drawer when clicking a link
document.querySelectorAll('.drawer__link').forEach(link => {
  link.addEventListener('click', () => {
    if (isOpen) toggleDrawer();
  });
});