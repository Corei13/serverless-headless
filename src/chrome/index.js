// @flow

import EventEmitter from 'events';
import { Launcher as ChromeLauncher } from 'lighthouse/chrome-launcher/chrome-launcher';
import CDP from 'chrome-remote-interface';
import { randomUserAgent } from './user-agents';

export default class Chrome extends ChromeLauncher {
  port: number;
  runs: number = 0;
  protocol: { Page: Object, Runtime: Object };
  listener: EventEmitter = new EventEmitter();

  constructor({
    chromePath,
    port = 9222, headless = false,
    height = 1280, width = 1696
  }: {
    chromePath?: string,
    port?: number, headless?: boolean,
    height?: number, width?: number
  } = {}) {
    super({
      port,
      chromePath,
      chromeFlags: [
        headless ? '--headless' : '',
        `--user-agent="${randomUserAgent()}"`,
        `--window-size=${height},${width}`,
        '--disable-gpu',
        '--enable-logging',
        '--log-level=0',
        '--v=99',
        '--single-process', // fixme
        '--no-sandbox',
      ]
    });
    this.port = port;
  }

  async start() {
    await this.launch();

    const tabs = await CDP.List({ port: this.port });
    console.log(tabs.find(t => t.type === 'page'));
    this.protocol = await new Promise((resolve, reject) =>
      CDP({ port: this.port, target: tabs.find(t => t.type === 'page') }, protocol => resolve(protocol))
        .on('error', err => reject(Error('Cannot connect to Chrome:' + err)))
    );

    // HACK
    if (this.chrome) {
      this.chrome.removeAllListeners();
      this.chrome.unref();
    }

    const { Page, Runtime } = this.protocol;
    await Promise.all([Page.enable(), Runtime.enable()]);

    Page.loadEventFired((...args) => {
      console.log('pageLoaded with', args);
      this.listener.emit('pageLoaded', ...args);
    });

    return this.pid;
  }

  untilLoaded() {
    return new Promise(resolve => {
      const listener = () => {
        this.listener.removeListener('pageLoaded', listener);
        console.log('Holy shit! Page loaded');
        resolve();
      };
      this.listener.on('pageLoaded', listener);
    });
  }

  async navigate({ url }: { url: string }) {
    await this.protocol.Page.navigate({ url });
    const connectedAt = Date.now();
    await this.untilLoaded();
    const loadedAt = Date.now();
    this.runs += 1;

    return { connectedAt, loadedAt };
  }

  async evaluate(fn: Function, context: Object = {}, evaluateArgs: Object = {}) {
    const { Runtime } = this.protocol;
    const expression = `(${fn.toString()})({ document, window }, ${JSON.stringify(context)})`;
    console.log(expression);
    const result = await Runtime.evaluate({ expression, returnByValue: true, ...evaluateArgs });
    console.log(result);
    return result.result.value;
  }

  evaluateAsync(fn: Function, context: Object = {}) {
    return this.evaluate(fn, context, { awaitPromise: true });
  }
}
