/**
 * ADAPTIVE CATEGORY GALLERY
 * ─────────────────────────────────────────
 * Static sites can't "list" a folder, so this detects how many
 * numbered images exist by trying to load them one at a time:
 *   Images/<Category>/<Category> (1).jpg
 *   Images/<Category>/<Category> (2).jpg
 *   ...
 * It stops at the first missing number, capped at MAX_GALLERY_IMAGES.
 *
 * Requirements for this to work:
 *   - Files must be named "<Category> (1).jpg", "(2).jpg", etc. with
 *     no gaps in the numbering (e.g. don't skip from (4) to (6)).
 *   - Add or remove files and the site updates itself — no HTML edits.
 */

const MAX_GALLERY_IMAGES = 30;

// Safe stub — replaced with the real toggle once initCategoryPage() finishes
// setting up the carousel. Prevents an error if the pause button is clicked
// during the initial image-detection phase.
window.toggleCarouselPause = function () {};

function loadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve({ ok: true, ratio: img.naturalWidth / img.naturalHeight });
    img.onerror = () => resolve({ ok: false });
    img.src = src;
  });
}

// Returns [{ num, ratio }, ...] for every image found, in numeric order.
// (ratio = width/height, needed to lay out the justified gallery below.)
async function detectImages(category) {
  const items = [];
  for (let i = 1; i <= MAX_GALLERY_IMAGES; i++) {
    const src = `Images/${category}/${category} (${i}).jpg`;
    const result = await loadImage(src);
    if (!result.ok) break;
    items.push({ num: i, ratio: result.ratio });
  }
  return items;
}

function renderGallerySkeleton(gallery, count) {
  let inner = '';
  for (let i = 0; i < count; i++) {
    inner += `<div class="skel-placeholder skel-shimmer-bg"></div>`;
  }
  gallery.innerHTML = `<div class="skel-placeholder-row">${inner}</div>`;
}

function buildOrder(customOrder, total) {
  const valid = customOrder.filter((n) => Number.isInteger(n) && n >= 1 && n <= total);
  const seen = new Set(valid);
  const rest = [];
  for (let i = 1; i <= total; i++) {
    if (!seen.has(i)) rest.push(i);
  }
  return [...valid, ...rest];
}

/**
 * JUSTIFIED GALLERY LAYOUT
 * ─────────────────────────────────────────
 * Groups photos into rows (in the given left-to-right order) and scales
 * each row's height so its photos exactly fill the container width —
 * clean left AND right edges, no cropping, strict reading order. Only
 * the final row (if it doesn't have enough photos to naturally reach
 * full width) is left at natural size rather than stretched, since
 * force-stretching 1–2 photos across a full row would distort them.
 */
function computeJustifiedRows(orderedItems, containerWidth, gap, targetHeight) {
  const rows = [];
  let row = [];
  let ratioSum = 0;

  orderedItems.forEach((item) => {
    row.push(item);
    ratioSum += item.ratio;
    const widthAtTarget = ratioSum * targetHeight + gap * (row.length - 1);
    if (widthAtTarget >= containerWidth) {
      const rowHeight = (containerWidth - gap * (row.length - 1)) / ratioSum;
      rows.push({ items: row, height: rowHeight, justified: true });
      row = [];
      ratioSum = 0;
    }
  });

  if (row.length) {
    rows.push({ items: row, height: targetHeight, justified: false });
  }

  return rows;
}

function renderJustifiedGallery(gallery, orderedItems, category) {
  const containerStyle = getComputedStyle(gallery);
  const paddingX = parseFloat(containerStyle.paddingLeft) + parseFloat(containerStyle.paddingRight);
  const containerWidth = gallery.clientWidth - paddingX;

  const w = window.innerWidth;
  const gap = w <= 500 ? 8 : 12;
  const targetHeight = w <= 500 ? 210 : w <= 900 ? 300 : 380;

  const rows = computeJustifiedRows(orderedItems, containerWidth, gap, targetHeight);

  let html = '';
  let position = 0; // running position across all rows — matches lightbox order
  rows.forEach((row) => {
    const justifyRule = row.justified ? '' : 'justify-content:flex-start;';
    html += `<div class="justified-row" style="height:${row.height}px;gap:${gap}px;${justifyRule}">`;
    row.items.forEach((item) => {
      position++;
      const width = row.height * item.ratio;
      // Items from a blended, multi-category gallery already carry their own
      // src/alt (see initPortfolioGallery below); single-category pages build
      // it from the category name + photo number as before.
      const src = item.src || `Images/${category}/${category} (${item.num}).jpg`;
      const alt = item.alt || `${category} ${item.num}`;
      html += `
        <div class="gallery-item" style="width:${width}px" tabindex="0" role="button"
             aria-label="Open photo ${position} of ${orderedItems.length} in fullscreen view"
             onclick="openLightbox(${position})"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openLightbox(${position});}">
          <img src="${src}" alt="${alt}">
        </div>`;
    });
    html += `</div>`;
  });

  gallery.innerHTML = html;
}

/**
 * @param {string} category - folder/filename prefix under Images/
 * @param {object} [options]
 * @param {number[]} [options.carousel] - hand-pick which photo numbers appear
 *   in the hero carousel, in order, e.g. [1, 6, 7, 2, 3, 9]. Leave empty/
 *   omitted to auto-use the first N images (N = --CAROUSEL_COUNT).
 * @param {number[]} [options.order] - hand-pick the display order for the
 *   gallery grid, e.g. [3, 1, 2, 6, 4, 5]. Any photos that exist but aren't
 *   listed are appended afterwards in normal numeric order. Leave empty/
 *   omitted to just use natural numeric order (1, 2, 3...).
 */
async function initCategoryPage(category, options = {}) {

  // ── Load saved curation and merge with inline options ──────────────────────
  // curation.json (written by the upload tool) takes priority.
  // The inline carousel/order arrays in the HTML act as fallback defaults.
  try {
    const curRes = await fetch('/Images/curation.json');
    if (curRes.ok) {
      const curation = await curRes.json();
      if (curation[category]) {
        options = { ...options, ...curation[category] };
      }
    }
  } catch (_) {
    // File doesn't exist yet or failed to load — use inline options as-is
  }
  // ──────────────────────────────────────────────────────────────────────────

  
  const { carousel: carouselOrder = [], order: galleryOrderInput = [], focal: focalPoints = {} } = options;

  const gallery = document.getElementById('gallery');
  const track   = document.getElementById('carouselTrack');
  const hero    = document.querySelector('.category-hero');
  const pauseBtn = document.getElementById('carouselPauseBtn');

  const rootStyle = getComputedStyle(document.documentElement);
  const carouselTarget = parseInt(rootStyle.getPropertyValue('--CAROUSEL_COUNT')) || 4;

  // ── Show skeleton placeholders while we probe for images ──
  renderGallerySkeleton(gallery, 9);
  track.innerHTML = `<div class="skel-hero-loading skel-shimmer-bg"></div>`;

  const total = await detectImages(category);

  // ── No images found ──
  if (total.length === 0) {
    gallery.innerHTML = `<p style="padding:24px;color:var(--text-faint);font-size:0.9rem;">
      No images added yet, check back later.</p>`;
 
   hero.style.display = 'none';
    return;
  }

  const totalCount = total.length;
  const ratioByNum = new Map(total.map((item) => [item.num, item.ratio]));

  // ── Build gallery grid (in hand-picked order if provided) ──
  const galleryOrder = buildOrder(galleryOrderInput, totalCount);
  const orderedItems = galleryOrder.map((num) => ({ num, ratio: ratioByNum.get(num) }));

  gallery.style.opacity = '0';
  renderJustifiedGallery(gallery, orderedItems, category);
  requestAnimationFrame(() => {
    gallery.style.transition = 'opacity 0.4s ease';
    gallery.style.opacity = '1';
  });

  // Re-layout on resize so rows stay justified at any viewport width
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderJustifiedGallery(gallery, orderedItems, category), 150);
  });

  // ── Build hero carousel (hand-picked photos if provided, else first N) ──
  const carouselNumbers = carouselOrder.length > 0
    ? carouselOrder.filter((n) => Number.isInteger(n) && n >= 1 && n <= totalCount)
    : Array.from({ length: Math.min(carouselTarget, totalCount) }, (_, i) => i + 1);
  const carouselCount = carouselNumbers.length || 1;

  // Focal points are stored per image number, e.g. { "3": "20% 65%" }, and are
  // only meaningful for images actually used in the carousel.
  const focalStyle = (fileNum) => {
    const pos = focalPoints[fileNum] ?? focalPoints[String(fileNum)];
    return pos ? ` style="--focal: ${pos}"` : '';
  };

  let carouselHTML = '';
  carouselNumbers.forEach((fileNum) => {
    const src = `Images/${category}/${category} (${fileNum}).jpg`;
    carouselHTML += `<div class="carousel-slide"><img src="${src}" alt="${category} ${fileNum}"${focalStyle(fileNum)}></div>`;
  });
  // duplicate the first slide so the loop can snap back seamlessly
  const firstCarouselNum = carouselNumbers[0] || 1;
  carouselHTML += `<div class="carousel-slide"><img src="Images/${category}/${category} (${firstCarouselNum}).jpg" alt="${category} ${firstCarouselNum}"${focalStyle(firstCarouselNum)}></div>`;
  track.style.opacity = '0';
  track.innerHTML = carouselHTML;
  requestAnimationFrame(() => {
    track.style.transition = 'opacity 0.4s ease';
    track.style.opacity = '1';
  });

  // ── Start carousel behaviour ──
  const style      = getComputedStyle(document.documentElement);
  const pause      = parseFloat(style.getPropertyValue('--CAROUSEL_PAUSE'))      || 3;
  const transition = parseFloat(style.getPropertyValue('--CAROUSEL_TRANSITION')) || 0.6;

  let idx   = 0;
  let timer = null;
  let busy  = false;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let userPaused = prefersReducedMotion;

  function updatePauseButton() {
    if (!pauseBtn) return;
    pauseBtn.setAttribute('aria-pressed', userPaused ? 'true' : 'false');
    pauseBtn.setAttribute('aria-label', userPaused ? 'Play slideshow' : 'Pause slideshow');
    const iconPause = pauseBtn.querySelector('.icon-pause');
    const iconPlay  = pauseBtn.querySelector('.icon-play');
    if (iconPause && iconPlay) {
      iconPause.style.display = userPaused ? 'none' : 'block';
      iconPlay.style.display  = userPaused ? 'block' : 'none';
    }
  }

  window.toggleCarouselPause = function () {
    userPaused = !userPaused;
    if (userPaused) { stopCarousel(); } else { startCarousel(); }
    updatePauseButton();
  };

  function goTo(i, animate) {
    track.style.transition = animate
      ? 'transform ' + transition + 's cubic-bezier(0.76,0,0.24,1)'
      : 'none';
    if (!animate) track.getBoundingClientRect();
    track.style.transform = 'translateX(-' + (i * 100) + 'vw)';
  }

  goTo(0, false);

  function advance() {
    if (busy || carouselCount <= 1) return;
    busy = true;
    idx++;

    if (idx < carouselCount) {
      goTo(idx, true);
      setTimeout(() => { busy = false; }, transition * 1000 + 50);
    } else {
      goTo(idx, true);
      setTimeout(() => {
        idx = 0;
        goTo(0, false);
        setTimeout(() => { busy = false; }, 50);
      }, transition * 1000 + 50);
    }
  }

  function startCarousel() {
    if (timer || carouselCount <= 1 || userPaused) return;
    timer = setInterval(advance, (pause + transition) * 1000);
  }

  function stopCarousel() {
    clearInterval(timer);
    timer = null;
  }

  if (pauseBtn) {
    if (carouselCount <= 1) {
      pauseBtn.style.display = 'none';
    } else {
      updatePauseButton();
    }
  }

  const observer = new IntersectionObserver(
    (entries) => entries.forEach((entry) => entry.isIntersecting ? startCarousel() : stopCarousel()),
    { threshold: 0.1 }
  );
  observer.observe(hero);
  startCarousel();

  // ── Wire up lightbox now that images exist ──
  setupLightbox();
}

/* ─────────────────────────────────────────
   LIGHTBOX
───────────────────────────────────────── */
function setupLightbox() {
  const gallery   = document.getElementById('gallery');
  const lightbox  = document.getElementById('lightbox');
  const lbImg     = document.getElementById('lb-img');
  const lbCounter = document.getElementById('lb-counter');
  const lbPrev    = document.getElementById('lb-prev');
  const lbNext    = document.getElementById('lb-next');
  const lbClose   = lightbox.querySelector('.lightbox-close');

  const images = Array.from(gallery.querySelectorAll('.gallery-item img'));
  let current = 0;
  let lastFocusedEl = null;

  window.openLightbox = function(index) {
    lastFocusedEl = document.activeElement;
    current = index - 1;
    showImage(current);
    lightbox.classList.add('open');
    document.body.style.overflow = 'hidden';
    lbClose.focus();
    // Fallback in case the focus call above didn't take (some browsers can
    // ignore focus() on an element mid-CSS-transition) — re-assert shortly
    // after, since leaving focus on the page behind the overlay is what
    // causes the background gallery to visibly scroll/shift under it.
    setTimeout(() => {
      if (!lightbox.contains(document.activeElement)) {
        lbClose.focus();
      }
    }, 50);
  };

  window.closeLightbox = function() {
    lightbox.classList.remove('open');
    document.body.style.overflow = '';
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
      lastFocusedEl.focus();
    }
  };

  function showImage(index) {
    lbImg.classList.add('fading');
    setTimeout(() => {
      lbImg.src = images[index].src;
      lbImg.alt = images[index].alt;
      lbImg.classList.remove('fading');
    }, 150);
    lbCounter.textContent = (index + 1) + ' / ' + images.length;
    const atStart = index === 0;
    const atEnd   = index === images.length - 1;
    lbPrev.classList.toggle('hidden', atStart);
    lbNext.classList.toggle('hidden', atEnd);
    lbPrev.disabled = atStart;
    lbNext.disabled = atEnd;
  }

  window.shiftLightbox = function(dir) {
    const next = current + dir;
    if (next < 0 || next >= images.length) return;
    current = next;
    showImage(current);
  };

  function getFocusableLightboxEls() {
    return [lbClose, lbPrev, lbNext].filter((el) => el && !el.disabled);
  }

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'ArrowLeft')  window.shiftLightbox(-1);
    if (e.key === 'ArrowRight') window.shiftLightbox(1);
    if (e.key === 'Escape')     window.closeLightbox();
    if (e.key === 'Tab') {
      const focusable = getFocusableLightboxEls();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) window.closeLightbox();
  });

  let touchStartX = 0;
  lightbox.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
  lightbox.addEventListener('touchend', (e) => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) window.shiftLightbox(diff > 0 ? 1 : -1);
  });
}

/**
 * FULL PORTFOLIO GALLERY — blended, curated
 * ─────────────────────────────────────────
 * Used on portfolio.html. Pulls a hand-picked (or auto-selected) subset
 * of photos from every category and interleaves them round-robin so the
 * grid reads as one blended "best of" set rather than category blocks —
 * on purpose NOT the full archive. The point is to show enough to make
 * someone want to click into a category page for more, not everything
 * at once.
 *
 * @param {object} [curation] - per-category photo numbers to include, e.g.
 *   { People: [1, 4, 7], Cars: [2, 5], Architecture: [1, 3], Concert: [2, 6] }
 *   Leave a category's array empty/omitted to auto-use its first
 *   DEFAULT_PORTFOLIO_PER_CATEGORY images in numeric order.
 */
const DEFAULT_PORTFOLIO_PER_CATEGORY = 6;

async function initPortfolioGallery(curation = {}) {
  const categories = ['People', 'Cars', 'Architecture', 'Concert'];
  const gallery = document.getElementById('gallery');
  if (!gallery) return;

  renderGallerySkeleton(gallery, 12);

  // Detect every image that exists in each category (needed for ratios,
  // even if we only end up using a handful per category).
  const results = await Promise.all(categories.map((cat) => detectImages(cat)));

  const perCategoryItems = categories.map((cat, i) => {
    const all = results[i]; // [{ num, ratio }, ...]
    const ratioByNum = new Map(all.map((item) => [item.num, item.ratio]));
    const picks = (curation[cat] && curation[cat].length > 0)
      ? curation[cat].filter((n) => ratioByNum.has(n))
      : all.slice(0, DEFAULT_PORTFOLIO_PER_CATEGORY).map((item) => item.num);
    return picks.map((num) => ({
      ratio: ratioByNum.get(num),
      src: `Images/${cat}/${cat} (${num}).jpg`,
      alt: `${cat} ${num}`,
    }));
  });

  // Round-robin interleave across categories so the grid is blended,
  // not stacked category-by-category.
  const blended = [];
  const maxLen = Math.max(0, ...perCategoryItems.map((a) => a.length));
  for (let i = 0; i < maxLen; i++) {
    perCategoryItems.forEach((arr) => { if (arr[i]) blended.push(arr[i]); });
  }

  if (blended.length === 0) {
    gallery.innerHTML = `<p style="padding:24px;color:var(--text-faint);font-size:0.9rem;">
      No images added yet, check back later.</p>`;
    return;
  }

  gallery.style.opacity = '0';
  renderJustifiedGallery(gallery, blended, null);
  requestAnimationFrame(() => {
    gallery.style.transition = 'opacity 0.4s ease';
    gallery.style.opacity = '1';
  });

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderJustifiedGallery(gallery, blended, null), 150);
  });

  setupLightbox();
}
