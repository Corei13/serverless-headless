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
      '#productDetails_detailBullets_sections1>tbody>tr'
    ].join(',')),
    e => e.textContent.trim().replace(/\s+/g, ' ')
  );

  return [{
    // parent,
    title: () => $t('#productTitle'),

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
    dimensions: () => productDetails.find(d => d.includes('Product Dimensions')),

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
      e => [e.href.match(/node=(\d+)/)[1], e.textContent.trim()]
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
  }), {}));
};


export const scrape = async (asin: string) => {
  const chrome = new Chrome();
  await chrome.start();

  const url = `https://www.amazon.com/dp/${asin}?psc=1`;

  const start = Date.now();
  const { connectedAt, loadedAt } = await chrome.navigate({ url });
  const results = await chrome.evaluate(extract, { asin });
  const foundAt = Date.now();

  console.dir(results, { depth: null });

  return {
    chrome,
    results: {
      asin,
      elapsed: {
        connect: connectedAt - start,
        fetch: loadedAt - connectedAt,
        find: foundAt - loadedAt,
        total: foundAt - start
      },
      totalResults: results.length,
      results,
      updatedAt: new Date().toISOString()
    }
  };
};
