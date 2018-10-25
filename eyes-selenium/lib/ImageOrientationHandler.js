'use strict';

/* eslint-disable no-unused-vars */

/**
 * @interface
 */
class ImageOrientationHandler {
  // noinspection JSMethodCanBeStatic
  /**
   * @param {IWebDriver} driver
   * @return {Promise<boolean>}
   */
  async isLandscapeOrientation(driver) {
    throw Error('Method is not implemented!');
  }

  // noinspection JSMethodCanBeStatic
  /**
   * @param {Logger} logger
   * @param {IWebDriver} driver
   * @param {MutableImage} image
   * @return {Promise<boolean>}
   */
  async tryAutomaticRotation(logger, driver, image) {
    throw Error('Method is not implemented!');
  }
}

exports.ImageOrientationHandler = ImageOrientationHandler;