'use strict';
const uploadResource = require('./uploadResource');
const absolutizeUrl = require('./absolutizeUrl');
const mapKeys = require('lodash.mapkeys');
const mapValues = require('lodash.mapvalues');
const saveData = require('../troubleshoot/saveData');
const createRenderRequests = require('./createRenderRequests');
const createCheckSettings = require('./createCheckSettings');
const {presult} = require('@applitools/functional-commons');

function makeCheckWindow({
  getError,
  saveDebugData,
  extractCssResourcesFromCdt,
  getBundledCssFromCdt,
  renderBatch,
  waitForRenderedStatus,
  getAllResources,
  renderInfoPromise,
  logger,
  getCheckWindowPromises,
  setCheckWindowPromises,
  browsers,
  setError,
  resourceCache,
  wrappers,
  renderWrapper,
  renderThroat,
}) {
  return async function checkWindow({
    resourceUrls = [],
    resourceContents = {},
    url,
    cdt,
    tag,
    sizeMode = 'full-page',
    selector,
    region,
    domCapture,
    scriptHooks,
    ignore,
  }) {
    if (getError()) {
      throw getError();
    }
    const resourceUrlsWithCss = resourceUrls.concat(extractCssResourcesFromCdt(cdt, url));
    const absoluteUrls = resourceUrlsWithCss.map(resourceUrl => absolutizeUrl(resourceUrl, url));
    const absoluteResourceContents = mapValues(
      mapKeys(resourceContents, (_value, key) => absolutizeUrl(key, url)),
      ({url: resourceUrl, type, value}) => ({url: absolutizeUrl(resourceUrl, url), type, value}),
    );

    const getResourcesPromise = getAllResources(absoluteUrls, absoluteResourceContents);
    const renderPromise = presult(startRender());
    const uploadPromise = presult(uploadDom());

    let renderJobs; // This will be an array of `resolve` functions to rendering jobs. See `createRenderJob` below.

    setCheckWindowPromises(
      browsers.map((_browser, i) => checkWindowJob(getCheckWindowPromises()[i], i).catch(setError)),
    );

    async function checkWindowJob(prevJobPromise = presult(Promise.resolve()), index) {
      if (getError()) {
        logger.log(
          `aborting checkWindow - not waiting for render to complete (so no renderId yet)`,
        );
        return;
      }

      const [renderErr, renderIds] = await renderPromise;

      if (renderJobs) {
        renderJobs[index]();
      }

      if (getError()) {
        logger.log(
          `aborting checkWindow after render request complete but before waiting for rendered status`,
        );
        return;
      }

      if (renderErr) {
        setError(renderErr);
        return;
      }

      const renderId = renderIds[index];

      logger.log(
        `render request complete for ${renderId}. tag=${tag} sizeMode=${sizeMode} browser: ${JSON.stringify(
          browsers[index],
        )}`,
      );
      const [{imageLocation, userAgent}] = await waitForRenderedStatus(
        [renderId],
        renderWrapper,
        getError,
      );

      if (imageLocation) {
        logger.log(`screenshot available for ${renderId} at ${imageLocation}`);
      } else {
        logger.log(`screenshot NOT available for ${renderId}`);
      }

      const wrapper = wrappers[index];
      wrapper.setInferredEnvironment(`useragent:${userAgent}`);

      await prevJobPromise;

      if (getError()) {
        logger.log(
          `aborting checkWindow for ${renderId} because there was an error in some previous job`,
        );
        return;
      }

      const [uploadErr, domUrl] = await uploadPromise;
      if (uploadErr) {
        setError(uploadErr);
        return;
      }

      const checkSettings = createCheckSettings({ignore});

      await wrapper.checkWindow({screenshotUrl: imageLocation, tag, domUrl, checkSettings});
    }

    async function startRender() {
      const renderInfo = await renderInfoPromise;

      if (getError()) {
        logger.log(`aborting startRender because there was an error in getRenderInfo`);
        return;
      }

      const resources = await getResourcesPromise;

      if (getError()) {
        logger.log(`aborting startRender because there was an error in getAllResources`);
        return;
      }

      const renderRequests = createRenderRequests({
        url,
        resources,
        cdt,
        browsers,
        renderInfo,
        sizeMode,
        selector,
        region,
        scriptHooks,
      });

      let renderIds = await renderThroat(() => renderBatch(renderRequests, renderWrapper));
      renderJobs = renderIds.map(createRenderJob);

      if (saveDebugData) {
        for (const renderId of renderIds) {
          await saveData({renderId, cdt, resources, url, logger});
        }
      }

      return renderIds;
    }

    async function uploadDom() {
      const renderInfo = await renderInfoPromise;
      const bundledCss = getBundledCssFromCdt(cdt, resourceCache, url);
      return await uploadResource(
        renderInfo.getResultsUrl(),
        JSON.stringify({dom: domCapture, css: bundledCss}),
      );
    }
  };

  /**
   * Run a function down the renderThroat and return a way to resolve it. Once resolved (in another place) it makes room in the throat for the next renders that
   */
  function createRenderJob() {
    let resolve;
    const p = new Promise(res => (resolve = res));
    renderThroat(() => p);
    return resolve;
  }
}

module.exports = makeCheckWindow;