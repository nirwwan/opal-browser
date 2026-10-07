'use strict';
// What stable Google Chrome on Linux sends for Opal's bundled Chromium version:
// the reduced user agent string and the User-Agent Client Hints brand list.
// Sites (Google sign-in in particular) compare these; Electron's own values say
// "Chromium" only and send no Sec-CH-UA headers, which gives it away.

// Reduced UA, as Chrome sends it since UA reduction: minor/build/patch are zeros.
function chromeUserAgent(fullVersion) {
  const major = String(fullVersion).split('.')[0];
  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

// Chromium's brand list algorithm (components/embedder_support/user_agent_utils.cc,
// GenerateBrandVersionList / GetGreasedUserAgentBrandVersion), seeded by the major
// version, with "Google Chrome" as the brand. full=true gives full versions.
function chromeBrands(fullVersion, { full = false } = {}) {
  const major = Number(String(fullVersion).split('.')[0]);
  const version = full ? String(fullVersion) : String(major);
  const chars = [' ', '(', ':', '-', '.', '/', ')', ';', '=', '?', '_'];
  const versions = ['8', '99', '24'];
  const grease = {
    brand: `Not${chars[major % chars.length]}A${chars[(major + 1) % chars.length]}Brand`,
    version: versions[major % versions.length] + (full ? '.0.0.0' : ''),
  };
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const order = orders[major % 6];
  const list = new Array(3);
  list[order[0]] = grease;
  list[order[1]] = { brand: 'Chromium', version };
  list[order[2]] = { brand: 'Google Chrome', version };
  return list;
}

// Structured-header form: "Chromium";v="152", "Not?A_Brand";v="24", ...
function brandHeader(brands) {
  return brands.map((b) => `"${b.brand}";v="${b.version}"`).join(', ');
}

// Request headers Chrome would send. `requested` is the set of high-entropy hint
// names (lowercase) the origin asked for with Accept-CH / Critical-CH.
function clientHintHeaders(fullVersion, requested = new Set(), { arch = 'x86', bitness = '64', platformVersion = '' } = {}) {
  const h = {
    'sec-ch-ua': brandHeader(chromeBrands(fullVersion)),
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Linux"',
  };
  const extra = {
    'sec-ch-ua-full-version-list': () => brandHeader(chromeBrands(fullVersion, { full: true })),
    'sec-ch-ua-full-version': () => `"${fullVersion}"`,
    'sec-ch-ua-platform-version': () => `"${platformVersion}"`,
    'sec-ch-ua-arch': () => `"${arch}"`,
    'sec-ch-ua-bitness': () => `"${bitness}"`,
    'sec-ch-ua-model': () => '""',
    'sec-ch-ua-wow64': () => '?0',
    'sec-ch-ua-form-factors': () => '"Desktop"',
  };
  for (const name of requested) if (extra[name]) h[name] = extra[name]();
  return h;
}

// Parses an Accept-CH / Critical-CH header value into lowercase hint names.
function parseAcceptCH(value) {
  return String(value || '').split(',').map((s) => s.trim().toLowerCase()).filter((s) => /^sec-ch-ua/.test(s));
}

module.exports = { chromeUserAgent, chromeBrands, brandHeader, clientHintHeaders, parseAcceptCH };
