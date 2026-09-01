/**
 * SKELETON LOADER — generic
 * ─────────────────────────────────────────
 * Add class="skel" to any wrapper element that already has
 * position:relative and a fixed/intrinsic size (aspect-ratio or
 * min-height) and contains a single <img>. This script shows a
 * shimmer behind the image until it finishes loading, then fades
 * the shimmer out and the image in.
 *
 * (Category gallery grids and hero carousels use their own
 * placeholder-block approach in gallery.js instead, since those
 * images are built dynamically after an adaptive detection pass.)
 */
(function () {
  function markLoaded(wrapper) {
    wrapper.classList.add('skel-loaded');
  }

  function initSkeletons() {
    document.querySelectorAll('.skel').forEach((wrapper) => {
      const img = wrapper.querySelector('img');
      if (!img) return;

      if (img.complete && img.naturalWidth > 0) {
        markLoaded(wrapper);
        return;
      }

      img.addEventListener('load', () => markLoaded(wrapper), { once: true });
      // Still reveal on error so a broken image doesn't shimmer forever
      img.addEventListener('error', () => markLoaded(wrapper), { once: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSkeletons);
  } else {
    initSkeletons();
  }
})();
