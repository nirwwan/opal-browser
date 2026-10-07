'use strict';
// End-to-end tests drive the real Electron app (see test/e2e/helpers.js).
module.exports = {
  testDir: 'test/e2e',
  timeout: 120000,
  workers: 1,
  retries: 1, // the dev machine (2 cores, 2.7 GB) sometimes times out under memory pressure
  reporter: [['list']],
};
