import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUrl = new URL('../travel-research.js', import.meta.url);
const api = () => import(moduleUrl);
const now = () => Date.parse('2026-10-07T07:00:00.000Z');
const rss = `<rss><channel><item><title>广州小众散步</title><link>https://www.gz.gov.cn/travel/guide.html</link><description>广州天河散步路线与公共交通。</description><pubDate>Tue, 06 Oct 2026 08:00:00 GMT</pubDate></item><item><title>广州攻略分享</title><link>https://www.xiaohongshu.com/explore/abc</link><description>天河区的天环和正佳广场。</description></item></channel></rss>`;
const deps = fetchImpl => ({ fetchImpl, now, cache: new Map(), timeoutMs: 30 });

test('public RSS search gives traceable snippets without claiming page content was fetched', async () => {
  const { searchTravelWeb } = await api();
  let request;
  const result = await searchTravelWeb({ city: '广州', query: '天河 小众 饮食' }, deps(async (url, options) => {
    request = { url: new URL(url), options };
    return new Response(rss, { headers: { 'content-type': 'text/xml' } });
  }));
  assert.equal(request.url.hostname, 'www.bing.com');
  assert.equal(request.url.searchParams.get('format'), 'rss');
  assert.match(request.url.searchParams.get('q'), /广州/);
  assert.equal(request.options.redirect, 'manual');
  assert.equal(request.options.credentials, 'omit');
  assert.equal(request.options.headers.Authorization, undefined);
  assert.equal(request.options.headers.Cookie, undefined);
  assert.equal(result.status, 'ok');
  assert.equal(result.sources.length, 2);
  assert.equal(result.sources[0].accessStatus, 'search-snippet');
  assert.equal(result.sources[0].fetchedAt, '2026-10-07T07:00:00.000Z');
  assert.equal(result.untrusted, true);
  assert.deepEqual(result.queries[0].sourceIds, result.sources.map(source => source.id));
});

test('allowed public page extracts text and source time, ignoring scripts and unexecuted markup', async () => {
  const { fetchTravelPage } = await api();
  const html = `<html><head><title>广州游览提示</title><meta property="article:published_time" content="2026-10-06T10:00:00+08:00"></head><body><nav>菜单</nav><article><h1>广州游览提示</h1><p>天河商圈适合步行串联，出行前核实营业安排。</p><p>请根据预算和体力安排停留时间，热门景点建议提前查看预约规则。</p></article><script>fetch('http://localhost:4180/secret')</script></body></html>`;
  const result = await fetchTravelPage({ url: 'https://www.gz.gov.cn/travel/guide.html' }, deps(async () => new Response(html, { headers: { 'content-type': 'text/html' } })));
  assert.equal(result.status, 'ok');
  assert.equal(result.sources[0].accessStatus, 'fetched');
  assert.match(result.sources[0].excerpt, /天河商圈/);
  assert.doesNotMatch(result.sources[0].excerpt, /fetch|localhost|菜单/);
  assert.equal(result.sources[0].publishedAt, '2026-10-06T02:00:00.000Z');
  assert.equal(result.untrusted, true);
});

test('unsafe schemes, private addresses, credentials, ports, fragments and lookalike hosts never fetch', async () => {
  const { fetchTravelPage } = await api();
  let calls = 0;
  const config = deps(async () => { calls += 1; return new Response('should never fetch'); });
  for (const url of ['http://www.gz.gov.cn/x', 'https://127.0.0.1/x', 'https://2130706433/x', 'https://[::1]/x', 'https://localhost/x', 'https://user:pass@www.gz.gov.cn/x', 'https://www.gz.gov.cn:444/x', 'https://www.gz.gov.cn/x#secret', 'https://www.gz.gov.cn.evil.example/x', 'https://evil.example/?url=https://www.gz.gov.cn']) {
    const result = await fetchTravelPage({ url }, config);
    assert.equal(result.status, 'unavailable', url);
    assert.equal(result.sources[0]?.accessStatus, 'blocked', url);
  }
  assert.equal(calls, 0);
});

test('every redirect is revalidated and credentials are never forwarded', async () => {
  const { fetchTravelPage } = await api();
  const calls = [];
  const result = await fetchTravelPage({ url: 'https://xhslink.com/a/safe' }, deps(async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
  }));
  assert.equal(calls.length, 1);
  assert.equal(result.sources[0].accessStatus, 'blocked');
  assert.equal(result.status, 'unavailable');
});

test('public XHS login and challenge pages are explicit blocked results without fabricated excerpts', async () => {
  const { fetchTravelPage } = await api();
  for (const text of ['<title>小红书</title><body>登录后查看完整内容 扫码登录</body>', '<title>安全验证</title><body>请完成验证码验证</body>']) {
    const result = await fetchTravelPage({ url: 'https://www.xiaohongshu.com/explore/abc' }, deps(async () => new Response(text, { headers: { 'content-type': 'text/html' } })));
    assert.equal(result.status, 'unavailable');
    assert.equal(result.sources[0].accessStatus, 'blocked');
    assert.equal(result.sources[0].excerpt, '');
    assert.match(result.sources[0].error, /登录|验证/);
  }
});

test('public XHS article content is usable when present without a login wall', async () => {
  const { fetchTravelPage } = await api();
  const html = '<title>广州街区漫游 - 小红书</title><article>广州天河商圈有天环、正佳和体育中心，安排时应根据用户购物和饮食偏好选择停留点。周末人多，避开高峰能减少等待。</article>';
  const result = await fetchTravelPage({ url: 'https://www.xiaohongshu.com/explore/abc' }, deps(async () => new Response(html, { headers: { 'content-type': 'text/html' } })));
  assert.equal(result.sources[0].accessStatus, 'fetched');
  assert.match(result.sources[0].excerpt, /正佳/);
});

test('timeouts, oversized pages, unsupported content and transport failures remain unavailable', async () => {
  const { fetchTravelPage } = await api();
  const url = 'https://www.gz.gov.cn/travel/guide.html';
  const silent = await fetchTravelPage({ url }, deps(() => new Promise(() => {})));
  assert.equal(silent.status, 'unavailable');
  assert.match(silent.sources[0].error, /超时/);
  const oversized = await fetchTravelPage({ url }, { ...deps(async () => new Response('a'.repeat(5000), { headers: { 'content-type': 'text/html' } })), maxBytes: 1024 });
  assert.equal(oversized.status, 'unavailable');
  assert.match(oversized.sources[0].error, /大小/);
  const binary = await fetchTravelPage({ url }, deps(async () => new Response('binary', { headers: { 'content-type': 'application/pdf' } })));
  assert.equal(binary.sources[0].accessStatus, 'unsupported');
  const failure = await fetchTravelPage({ url }, deps(async () => { throw new Error('secret upstream details'); }));
  assert.equal(failure.status, 'unavailable');
  assert.doesNotMatch(JSON.stringify(failure), /secret upstream/);
});

test('brief cache reuses a result while preserving original fetchedAt and expires', async () => {
  const { searchTravelWeb } = await api();
  let tick = now();
  let requests = 0;
  const config = { ...deps(async () => { requests += 1; return new Response(rss, { headers: { 'content-type': 'text/xml' } }); }), now: () => tick, cacheTtlMs: 1000 };
  const first = await searchTravelWeb({ query: '广州散步' }, config);
  tick += 300;
  const second = await searchTravelWeb({ query: '广州散步' }, config);
  assert.equal(requests, 1);
  assert.equal(second.sources[0].fetchedAt, first.sources[0].fetchedAt);
  second.sources[0].title = 'caller mutation';
  assert.notEqual((await searchTravelWeb({ query: '广州散步' }, config)).sources[0].title, 'caller mutation');
  tick += 1001;
  await searchTravelWeb({ query: '广州散步' }, config);
  assert.equal(requests, 2);
});

test('bounded research limits searches and page reads and links every query to source IDs', async () => {
  const { researchTravel } = await api();
  const calls = [];
  const config = deps(async url => {
    calls.push(String(url));
    return String(url).includes('bing.com')
      ? new Response(rss, { headers: { 'content-type': 'text/xml' } })
      : new Response('<title>广州指南</title><article>广州有不少适合步行的街区，旅行时结合天气、营业时间、出行预算以及个人偏好安排游览内容。请在出发前核实景点开放情况。</article>', { headers: { 'content-type': 'text/html' } });
  });
  const result = await researchTravel({ city: '广州', queries: ['散步', '餐饮', '更多'], urls: ['https://www.gz.gov.cn/a', 'https://www.gz.gov.cn/b'], maxSearches: 1, maxPages: 1, maxSources: 3 }, config);
  assert.equal(calls.filter(url => url.includes('bing.com')).length, 1);
  assert.equal(calls.filter(url => !url.includes('bing.com')).length, 1);
  assert.ok(result.sources.length <= 3);
  assert.equal(result.queries.length, 1);
  for (const query of result.queries) for (const id of query.sourceIds) assert.ok(result.sources.some(source => source.id === id));
});

test('unrelated Bing results use bounded public HTML fallback without reading AI answers or click trackers', async () => {
  const { searchTravelWeb } = await api();
  const calls = [];
  const result = await searchTravelWeb({ city: '广州', query: '正佳广场' }, deps(async url => {
    calls.push(String(url));
    if (String(url).includes('bing.com')) return new Response('<rss><channel><item><title>上海餐饮</title><link>https://www.ctrip.com/shanghai</link><description>上海旅行指南</description></item></channel></rss>', { headers: { 'content-type': 'text/xml' } });
    return new Response('<div class="ai-answer">AI生成：编造的攻略</div><li class="res-list"><h3 class="res-title"><a href="https://www.so.com/link?opaque=123" data-mdurl="https://www.gz.gov.cn/travel/guide.html">广州正佳广场旅游指南</a></h3><p class="res-desc">广州正佳广场位于天河商圈。</p></li>', { headers: { 'content-type': 'text/html' } });
  }));
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).hostname, 'www.so.com');
  assert.equal(result.sources[0].provider, '360');
  assert.equal(result.sources[0].url, 'https://www.gz.gov.cn/travel/guide.html');
  assert.doesNotMatch(JSON.stringify(result), /编造|opaque/);
});

test('site restrictions are enforced locally even when a search provider ignores them', async () => {
  const { searchTravelWeb } = await api();
  const result = await searchTravelWeb({ city: '广州', query: '天河 site:xiaohongshu.com' }, deps(async () => new Response(rss, { headers: { 'content-type': 'text/xml' } })));
  assert.equal(result.sources.length, 1);
  assert.equal(new URL(result.sources[0].url).hostname, 'www.xiaohongshu.com');
});

test('a redirect to a supported public note is followed without transferring any response cookies', async () => {
  const { fetchTravelPage } = await api();
  const calls = [];
  const result = await fetchTravelPage({ url: 'https://xhslink.com/a/share' }, deps(async (url, options) => {
    calls.push({ url: String(url), options });
    return calls.length === 1
      ? new Response(null, { status: 302, headers: { location: 'https://www.xiaohongshu.com/explore/abc', 'set-cookie': 'local-private=value' } })
      : new Response('<title>广州漫步</title><article>广州天河商圈可以串联体育中心、天环与正佳。这里是公开可读的个人体验，实际开放时间和交通请以出发前核实为准。</article>', { headers: { 'content-type': 'text/html' } });
  }));
  assert.equal(result.sources[0].accessStatus, 'fetched');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].options.headers.Cookie, undefined);
  assert.equal(calls[1].options.credentials, 'omit');
});

test('body streaming and parent cancellation are bounded independently of a fetch implementation', async () => {
  const { fetchTravelPage } = await api();
  const url = 'https://www.gz.gov.cn/travel/guide.html';
  const streaming = await fetchTravelPage({ url }, deps(async () => new Response(new ReadableStream({ start() {} }), { headers: { 'content-type': 'text/html' } })));
  assert.equal(streaming.status, 'unavailable');
  assert.match(streaming.sources[0].error, /超时/);
  const controller = new AbortController();
  const request = fetchTravelPage({ url }, { ...deps(() => new Promise(() => {})), signal: controller.signal });
  controller.abort();
  const aborted = await request;
  assert.match(aborted.sources[0].error, /取消/);
});

test('bounded research keeps an identified snippet but discloses a failed attempt to read its page', async () => {
  const { researchTravel } = await api();
  const result = await researchTravel({ city: '广州', queries: ['天河 site:xiaohongshu.com'], maxPages: 1 }, deps(async url => String(url).includes('bing.com')
    ? new Response(rss, { headers: { 'content-type': 'text/xml' } })
    : new Response('<title>小红书</title><body>登录后查看完整内容 扫码登录</body>', { headers: { 'content-type': 'text/html' } })));
  assert.equal(result.status, 'partial');
  assert.equal(result.sources[0].accessStatus, 'search-snippet');
  assert.equal(result.sources[0].pageAccessStatus, 'blocked');
  assert.match(result.sources[0].pageReadError, /登录/);
});
