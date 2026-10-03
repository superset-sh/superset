(() => {
  const key = 'superset-pr-pane-design-v1';
  let saved = null;
  try {
    const stored = localStorage.getItem(key);
    if (stored && stored.length <= 16384) saved = JSON.parse(stored);
    else if (stored) localStorage.removeItem(key);
  } catch {}
  window.supersetPrototypeState = {
    widgetState: saved,
    setWidgetState: async snapshot => {
      const serialized = JSON.stringify(snapshot);
      if (serialized.length > 16384) return;
      window.supersetPrototypeState.widgetState = snapshot;
      try { localStorage.setItem(key, serialized); } catch {}
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons({ attrs: { width: 16, height: 16 } });
    const tooltip = document.createElement('div');
    tooltip.className = 'pane-page-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    tooltip.id = 'pane-page-tooltip';
    tooltip.hidden = true;
    document.body.append(tooltip);
    let active = null;
    function hide() {
      active?.removeAttribute('aria-describedby');
      active = null;
      tooltip.hidden = true;
    }
    function show(event) {
      const trigger = event.target.closest('[data-tooltip]');
      if (!trigger) return;
      hide();
      active = trigger;
      tooltip.textContent = trigger.dataset.tooltip;
      tooltip.hidden = false;
      trigger.setAttribute('aria-describedby', tooltip.id);
      const anchor = trigger.getBoundingClientRect();
      const box = tooltip.getBoundingClientRect();
      tooltip.style.left = `${window.scrollX + Math.max(12, Math.min(anchor.left + (anchor.width - box.width) / 2, window.innerWidth - box.width - 12))}px`;
      tooltip.style.top = `${window.scrollY + (anchor.top > box.height + 12 ? anchor.top - box.height - 7 : anchor.bottom + 7)}px`;
    }
    document.addEventListener('pointerover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('pointerout', event => {
      if (active && !active.contains(event.relatedTarget)) hide();
    });
    document.addEventListener('focusout', hide);
    document.addEventListener('click', hide);
    document.addEventListener('keydown', event => { if (event.key === 'Escape') hide(); });
    window.addEventListener('scroll', hide, { passive: true });
    window.addEventListener('resize', hide);
  });
})();
