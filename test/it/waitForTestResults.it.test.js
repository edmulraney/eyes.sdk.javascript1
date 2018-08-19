'use strict';
const {describe, it, before, after, beforeEach, afterEach} = require('mocha');
const {expect} = require('chai');
const testServer = require('../util/testServer');
const makeRenderingGridClient = require('../../src/sdk/renderingGridClient');
const {initConfig} = require('../../src/sdk/config');
const {getConfig, updateConfig, getInitialConfig} = initConfig();
const nock = require('nock');
const createFakeWrapper = require('../util/createFakeWrapper');
const {promisify: p} = require('util');
const psetTimeout = p(setTimeout);
const {presult} = require('@applitools/functional-commons');

describe('waitForTestResults', () => {
  let waitForTestResults, openEyes;
  const apiKey = 'some api key';

  beforeEach(() => {
    const client = makeRenderingGridClient({
      getConfig,
      updateConfig,
      getInitialConfig,
      showLogs: process.env.APPLITOOLS_SHOW_LOGS,
    });

    waitForTestResults = client.waitForTestResults;
    openEyes = client.openEyes;
  });

  let baseUrl, closeServer;
  before(async () => {
    const server = await testServer({port: 3456}); // TODO fixed port avoids 'need-more-resources' for dom. Is this desired? should both paths be tested?
    baseUrl = `http://localhost:${server.port}`;
    closeServer = server.close;
  });

  after(async () => {
    await closeServer();
  });

  let wrapper;
  beforeEach(() => {
    wrapper = createFakeWrapper(baseUrl);

    nock(wrapper.baseUrl)
      .persist()
      .post(wrapper.resultsRoute)
      .reply(201, '', {location: 'uploaded_location'});
  });

  let prevEnv;
  beforeEach(() => {
    prevEnv = process.env;
    process.env = {};
  });

  afterEach(() => {
    process.env = prevEnv;
  });

  it('throws errors set during openEyes', async () => {
    wrapper.getRenderInfo = async () => {
      await psetTimeout(0);
      throw new Error('getRenderInfo');
    };
    const {checkWindow, close} = await openEyes({
      wrappers: [wrapper],
      apiKey,
    });

    await checkWindow({cdt: [], url: ''});
    expect((await presult(close()))[0].message).to.equal('getRenderInfo');
    const [err] = await presult(waitForTestResults());

    expect(err.message).to.equal('getRenderInfo');
  });

  it('throws errors set during checkWindow', async () => {
    wrapper.checkWindow = async () => {
      psetTimeout(0);
      throw new Error('checkWindow');
    };
    const {checkWindow, close} = await openEyes({
      wrappers: [wrapper],
      apiKey,
    });

    await checkWindow({cdt: [], url: ''});
    expect((await presult(close()))[0].message).to.equal('checkWindow');
    const [err] = await presult(waitForTestResults());

    expect(err.message).to.equal('checkWindow');
  });

  it('throws errors set during close', async () => {
    let count = 0;
    const closePromises = [];
    wrapper.close = async () => {
      psetTimeout(0);
      throw new Error(`close_${count++}`);
    };
    const {checkWindow, close} = await openEyes({
      wrappers: [wrapper],
      apiKey,
    });

    await checkWindow({cdt: [], url: ''});
    closePromises.push(close());

    const {checkWindow: checkWindow2, close: close2} = await openEyes({
      wrappers: [wrapper],
      apiKey,
    });

    await checkWindow2({cdt: [], url: ''});
    closePromises.push(close2());

    const [err] = await presult(waitForTestResults(closePromises));
    expect(err.message).to.equal('close_0');

    expect((await presult(closePromises[0]))[0].message).to.equal('close_0');
    expect((await presult(closePromises[1]))[0].message).to.equal('close_1');
  });

  it('returns close results if no errors found', async () => {
    const {checkWindow, close} = await openEyes({
      wrappers: [createFakeWrapper(baseUrl)],
      apiKey,
    });
    const closePromises = [];

    checkWindow({cdt: [], url: ''});
    closePromises.push(close());

    const {checkWindow: checkWindow2, close: close2} = await openEyes({
      wrappers: [createFakeWrapper(baseUrl)],
      apiKey,
    });

    checkWindow2({cdt: [], url: ''});
    closePromises.push(close2());

    const closeResults = await waitForTestResults(closePromises);
    expect(closeResults.map(closeResult => closeResult[0].map(r => r.getAsExpected()))).to.eql([
      [true],
      [true],
    ]);
  });
});