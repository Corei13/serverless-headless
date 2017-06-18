// @flow

import Chrome from './chrome';

const extract = ({ document }) => {
  const results = [];
  document.body
    .querySelectorAll('[id^=result_][data-asin]')
    .forEach((e, position) => {
      const asin = e.getAttribute('data-asin');
      const f = e.querySelector(`span[name="${asin}"]`);
      let rating = 0, numReviews = 0;
      try {
        const { textContent: ratingText } = f.querySelector('.a-icon-star>span');
        [rating] = ratingText.match(/^[\d.]+/).map(Number) || [0];
        numReviews = Number(f.nextElementSibling.textContent.replace(',', '')) || 0;
      } catch (e) {}

      results.push({
        position, asin, rating, numReviews,
        sponsored: !!e.querySelector('.s-sponsored-info-icon')
      });
    });
  return results;
};

export const test = async (event: Object, context: Object, callback: Function) => {
  try {
    const chrome = new Chrome();
    await chrome.start();


    const { keyword, page } = event.queryStringParameters;
    const ctime = Math.round(Date.now() / 1000 - 15 + Math.random() * 5);
    const url = page === 1
      ? `https://www.amazon.com/s/ref=sr_nr_p_85_0?fst=as:off&rh=i:aps,k:${keyword},p_85:2470955011&keywords=${keyword}&ie=UTF8&qid=${ctime}&rnid=2470954011`
      : `https://www.amazon.com/s/ref=sr_pg_${page}?fst=as:off&rh=i:aps,k:${keyword},p_85:2470955011&page=${page}&keywords=${keyword}&ie=UTF8&qid=${ctime}`;

    const start = Date.now();
    const { connectedAt, loadedAt } = await chrome.navigate({ url });
    const results = await chrome.evaluate(extract);
    const foundAt = Date.now();

    callback(null, {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: keyword,
        page,
        elapsed: {
          connect: connectedAt - start,
          fetch: loadedAt - connectedAt,
          find: foundAt - loadedAt,
          total: foundAt - start
        },
        totalResults: results.length,
        results,
        updatedAt: new Date().toISOString()
      })
    });

    chrome.kill();
  } catch (err) {
    callback(err);
  }
};

export const screenshot = async (event: Object, context: Object, callback: Function) => {
  try {
    const chrome = new Chrome();
    await chrome.start();

    const { url, width, height } = event.queryStringParameters;
    await chrome.navigate({ url });

    callback(null, {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png'
      },
      body: await chrome.screenshot({ width: Number(width), height: Number(height) })
    });

    chrome.kill();
  } catch (err) {
    callback(err);
  }
};
