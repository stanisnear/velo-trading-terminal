type ThemeTransition = { ready: Promise<void>; finished: Promise<void>; skipTransition: () => void };
let current: ThemeTransition | undefined;

/** Progressive enhancement: the same theme callback runs once, with or without motion. */
export function transitionAppearance(apply: () => void, origin: HTMLElement) {
  const doc = document as Document & { startViewTransition?: (update: () => void) => ThemeTransition };
  current?.skipTransition();
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { apply(); return; }
  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  let applied = false;
  const once = () => { if (!applied) { applied = true; apply(); } };
  try {
    const transition = doc.startViewTransition(once);
    current = transition;
    void transition.ready.then(() => {
      document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 420, easing: 'cubic-bezier(.22,.8,.2,1)', pseudoElement: '::view-transition-new(root)', fill: 'both' });
    }).catch(() => {});
    void transition.finished.catch(() => {}).finally(() => { if (current === transition) current = undefined; });
  } catch { once(); }
}
