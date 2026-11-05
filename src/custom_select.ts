/**
 * Custom Accessible Dropdown Component for Monument MUN
 * 
 * Replaces native <select> elements with an accessible, high-contrast,
 * dark navy (#0b0f2a) and gold (#d9b45a) dropdown with full keyboard navigation
 * (Arrow keys, Enter, Space, Escape, Tab), tap-to-select for mobile,
 * and ARIA listbox pattern.
 *
 * Keeps the underlying <select> element in sync so all existing form logic,
 * element IDs, required validation, and Supabase submissions work seamlessly.
 */

export function initCustomSelect(selectEl: HTMLSelectElement): void {
  if (!selectEl || selectEl.dataset.customSelectInit === 'true') {
    return;
  }

  // Mark as initialized
  selectEl.dataset.customSelectInit = 'true';

  // Visually hide native select while keeping it in DOM for IDs and form submission
  selectEl.classList.add('custom-select-hidden-native');

  // Create wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'custom-select-wrapper';
  wrapper.setAttribute('data-select-id', selectEl.id || '');

  // Find associated label if any to wire focus
  if (selectEl.id) {
    const label = document.querySelector(`label[for="${selectEl.id}"]`);
    if (label) {
      label.addEventListener('click', (e) => {
        e.preventDefault();
        triggerBtn.focus();
      });
    }
  }

  // Create trigger button
  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = 'custom-select-trigger';
  triggerBtn.setAttribute('aria-haspopup', 'listbox');
  triggerBtn.setAttribute('aria-expanded', 'false');
  if (selectEl.id) {
    triggerBtn.id = `custom-trigger-${selectEl.id}`;
  }

  const valueSpan = document.createElement('span');
  valueSpan.className = 'custom-select-value';

  const arrowSpan = document.createElement('span');
  arrowSpan.className = 'custom-select-arrow';
  arrowSpan.setAttribute('aria-hidden', 'true');
  arrowSpan.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="6 9 12 15 18 9"></polyline>
    </svg>
  `;

  triggerBtn.appendChild(valueSpan);
  triggerBtn.appendChild(arrowSpan);

  // Create dropdown menu (listbox)
  const dropdown = document.createElement('ul');
  dropdown.className = 'custom-select-dropdown';
  dropdown.setAttribute('role', 'listbox');
  dropdown.setAttribute('tabindex', '-1');
  if (selectEl.id) {
    dropdown.id = `custom-listbox-${selectEl.id}`;
    triggerBtn.setAttribute('aria-controls', dropdown.id);
  }

  let isOpen = false;
  let highlightedIndex = -1;
  const optionItems: HTMLLIElement[] = [];

  function updateTriggerDisplay(): void {
    const selectedOpt = selectEl.options[selectEl.selectedIndex];
    const text = selectedOpt ? selectedOpt.textContent || '' : '-- Please select an option --';
    valueSpan.textContent = text;

    if (!selectedOpt || selectedOpt.value === '') {
      valueSpan.classList.add('placeholder');
    } else {
      valueSpan.classList.remove('placeholder');
    }
  }

  function rebuildOptions(): void {
    dropdown.innerHTML = '';
    optionItems.length = 0;

    Array.from(selectEl.options).forEach((opt, idx) => {
      const li = document.createElement('li');
      li.className = 'custom-select-option';
      li.setAttribute('role', 'option');
      li.setAttribute('data-value', opt.value);
      li.setAttribute('data-index', String(idx));
      li.textContent = opt.textContent || '';

      const isPlaceholder = opt.value === '';
      if (isPlaceholder) {
        li.classList.add('placeholder');
      }

      if (selectEl.selectedIndex === idx) {
        li.classList.add('selected');
        li.setAttribute('aria-selected', 'true');
      } else {
        li.setAttribute('aria-selected', 'false');
      }

      // Click / tap selection
      li.addEventListener('click', (e) => {
        e.stopPropagation();
        selectOption(idx);
      });

      dropdown.appendChild(li);
      optionItems.push(li);
    });

    updateTriggerDisplay();
  }

  function openDropdown(): void {
    if (isOpen || selectEl.disabled) return;

    // Close any other open custom selects on the page
    document.querySelectorAll('.custom-select-wrapper.is-open').forEach((other) => {
      if (other !== wrapper) {
        const otherTrigger = other.querySelector('.custom-select-trigger') as HTMLButtonElement | null;
        if (otherTrigger) {
          otherTrigger.setAttribute('aria-expanded', 'false');
        }
        other.classList.remove('is-open');
      }
    });

    isOpen = true;
    wrapper.classList.add('is-open');
    triggerBtn.setAttribute('aria-expanded', 'true');

    // Highlight current selected index
    highlightedIndex = selectEl.selectedIndex >= 0 ? selectEl.selectedIndex : 0;
    highlightOption(highlightedIndex);

    // Scroll highlighted item into view if needed
    if (optionItems[highlightedIndex]) {
      optionItems[highlightedIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  function closeDropdown(focusTrigger = true): void {
    if (!isOpen) return;
    isOpen = false;
    wrapper.classList.remove('is-open');
    triggerBtn.setAttribute('aria-expanded', 'false');
    removeHighlight();
    if (focusTrigger) {
      triggerBtn.focus();
    }
  }

  function highlightOption(index: number): void {
    optionItems.forEach((item, i) => {
      if (i === index) {
        item.classList.add('highlighted');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('highlighted');
      }
    });
    highlightedIndex = index;
  }

  function removeHighlight(): void {
    optionItems.forEach((item) => item.classList.remove('highlighted'));
    highlightedIndex = -1;
  }

  function selectOption(index: number): void {
    if (index < 0 || index >= selectEl.options.length) return;

    selectEl.selectedIndex = index;
    selectEl.value = selectEl.options[index].value;

    // Dispatch native change and input events so all forms and listeners catch the change
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    selectEl.dispatchEvent(new Event('input', { bubbles: true }));

    // Update custom items styling
    optionItems.forEach((item, i) => {
      const isSelected = i === index;
      if (isSelected) {
        item.classList.add('selected');
        item.setAttribute('aria-selected', 'true');
      } else {
        item.classList.remove('selected');
        item.setAttribute('aria-selected', 'false');
      }
    });

    updateTriggerDisplay();
    closeDropdown(true);
  }

  // Trigger button click
  triggerBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOpen) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  // Keyboard navigation on trigger button & dropdown
  triggerBtn.addEventListener('keydown', (e) => {
    if (selectEl.disabled) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else {
          const nextIndex = Math.min(highlightedIndex + 1, optionItems.length - 1);
          highlightOption(nextIndex);
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else {
          const prevIndex = Math.max(highlightedIndex - 1, 0);
          highlightOption(prevIndex);
        }
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        if (!isOpen) {
          openDropdown();
        } else {
          if (highlightedIndex >= 0 && highlightedIndex < optionItems.length) {
            selectOption(highlightedIndex);
          } else {
            closeDropdown();
          }
        }
        break;

      case 'Escape':
        if (isOpen) {
          e.preventDefault();
          e.stopPropagation();
          closeDropdown(true);
        }
        break;

      case 'Tab':
        if (isOpen) {
          closeDropdown(false);
        }
        break;

      default:
        // Type-ahead by first letter
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const char = e.key.toLowerCase();
          const matchIndex = Array.from(selectEl.options).findIndex((opt, idx) => {
            if (isOpen && idx <= highlightedIndex) return false;
            return (opt.textContent || '').trim().toLowerCase().startsWith(char);
          });
          const targetIndex = matchIndex !== -1 ? matchIndex : Array.from(selectEl.options).findIndex((opt) =>
            (opt.textContent || '').trim().toLowerCase().startsWith(char)
          );
          if (targetIndex !== -1) {
            e.preventDefault();
            if (!isOpen) {
              openDropdown();
            }
            highlightOption(targetIndex);
          }
        }
        break;
    }
  });

  // Click outside listener
  const onDocumentClick = (e: MouseEvent) => {
    if (isOpen && !wrapper.contains(e.target as Node)) {
      closeDropdown(false);
    }
  };
  document.addEventListener('click', onDocumentClick);

  // Sync if native select changes programmatically (e.g. form reset or script update)
  selectEl.addEventListener('change', () => {
    optionItems.forEach((item, i) => {
      const isSelected = i === selectEl.selectedIndex;
      if (isSelected) {
        item.classList.add('selected');
        item.setAttribute('aria-selected', 'true');
      } else {
        item.classList.remove('selected');
        item.setAttribute('aria-selected', 'false');
      }
    });
    updateTriggerDisplay();
  });

  // Build DOM
  rebuildOptions();
  wrapper.appendChild(triggerBtn);
  wrapper.appendChild(dropdown);

  // Insert wrapper right after the native select
  if (selectEl.parentNode) {
    selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);
  }
}

/**
 * Initializes custom selects on all select elements inside a root container
 */
export function initAllCustomSelects(root?: HTMLElement | Document | null): void {
  const container = root || document;
  const selects = container.querySelectorAll<HTMLSelectElement>('select.form-select, select');
  selects.forEach((sel) => {
    initCustomSelect(sel);
  });
}
