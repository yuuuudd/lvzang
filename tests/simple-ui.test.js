import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('creation surface exposes only essential inputs and keeps details optional',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.doesNotMatch(html,/YOUR STORY|MEMORY OBJECT|SHIGUANG|Hackathon prototype|data-story=|id="landmark"|id="caption"/);
  assert.match(html,/<input id="place"[^>]*placeholder=/);
  assert.match(html,/这一刻的画面（必选）/);
  assert.doesNotMatch(html,/id="label-text"|id="photo-type"|id="director-choices"|id="demo-panel"/);
  assert.doesNotMatch(html,/<input id="place"[^>]*value=/);
  assert.match(html,/<option value="ceramic">陶瓷釉彩<\/option>/);
  assert.match(html,/<option value="wood">木雕<\/option>/);
  assert.doesNotMatch(html,/<details[^>]*class="creation-tuning"/);
  assert.match(html,/<details[^>]*class="print-settings"/);
  assert.doesNotMatch(html,/<details[^>]*class="print-settings" open/);
  assert.match(html,/<details[^>]*class="developer-options"/);
  assert.match(html,/<select id="creation-flow"[\s\S]*<option value="manual"/);
  assert.match(html,/<select id="creation-flow"[\s\S]*<option value="auto"/);
  assert.match(html,/<details[^>]*id="trip-batch-dev"[^>]*class="developer-options"/);
  assert.doesNotMatch(html,/class="preset-field"/);
  assert.match(html,/<select id="preset"[\s\S]*<details[^>]*class="developer-options"/);
  assert.match(html,/主题预设/);
  assert.match(html,/<details[^>]*class="creation-details"/);
  assert.match(html,/<details[^>]*class="history"/);
  assert.match(html,/<summary[^>]*>生成历史/);
});
