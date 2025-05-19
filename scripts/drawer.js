const hamburger = document.getElementById('hamburger-btn');
const drawer = document.getElementById('drawer-menu');
let isOpen = false;
function toggleDrawer() {
  isOpen = !isOpen;
  drawer.classList.toggle('open', isOpen);
  hamburger.classList.toggle('open', isOpen);
  drawer.setAttribute('aria-hidden', !isOpen);
  hamburger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
}
hamburger.addEventListener('click', toggleDrawer);
hamburger.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggleDrawer();
  }
});
// Optional: close drawer when clicking a link
document.querySelectorAll('.drawer__link').forEach(link => {
  link.addEventListener('click', () => {
    if (isOpen) toggleDrawer();
  });
});