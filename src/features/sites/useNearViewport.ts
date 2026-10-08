import { useEffect, useState, type RefObject } from 'react';

/**
 * True once the element has come within `rootMargin` of the viewport, and true from then on (a card that loaded
 * its numbers keeps them when scrolled away). Browsers without IntersectionObserver load at once.
 */
export function useNearViewport(ref: RefObject<Element | null>, rootMargin: string): boolean {
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setNear(true);
    }, { rootMargin });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [ref, rootMargin, near]);

  return near;
}
