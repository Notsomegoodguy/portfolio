/* Scroll-controlled image-sequence hero.
 * Drop your frames in /frames and adjust CONFIG below. */
const CONFIG = {
  frameCount: 162,                          // total number of frames
  framePath: i => `frames/ezgif-frame-${String(i).padStart(3, '0')}.jpg`, // i runs 1..frameCount
  textFadeEnd: 0.14,                       // fraction of hero scroll at which text is fully gone
  smoothing: 0.04,                          // 0..1, higher = snappier, lower = silkier
  fit: 'cover',                             // 'cover' fills the screen; 'contain' shows whole frame
};

(() => {
  const hero = document.getElementById('hero');
  const canvas = document.getElementById('heroCanvas');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const content = document.getElementById('heroContent');
  const loader = document.getElementById('heroLoader');
  const loaderText = document.getElementById('heroLoaderText');
  const hint = document.getElementById('heroHint');
  const progressFill = document.querySelector('.scroll-progress span');
  const reviewAvatar = document.querySelector('.review-avatar__image');
  const panels = [...document.querySelectorAll('[data-panel]')];
  const panelMotion = panels.map(panel => ({
    element: panel,
    start: 0,
    end: 0,
    visible: false,
    children: [...panel.querySelectorAll(':scope > *, .review-card, .blog-card, .stack-list span')],
  }));
  const projects = [...document.querySelectorAll('[data-project]')];
  const projectSelectors = [...document.querySelectorAll('[data-project-select]')];
  const N = CONFIG.frameCount;
  const frameCache = new Map();
  const failedFrames = new Set();
  const pendingFrames = new Set();
  let frameQueue = [];
  let activeFrameLoads = 0, loaded = 0, target = 0, current = 0, lastDrawn = -1, raf = 0, dpr = 1;
  let lastScheduledFrame = -1, scrollDirection = 1;
  let selectedProject = -1;
  let manuallySelectedProject = false;
  const mobileQuery = window.matchMedia('(max-width: 700px)');
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let scrollStart = 0, scrollDistance = 1;
  const panelRanges = {
    projects: [0.16, 0.48],
    reviews: [0.50, 0.63],
    stack: [0.65, 0.75],
    blog: [0.77, 0.88],
    contact: [0.90, 1.01],
  };
  panelMotion.forEach(state => {
    [state.start, state.end] = panelRanges[state.element.dataset.panel];
  });

  /* ---------- sizing ---------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, mobileQuery.matches ? 1.25 : 1.75);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    scrollStart = hero.offsetTop;
    scrollDistance = Math.max(1, hero.offsetHeight - window.innerHeight);
    lastDrawn = -1;
    draw(Math.round(current));
  }

  function draw(i) {
    let img = frameCache.get(i);
    if (!img) {
      let closestDistance = Infinity;
      for (const [frameIndex, cachedImage] of frameCache) {
        const distance = Math.abs(frameIndex - i);
        if (distance < closestDistance) {
          img = cachedImage;
          closestDistance = distance;
        }
      }
    }
    if (!img) return;
    const cw = canvas.width, ch = canvas.height;
    const s = (CONFIG.fit === 'cover' ? Math.max : Math.min)(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.fillStyle = '#02060d'; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    lastDrawn = i;
  }

  /* ---------- preloading ---------- */
  function trimFrameCache() {
    const maxCachedFrames = mobileQuery.matches ? 6 : 10;
    if (frameCache.size <= maxCachedFrames) return;

    const keep = new Set([...frameCache.keys()]
      .sort((a, b) => Math.abs(a - target) - Math.abs(b - target))
      .slice(0, maxCachedFrames));

    for (const [index, image] of frameCache) {
      if (keep.has(index)) continue;
      image.onload = null;
      image.onerror = null;
      frameCache.delete(index);
    }
  }

  function pumpFrameQueue() {
    const maxConcurrentLoads = mobileQuery.matches ? 3 : 4;
    while (activeFrameLoads < maxConcurrentLoads && frameQueue.length) {
      const index = frameQueue.shift();
      if (frameCache.has(index) || pendingFrames.has(index) || failedFrames.has(index)) continue;

      const image = new Image();
      image.decoding = 'async';
      pendingFrames.add(index);
      activeFrameLoads++;
      image.onload = () => {
        pendingFrames.delete(index);
        activeFrameLoads--;
        frameCache.set(index, image);
        loaded++;
        loaderText.textContent = Math.min(100, Math.round(loaded / N * 100)) + '%';
        trimFrameCache();

        if (index === 0) loader.classList.add('is-done');
        if (Math.abs(index - Math.round(current)) <= 1) {
          lastDrawn = -1;
          draw(Math.round(current));
        }
        pumpFrameQueue();
      };
      image.onerror = () => {
        pendingFrames.delete(index);
        activeFrameLoads--;
        failedFrames.add(index);
        console.error(`Unable to load animation frame ${index + 1}: ${CONFIG.framePath(index + 1)}`);
        if (index === 0) {
          loaderText.textContent = 'Animation unavailable';
          loader.classList.add('is-done');
        }
        pumpFrameQueue();
      };
      image.src = CONFIG.framePath(index + 1);
    }
  }

  function scheduleFrameLoads(index) {
    const nextFrame = Math.max(0, Math.min(N - 1, index));
    if (nextFrame === lastScheduledFrame) return;
    if (lastScheduledFrame >= 0 && nextFrame !== lastScheduledFrame) {
      scrollDirection = Math.sign(nextFrame - lastScheduledFrame) || scrollDirection;
    }
    lastScheduledFrame = nextFrame;

    frameQueue = [];
    const offsets = [0];
    for (let step = 1; step <= 8; step++) offsets.push(step * scrollDirection);
    for (let step = 1; step <= 2; step++) offsets.push(-step * scrollDirection);

    for (const offset of offsets) {
      const candidate = nextFrame + offset;
      if (candidate < 0 || candidate >= N ||
          frameCache.has(candidate) || pendingFrames.has(candidate) || failedFrames.has(candidate)) continue;
      frameQueue.push(candidate);
    }
    pumpFrameQueue();
  }

  function preload() {
    scheduleFrameLoads(0);
  }

  /* ---------- scroll mapping ---------- */
  function progress() {
    return Math.min(1, Math.max(0, (window.scrollY - scrollStart) / scrollDistance));
  }

  function onScroll() {
    manuallySelectedProject = false;
    target = progress() * (N - 1);
    scheduleFrameLoads(Math.round(target));
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    current += (target - current) * CONFIG.smoothing;
    if (Math.abs(target - current) < 0.01) current = target;
    const i = Math.round(current);
    if (i !== lastDrawn) draw(i);
    const scrollProgress = progress();
    updateText(scrollProgress);
    updatePanels(scrollProgress);
    raf = current === target ? 0 : requestAnimationFrame(tick);
  }

  /* ---------- text: moves along Z toward the viewer and fades out ---------- */
  function updateText(p) {
    const t = Math.min(1, p / CONFIG.textFadeEnd);          // 0 → 1 over the first part of the scroll
    const e = t * t * (3 - 2 * t);                           // smoothstep
    const z = e * 700;                                       // px toward the camera
    content.style.transform = `translate3d(0,0,${z}px)`;
    content.style.opacity = String(1 - Math.min(1, e * 1.15));
    content.style.visibility = e >= 1 ? 'hidden' : 'visible';// removes it from hit-testing & tab order once gone
    content.style.pointerEvents = e > 0.6 ? 'none' : '';
    hint.style.opacity = String(Math.max(0, 0.6 * (1 - p * 25)));
    progressFill.style.transform = `scaleX(${p})`;
  }

  function updatePanels(p) {
    for (const state of panelMotion) {
      const { element: panel, start, end, children } = state;
      if (p <= start || p >= end) {
        if (state.visible) {
          state.visible = false;
          panel.style.opacity = '0';
          panel.style.visibility = 'hidden';
          panel.style.pointerEvents = 'none';
          panel.inert = true;
          panel.setAttribute('aria-hidden', 'true');
        }
        continue;
      }

      const fade = 0.025;
      const entering = Math.max(0, Math.min(1, (p - start) / fade));
      const leaving = Math.max(0, Math.min(1, (end - p) / fade));
      const easedEntry = entering * entering * (3 - 2 * entering);
      const easedExit = leaving * leaving * (3 - 2 * leaving);
      const reveal = Math.min(easedEntry, easedExit);
      const reducedMotion = reducedMotionQuery.matches;
      const opacity = reducedMotion ? Math.min(entering, leaving) : reveal;
      const visible = opacity > 0.02;
      const offset = reducedMotion ? (1 - Math.min(entering, leaving)) * 24 : (1 - reveal) * 16;
      const depth = reducedMotion ? 0 : (1 - reveal) * -620;
      const scale = reducedMotion ? 1 : 0.72 + reveal * 0.28;

      state.visible = visible;
      panel.style.opacity = String(Math.max(0, opacity));
      panel.style.transform = `translate3d(0, ${offset}px, ${depth}px) scale(${scale})`;
      panel.style.visibility = visible ? 'visible' : 'hidden';
      panel.style.pointerEvents = visible ? 'auto' : 'none';
      panel.inert = !visible;
      panel.setAttribute('aria-hidden', String(!visible));
      if (visible && panel.dataset.panel === 'reviews' && reviewAvatar.dataset.src) {
        reviewAvatar.src = reviewAvatar.dataset.src;
        delete reviewAvatar.dataset.src;
      }

      let cardIndex = 0;
      children.forEach((element, childIndex) => {
        let delay = childIndex * 0.12;
        if (element.matches('.review-card, .blog-card, .stack-list span')) {
          delay = 0.2 + cardIndex * 0.08;
          cardIndex++;
        }

        const localProgress = Math.max(0, Math.min(1, (reveal - delay) / (1 - delay)));
        const easedProgress = localProgress * localProgress * (3 - 2 * localProgress);
        const childDepth = reducedMotion ? 0 : (1 - easedProgress) * -260;
        const childScale = reducedMotion ? 1 : 0.82 + easedProgress * 0.18;

        element.style.opacity = reducedMotion ? '' : String(easedProgress);
        element.style.transform = reducedMotion ? '' : `translate3d(0, 0, ${childDepth}px) scale(${childScale})`;
      });
    }

    const [projectsStart, projectsEnd] = panelRanges.projects;
    if (!manuallySelectedProject && p >= projectsStart && p <= projectsEnd) {
      const projectProgress = Math.max(0, Math.min(1, (p - projectsStart - 0.01) / (projectsEnd - projectsStart - 0.02)));
      const projectIndex = Math.min(projects.length - 1, Math.floor(projectProgress * projects.length));
      setSelectedProject(projectIndex);
    }
  }

  function setSelectedProject(index, force = false) {
    if (index === selectedProject && !force) return;
    selectedProject = index;
    const mobile = mobileQuery.matches;

    projects.forEach((card, cardIndex) => {
      const position = (cardIndex - selectedProject + projects.length) % projects.length;
      const isActive = position === 0;
      const direction = position <= projects.length / 2 ? -1 : 1;
      const depth = Math.min(position, projects.length - position);
      const sideOffset = mobile
        ? 70 + (depth - 1) * 10
        : 22 + depth * 12;
      const x = isActive ? 0 : direction * sideOffset;
      const z = isActive ? (mobile ? 80 : 150) : -depth * 120;
      const rotation = isActive ? 0 : -direction * 18;
      const scale = isActive ? (mobile ? 0.84 : 1) : 1 - depth * 0.09;

      card.style.transform = `translate3d(${x}%, 0, ${z}px) rotateY(${rotation}deg) scale(${scale})`;
      card.style.zIndex = String(projects.length - depth);
      card.setAttribute('aria-hidden', String(!isActive));
      if (position <= 1 || position === projects.length - 1) {
        const image = card.querySelector('.project-card__image');
        if (image.dataset.src) {
          image.src = image.dataset.src;
          delete image.dataset.src;
        }
      }
      card.querySelectorAll('a').forEach(link => {
        link.tabIndex = isActive ? 0 : -1;
      });
    });

    projectSelectors.forEach((button, buttonIndex) => {
      button.setAttribute('aria-pressed', String(buttonIndex === selectedProject));
    });
  }

  projects.forEach((card, index) => {
    card.addEventListener('click', event => {
      if (!event.target.closest('a')) {
        manuallySelectedProject = true;
        setSelectedProject(index);
      }
    });
  });

  projectSelectors.forEach(button => {
    button.addEventListener('click', () => {
      manuallySelectedProject = true;
      setSelectedProject(Number(button.dataset.projectSelect));
    });
  });

  document.querySelectorAll('[data-scroll-to]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      const destination = Number(link.dataset.scrollTo);
      const scrollDistance = hero.offsetHeight - window.innerHeight;
      window.scrollTo({
        top: hero.offsetTop + destination * scrollDistance,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    });
  });

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    resize();
    trimFrameCache();
    if (selectedProject >= 0) setSelectedProject(selectedProject, true);
    onScroll();
  });
  resize(); updateText(0); updatePanels(0); preload();
})();
