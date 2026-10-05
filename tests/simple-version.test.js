import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.js';

test('professional and simple URLs serve the same working creation controls', async () => {
  const app=createApp();
  await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
  try {
    const base=`http://127.0.0.1:${app.address().port}`;
    const [professional,simple]=await Promise.all([fetch(base),fetch(`${base}/simple.html`)]);
    assert.equal(professional.status,200);
    assert.equal(simple.status,200);
    const [proHtml,simpleHtml]=await Promise.all([professional.text(),simple.text()]);
    assert.doesNotMatch(proHtml,/<html[^>]*class="simple-ui"/);
    assert.match(simpleHtml,/<html[^>]*class="simple-ui"/);
    for(const id of ['trip-curate','trip-painting-image','trip-make-object','generate','preview','export']) {
      assert.match(proHtml,new RegExp(`id="${id}"`));
      assert.match(simpleHtml,new RegExp(`id="${id}"`));
    }
    assert.match(simpleHtml,/href="\/simple\.html"/);
    assert.match(simpleHtml,/href="\/"[^>]*>专业版/);
    assert.match(simple.headers.get('content-security-policy'),/fonts\.googleapis\.com/);
    for(const asset of ['/simple.css','/src/simple-ui.js','/assets/simple-trip-preview.png','/assets/simple-object-preview.png']) {
      const response=await fetch(`${base}${asset}`);
      assert.equal(response.status,200,asset);
    }
  } finally {
    await new Promise(resolve=>app.close(resolve));
  }
});
