import test from 'node:test';
import assert from 'node:assert/strict';
import { createJourneyInspector } from '../public/src/travel-map-journey.js';

function inspectorFixture() {
  const nodes = new Map();
  const node = () => ({ textContent: '', dataset: {}, hidden: false, disabled: false, prepend() {} });
  const previous = globalThis.document;
  globalThis.document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); }, createElement: node };
  const requests = [];
  const lines = [];
  const inspector = createJourneyInspector({
    requestRoute: async (_mode, from, to) => { requests.push({ from: [...from.position], to: [...to.position] }); return { meters: 1200, seconds: 600, path: [from.position, to.position] }; },
    drawRoute: route => lines.push(route), clearRoute: () => { lines.length = 0; }, highlight() {},
  });
  const museum = { id: 'museum', name: '博物馆', position: [113.31, 23.12], city: '广州', address: '' };
  const square = { id: 'square', name: '商圈', kind: 'exploration', position: [113.32, 23.13], city: '广州', address: '' };
  const location = { id: 'current-location', name: '我的位置', position: [113.3, 23.1], city: '广州', address: '' };
  inspector.reset({ landmarkStops: [museum, square], mode: 'walk' });
  inspector.updatePlaces(new Map([[museum.id, museum], [square.id, square]]));
  return { inspector, museum, square, location, nodes, requests, lines, restore: () => { globalThis.document = previous; } };
}

test('refreshing current position recalculates an existing destination and draws the fresh route', async () => {
  const fixture = inspectorFixture();
  try {
    fixture.inspector.setCurrentLocation(fixture.location);
    fixture.inspector.choose(fixture.museum.id);
    await Promise.resolve();
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.lines.length, 1);
    fixture.inspector.setCurrentLocation({ ...fixture.location, position: [113.305, 23.105] });
    await Promise.resolve();
    assert.equal(fixture.requests.length, 2, 'A refreshed device origin must recalculate, even when the origin and destination IDs are unchanged');
    assert.deepEqual(fixture.requests[1].from, [113.305, 23.105]);
    assert.equal(fixture.lines.length, 1, 'The route cleared for the refresh must be drawn again');
  } finally { fixture.restore(); }
});

test('filtering out a destination preserves an explicitly chosen device origin for the next place', async () => {
  const fixture = inspectorFixture();
  try {
    fixture.inspector.setCurrentLocation(fixture.location);
    fixture.inspector.choose(fixture.square.id);
    await Promise.resolve();
    fixture.inspector.reset({ landmarkStops: [fixture.museum], mode: 'walk', preserve: true });
    fixture.inspector.updatePlaces(new Map([[fixture.museum.id, fixture.museum]]));
    assert.equal(fixture.nodes.get('map-origin').textContent, '我的位置', 'Changing a category must not silently replace the chosen current-position origin');
    fixture.inspector.choose(fixture.museum.id);
    await Promise.resolve();
    assert.deepEqual(fixture.requests.at(-1).from, fixture.location.position);
    assert.deepEqual(fixture.requests.at(-1).to, fixture.museum.position);
  } finally { fixture.restore(); }
});
