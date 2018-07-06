// @flow

import Chrome from './chrome';

const extract = ({ document, window: { URL } }, { asin }) => {
  const $ = selector => document.querySelector(selector);
  const $s = selector => document.querySelectorAll(selector);
  const $t = selector => $(selector).textContent.trim();

  // TODO: make sure asin is not parent asin

  const productDetails = [].map.call(
    $s([
      '#detailBullets_feature_div>ul>li',
      '#detail-bullets .content>ul>li',
      '#productDetails_detailBullets_sections1>tbody>tr',
      '#prodDetails tr',
      '#prodDetails li',
      '#detailBullets li',
      '#detailBullets tr',
    ].join(',')),
    e => e.textContent.trim().replace(/\s+/g, ' ')
  );

  return [{
    // parent,
    title: () => $t('#productTitle'),

    parent: () => {
      const variationDataRaw = $t('#twisterJsInitializer_feature_div');
      const { parentAsin } = new Function('return' + variationDataRaw.substring(
        variationDataRaw.indexOf('var dataToReturn = ') + 19,
        variationDataRaw.indexOf('return dataToReturn;')
      ))();
      return parentAsin;
    },

    brand: [
      () => $t('#bylineInfo'),
      () => new URL($('#brand').href).searchParams.get('field-lbr_brands_browse-bin')
    ],

    feature: () => [].map.call($s('#feature-bullets ul>li:not([id])'), e => e.textContent.trim()),

    // TODO: handle book description
    description: () => [
      $('#aplus .aplus-v2') && $('#aplus .aplus-v2').innerHTML.trim(),
      $('#productDescription') && $('#productDescription').innerHTML.trim()
    ].filter(d => d),

    // salePrice,
    price: () => $('#priceblock_ourprice') && $t('#priceblock_ourprice'),
    listPrice: () => $('#listPriceLegalMessage') &&
      $('#listPriceLegalMessage').previousElementSibling.textContent.trim(),

    weight: [
      () => productDetails.find(d => d.includes('Shipping Weight')),
      () => productDetails.find(d => d.includes('Item Weight')),
    ],
    dimensions: [
      () => productDetails.find(d => d.includes('Package Dimensions')),
      () => productDetails.find(d => d.includes('Product Dimensions')),
    ],

    images: () => [].map.call(
      $s('#altImages li:not(.aok-hidden) img'),
      e => e.src.replace('_US40_', '_UL900_')
    ).filter(u => u.includes('/images/I/')),

    attributes: () => {
      const variationDataRaw = $t('#twisterJsInitializer_feature_div');
      const {
        dimensionValuesDisplayData: { [asin]: dimensionsValue = [] } = {},
        dimensionsDisplay: dimensionsName = []
      } = new Function('return' + variationDataRaw.substring(
        variationDataRaw.indexOf('var dataToReturn = ') + 19,
        variationDataRaw.indexOf('return dataToReturn;')
      ))();
      return dimensionsName.map((name, index) => ({ name, value: dimensionsValue[index] }));
    },

    similar: () => JSON.parse($(
      [
        '#purchase-sims-feature>div',
        '#desktop-dp-sims_purchase-similarities-sims-feature>div',
        '#desktop-dp-sims_hardlines-day0-sims-feature>div'
      ].join(', ')
    ).getAttribute('data-a-carousel-options')).ajax.id_list,

    // TODO: parse other categories later
    categories: () => [].map.call(
      $s('#wayfinding-breadcrumbs_feature_div li>.a-list-item>a'),
      e => ({ node: e.href.match(/node=(\d+)/)[1], title: e.textContent.trim() })
    )
  }].map(product => Object.entries(product).reduce((o, [k, f]) => ({
    ...o,
    [k]: (() => {
      const errors = [];
      for (const g of Array.isArray(f) ? f: [f]) {
        try { return { success: true, value: g() }; } catch (e) { errors.push(e.message); }
      }
      return { success: false, errors };
    })()
  }), {})).pop();
};


export const scrape = async (asins: Array<string>) => {
  const chrome = new Chrome();
  await chrome.start();

  const start = Date.now();

  const results = await Promise.all(asins.map(async asin => {
    try {
      const target = await chrome.newTab();
      const { connectedAt, loadedAt } = await chrome.navigate(target, {
        url: `https://www.amazon.com/dp/${asin}?psc=1`
      });
      const result = await chrome.evaluate(target, extract, { asin });
      const foundAt = Date.now();
      await chrome.closeTab(target);
      return {
        asin,
        elapsed: {
          connect: connectedAt - start,
          fetch: loadedAt - connectedAt,
          find: foundAt - loadedAt,
          total: foundAt - start
        },
        ...result,
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        asin,
        error: error.message,
        updatedAt: new Date().toISOString()
      };
    }
  }));

  console.dir(results, { depth: null });

  return { chrome, results };
};
