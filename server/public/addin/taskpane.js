import { mountSuperdoc } from '/static/superdoc-init.js';

Office.onReady(() => {
  try {
    mountSuperdoc({
      selector: '#superdoc',
      toolbar: '#superdoc-toolbar',
      document: '/documents/default.docx',
      documentMode: 'editing',
      pagination: true,
      rulers: true,
    });
  } catch (e) {
    const el = document.getElementById('superdoc');
    el.innerHTML = `<div style="padding:12px">Failed to init: ${e?.message || e}</div>`;
    console.error('Taskpane init error', e);
  }
});


