'use client';

/**
 * form.requestSubmit() with a fallback for older browsers (iOS Safari < 16,
 * older Android WebViews) where it doesn't exist — there, buttons that submit
 * from a confirm dialog used to do nothing and looked "stuck".
 */
export function submitForm(form: HTMLFormElement | null | undefined) {
  if (!form) return;
  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit();
    return;
  }
  const btn = document.createElement('button');
  btn.type = 'submit';
  btn.hidden = true;
  form.appendChild(btn);
  btn.click();
  form.removeChild(btn);
}
