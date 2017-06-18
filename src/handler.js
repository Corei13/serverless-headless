import path from 'path';

import Chrome from './chrome';

export const run = async (event, context, callback) => {
  try {
    const chromePath = process.env.NODE_ENV === 'headless' ?
      path.resolve(__dirname, './chrome/headless_shell') : undefined;

    const chrome = new Chrome({
      headless: process.env.NODE_ENV === 'headless',
      chromePath
    });
    const pid = await chrome.start();
    console.log('Chrome started with pid:', pid);
    callback(null, { success: true, event, pid });

    chrome.kill();
  } catch (err) {
    callback(err);
  }
};
