function playVideo() {
  document.getElementById('video-overlay').classList.add('active');
  document.getElementById('the-king-video')?.play().catch(function(e){
    console.log('error', e);
  });
}
document.getElementById('video-overlay').addEventListener('click', function(e) {
  if (e.target !== document.getElementById('the-king-video')) {
    document.getElementById('video-overlay').classList.remove('active');
    const vid = document.getElementById('the-king-video');
    vid.pause();
    vid.currentTime = 0;
  }
});
document.getElementById('play-video-button').addEventListener('click', function() {
  playVideo()
});

document.addEventListener('contextmenu', function(e) {
  e.preventDefault(); // browser menu is blocked
  playVideo()
});