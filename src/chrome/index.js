// @flow

import path from 'path';
// import fs from 'fs';
import EventEmitter from 'events';
// import { launch } from 'chrome-launcher';
import CDP from 'chrome-remote-interface';
import launchChrome from '@serverless-chrome/lambda';
import { randomUserAgent } from './user-agents';

export default class Chrome {
  runs: number = 0;
  protocols: {
    [id: string]: {
      Page: Object,
      Runtime: Object,
      DOM: Object,
      Emulation: Object
    }
  } = {};
  listeners: { [id: string]: EventEmitter } = {};
  flags: Array<string> = [];
  kill: Function = () => { throw Error('Not implemented'); };
  port: number;

  constructor({
    headless = !!process.env.HEADLESS,
    height = 1280, width = 1696,
    // proxy
  }: {
    headless?: boolean,
    height?: number, width?: number,
    // proxy?: string
  } = {}) {
    this.flags = [
      headless ? '--headless' : '',
      // proxy ? `--proxy-server="${proxy}"` : '',
      // proxy ? '--host-resolver-rules="MAP * 0.0.0.0 , EXCLUDE 127.0.0.1"' : '', // FIXME
      `--user-agent="${randomUserAgent()}"`,
      `--window-size=${height},${width}`,
      '--disable-gpu',
      '--enable-logging',
      '--log-level=0',
      '--v=99',
	    // '--single-process', // fixme
	    '--no-sandbox'
    ];
  }

  async launch() {
    console.log(this.flags);
    return new Promise((resolve, reject) =>
      launchChrome({
        // chromePath: process.env.SERVERLESS ? path.resolve(__dirname, './headless_shell') : undefined,
        flags: this.flags
      }).then(resolve, reject)
    );
  }

  async start() {
    const chrome = await this.launch();
    this.kill = () => chrome.kill();
    this.port = chrome.port;

    console.log('Chrome started with port', chrome.port);
    return chrome.pid;
  }

  async newTab() {
    const target = await new Promise((resolve, reject) =>
      CDP.New((err, target) => err ? reject(err) : resolve(target)));

    // const tabs = await CDP.List({ port: this.port });

    this.protocols[target.id] = await new Promise((resolve, reject) =>
      CDP({ port: this.port, target }, protocol => resolve(protocol))
        .on('error', err => reject(Error('Cannot connect to Chrome:' + err)))
    );

    const { Page, Runtime } = this.protocols[target.id];
    await Promise.all([Page.enable(), Runtime.enable()]);

    // Page.loadEventFired((...args) => {
    //   this.listener.emit('pageLoaded', ...args);
    // });

    this.listeners[target.id] = new EventEmitter();
    Page.domContentEventFired((...args) => {
      this.listeners[target.id].emit(`domContentEventFired[${target.id}]`, ...args);
    });

    return target.id;
  }

  untilLoaded(target: string) {
    return new Promise(resolve => {
      const listener = event => () => {
        this.listeners[target].removeListener(event, listener(event));
        console.log('New event:', event);
        resolve();
      };
      this.listeners[target].on(
        `domContentEventFired[${target}]`,
        listener(`domContentEventFired[${target}]`)
      );
    });
  }

  async navigate(target: string, { url }: { url: string }) {
    await this.protocols[target].Page.navigate({ url });
    const connectedAt = Date.now();
    await this.untilLoaded(target);
    const loadedAt = Date.now();
    this.runs += 1;

    return { connectedAt, loadedAt };
  }

  async evaluate(target: string, fn: Function, context: Object = {}, evaluateArgs: Object = {}) {
    const { Runtime } = this.protocols[target];
    const expression = `(${fn.toString()})({ document, window }, ${JSON.stringify(context)})`;
    const result = await Runtime.evaluate({ expression, returnByValue: true, ...evaluateArgs });
    // logger.info('Expression:');
    // logger.debug(expression);
    // logger.info('Result:');
    // logger.debug(result);
    return result.result.value;
  }

  evaluateAsync(target: string, fn: Function, context: Object = {}) {
    return this.evaluate(target, fn, context, { awaitPromise: true });
  }

  async screenshot(target: string, { width = 1440, height = 900 }: { width: number, height: number } = {}) {
    // If the `full` CLI option was passed, we need to measure the height of
    // the rendered page and use Emulation.setVisibleSize
    const { DOM, Emulation, Page } = this.protocols[target];
    await DOM.enable();

    const deviceMetrics = {
      width: width,
      height: height,
      deviceScaleFactor: 0,
      mobile: false,
      fitWindow: false,
    };

    await Emulation.setDeviceMetricsOverride(deviceMetrics);
    await Emulation.setVisibleSize({ width, height });

    const { root: { nodeId: documentNodeId }} = await DOM.getDocument();
    const { nodeId: bodyNodeId } = await DOM.querySelector({
      selector: 'body',
      nodeId: documentNodeId
    });
    const { model: { height: fullHeight }} = await DOM.getBoxModel({ nodeId: bodyNodeId });

    await Emulation.setVisibleSize({ width, height: fullHeight });
    await Emulation.forceViewport({ x: 0, y: 0, scale: 1 });

    const { data } = await Page.captureScreenshot({ format: 'jpeg', quality: 60 });

    return data;
    // const buffer = new Buffer(screenshot.data, 'base64');
    // return new Promise((resolve, reject) => fs.writeFile(
    //   '/tmp/output.png', buffer, 'base64', err => {
    //     if (err) {
    //       reject(err);
    //     } else {
    //       console.log('Screenshot saved');
    //       resolve();
    //     }
    //   }
    // ));
  }

  async closeTab(target: string) {
    delete this.protocols[target];
    delete this.listeners[target];

    return new Promise((resolve, reject) =>
      CDP.Close({ id: target }, err => err ? reject(err) : resolve()));
  }

  async closeAllTabs() {
    await Promise.all(Object.keys(this.protocols).map(target => this.closeTab(target)));
  }
}
