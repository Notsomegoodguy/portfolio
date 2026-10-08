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
  const ctx = canvas.getContext('2d');
  const content = document.getElementById('heroContent');
  const loader = document.getElementById('heroLoader');
  const loaderText = document.getElementById('heroLoaderText');
  const hint = document.getElementById('heroHint');
  const progressFill = document.querySelector('.scroll-progress span');
  const panels = [...document.querySelectorAll('[data-panel]')];
  const projects = [...document.querySelectorAll('[data-project]')];
  const projectSelectors = [...document.querySelectorAll('[data-project-select]')];
  const N = CONFIG.frameCount;
  const frames = new Array(N);
  let loaded = 0, target = 0, current = 0, lastDrawn = -1, raf = 0, dpr = 1;
  let selectedProject = -1;
  let manuallySelectedProject = false;
  const panelRanges = {
    projects: [0.16, 0.48],
    reviews: [0.50, 0.63],
    stack: [0.65, 0.75],
    blog: [0.77, 0.88],
    contact: [0.90, 1.01],
  };

  /* ---------- sizing ---------- */
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(canvas.clientWidth * dpr);
    canvas.height = Math.round(canvas.clientHeight * dpr);
    lastDrawn = -1; draw(Math.round(current));
  }

  function draw(i) {
    // fall back to nearest loaded frame so scrubbing never shows a blank canvas
    let img = frames[i];
    if (!img || !img.complete || !img.naturalWidth) {
      for (let d = 1; d < N; d++) {
        const a = frames[i - d], b = frames[i + d];
        if (a && a.naturalWidth) { img = a; break; }
        if (b && b.naturalWidth) { img = b; break; }
      }
    }
    if (!img || !img.naturalWidth) return;
    const cw = canvas.width, ch = canvas.height;
    const s = (CONFIG.fit === 'cover' ? Math.max : Math.min)(cw / img.naturalWidth, ch / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.fillStyle = '#02060d'; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    lastDrawn = i;
  }

  /* ---------- preloading ---------- */
  function load(i) {
    return new Promise(res => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = img.onerror = () => {
        loaded++;
        loaderText.textContent = Math.round(loaded / N * 100) + '%';
        res();
      };
      img.src = CONFIG.framePath(i + 1);
      frames[i] = img;
    });
  }

  async function preload() {
    // first frame immediately so something shows fast, then the rest in small parallel batches
    await load(0);
    resize();
    const queue = [...Array(N - 1).keys()].map(k => k + 1);
    const workers = Array.from({ length: 6 }, async () => {
      while (queue.length) await load(queue.shift());
    });
    await Promise.all(workers);
    loader.classList.add('is-done');
    onScroll();
  }

  /* ---------- scroll mapping ---------- */
  function progress() {
    const r = hero.getBoundingClientRect();
    const total = hero.offsetHeight - window.innerHeight;
    return Math.min(1, Math.max(0, -r.top / total));
  }

  function onScroll() {
    manuallySelectedProject = false;
    target = progress() * (N - 1);
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    current += (target - current) * CONFIG.smoothing;
    if (Math.abs(target - current) < 0.01) current = target;
    const i = Math.round(current);
    if (i !== lastDrawn) draw(i);
    updateText(progress());
    updatePanels(progress());
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
    for (const panel of panels) {
      const [start, end] = panelRanges[panel.dataset.panel];
      const fade = 0.025;
      const entering = Math.max(0, Math.min(1, (p - start) / fade));
      const leaving = Math.max(0, Math.min(1, (end - p) / fade));
      const easedEntry = entering * entering * (3 - 2 * entering);
      const easedExit = leaving * leaving * (3 - 2 * leaving);
      const reveal = Math.min(easedEntry, easedExit);
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const opacity = reducedMotion ? Math.min(entering, leaving) : reveal;
      const visible = opacity > 0.02;
      const offset = reducedMotion ? (1 - Math.min(entering, leaving)) * 24 : (1 - reveal) * 16;
      const depth = reducedMotion ? 0 : (1 - reveal) * -620;
      const scale = reducedMotion ? 1 : 0.72 + reveal * 0.28;

      panel.style.opacity = String(Math.max(0, opacity));
      panel.style.transform = `translate3d(0, ${offset}px, ${depth}px) scale(${scale})`;
      panel.style.visibility = visible ? 'visible' : 'hidden';
      panel.style.pointerEvents = visible ? 'auto' : 'none';
      panel.inert = !visible;
      panel.setAttribute('aria-hidden', String(!visible));

      const staggeredElements = panel.querySelectorAll(':scope > *, .review-card, .blog-card, .stack-list span');
      let cardIndex = 0;
      staggeredElements.forEach((element, index) => {
        let delay = index * 0.12;
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
    if (!manuallySelectedProject) {
      const projectProgress = Math.max(0, Math.min(1, (p - projectsStart - 0.01) / (projectsEnd - projectsStart - 0.02)));
      const projectIndex = Math.min(projects.length - 1, Math.floor(projectProgress * projects.length));
      setSelectedProject(projectIndex);
    }
  }

  function setSelectedProject(index, force = false) {
    if (index === selectedProject && !force) return;
    selectedProject = index;

    projects.forEach((card, cardIndex) => {
      const position = (cardIndex - selectedProject + projects.length) % projects.length;
      const isActive = position === 0;
      const direction = position <= projects.length / 2 ? -1 : 1;
      const depth = Math.min(position, projects.length - position);
      const sideOffset = window.matchMedia('(max-width: 700px)').matches
        ? 70 + (depth - 1) * 10
        : 22 + depth * 12;
      const x = isActive ? 0 : direction * sideOffset;
      const mobile = window.matchMedia('(max-width: 700px)').matches;
      const z = isActive ? (mobile ? 80 : 150) : -depth * 120;
      const rotation = isActive ? 0 : -direction * 18;
      const scale = isActive ? (mobile ? 0.84 : 1) : 1 - depth * 0.09;

      card.style.transform = `translate3d(${x}%, 0, ${z}px) rotateY(${rotation}deg) scale(${scale})`;
      card.style.zIndex = String(projects.length - depth);
      card.setAttribute('aria-hidden', String(!isActive));
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
    if (selectedProject >= 0) setSelectedProject(selectedProject, true);
    onScroll();
  });
  resize(); updateText(0); updatePanels(0); preload();
})();
